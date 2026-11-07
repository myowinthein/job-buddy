import { wrapStorageArea } from '@/src/utils/storageArea';
import { getGeminiSettings, getProfile } from '@/src/utils/storage';
import { calculateCompletion } from '@/src/utils/profileCompletion';
import { AUTOFILL_ERROR } from './errorCodes';

export const RUN_PREFIX = 'jb:autofill-run:';
export const RUN_ALARM_PREFIX = 'jb:autofill-recover:';
const RUN_LIMIT_MS = 5 * 60_000;
export interface RunFrame {
  frameId: number;
  documentId?: string;
}
export interface AutofillRun {
  tabId: number;
  runId: string;
  startedAt: number;
  sourceDocumentId?: string;
  expiresAt?: number;
  stage: 'scanning' | 'confirming' | 'filling' | 'completed' | 'error';
  frames: RunFrame[];
  mode?: 'merge' | 'overwrite';
  error?: string;
  results?: unknown[];
}
interface RunDependencies {
  read: (tabId: number) => Promise<AutofillRun | null>;
  write: (tabId: number, run: AutofillRun | null) => Promise<void>;
  frames: (tabId: number) => Promise<RunFrame[]>;
  send: (
    run: AutofillRun,
    frame: RunFrame,
    message: { action: string; runId?: string; mode?: 'merge' | 'overwrite' },
  ) => Promise<unknown>;
  alarm: (tabId: number, pending: boolean) => Promise<void>;
  setup?: () => Promise<string | undefined>;
}
const pending = (run: AutofillRun) => run.stage === 'scanning' || run.stage === 'filling';

/** Coordinates metadata only. Profile values and DOM work stay in the source documents. */
export class AutofillCoordinator {
  private queues = new Map<number, Promise<unknown>>();
  private running = new Map<number, { runId: string; work: Promise<AutofillRun | null> }>();
  constructor(private deps: RunDependencies) {}

  private exclusive<T>(tabId: number, action: () => Promise<T>): Promise<T> {
    const result = (this.queues.get(tabId) ?? Promise.resolve()).then(action, action);
    const tail = result.catch(() => {});
    this.queues.set(tabId, tail);
    return result.finally(() => {
      if (this.queues.get(tabId) === tail) this.queues.delete(tabId);
    });
  }

  private async update(run: AutofillRun): Promise<boolean> {
    return this.exclusive(run.tabId, async () => {
      const current = await this.deps.read(run.tabId);
      if (
        current?.runId !== run.runId ||
        current.stage === 'error' ||
        current.stage === 'completed'
      )
        return false;
      await this.deps.write(run.tabId, run);
      await this.deps.alarm(run.tabId, pending(run));
      return true;
    });
  }

  async start(
    tabId: number,
    mode?: 'merge' | 'overwrite',
    sourceDocumentId?: string,
  ): Promise<AutofillRun | null> {
    const run = await this.exclusive(tabId, async () => {
      const existing = await this.deps.read(tabId);
      if (existing && (pending(existing) || existing.stage === 'confirming')) return existing;
      let error = await this.deps.setup?.();
      const frames = error ? [] : await this.deps.frames(tabId);
      if (!error && sourceDocumentId && frames.find((frame) => frame.frameId === 0)?.documentId !== sourceDocumentId)
        error = AUTOFILL_ERROR.pageChanged;
      const run: AutofillRun = {
        sourceDocumentId: frames.find((frame) => frame.frameId === 0)?.documentId,
        tabId,
        runId: crypto.randomUUID(),
        startedAt: Date.now(),
        expiresAt: Date.now() + RUN_LIMIT_MS,
        stage: error ? 'error' : 'scanning',
        frames,
        ...(mode ? { mode } : {}),
        ...(error ? { error } : {}),
      };
      await this.deps.write(tabId, run);
      await this.deps.alarm(tabId, pending(run));
      return run;
    });
    return pending(run) ? this.drive(run) : run;
  }

  async confirm(tabId: number, runId: string, mode: 'merge' | 'overwrite') {
    const run = await this.exclusive(tabId, async () => {
      const current = await this.deps.read(tabId);
      if (!current || current.runId !== runId) return null;
      if (current.stage !== 'confirming') return current;
      const error = await this.deps.setup?.();
      const next: AutofillRun = {
        ...current,
        stage: error ? 'error' : 'filling',
        expiresAt: Date.now() + RUN_LIMIT_MS,
        mode,
        ...(error ? { error } : {}),
      };
      await this.deps.write(tabId, next);
      await this.deps.alarm(tabId, pending(next));
      return next;
    });
    return run && pending(run) ? this.drive(run) : run;
  }

  async status(tabId: number): Promise<AutofillRun | null> {
    const run = await this.deps.read(tabId);
    if (!run) return null;
    if (pending(run) && Date.now() > (run.expiresAt ?? run.startedAt + RUN_LIMIT_MS)) {
      const expired: AutofillRun = { ...run, stage: 'error', error: AUTOFILL_ERROR.failed };
      if (!(await this.update(expired))) return this.deps.read(tabId);
      void Promise.all(
        run.frames.map((frame) =>
          this.deps
            .send(run, frame, { action: 'AUTOFILL_CANCEL', runId: run.runId })
            .catch(() => {}),
        ),
      );
      return expired;
    }
    if (pending(run)) void this.drive(run).catch(() => {});
    return run;
  }

  async navigated(tabId: number, documentId?: string): Promise<void> {
    const run = await this.deps.read(tabId);
    if (
      run &&
      (!documentId ||
        (run.sourceDocumentId ?? run.frames.find((frame) => frame.frameId === 0)?.documentId) !==
          documentId)
    )
      await this.cancel(tabId, run.runId);
  }

  async recover(tabId: number): Promise<void> {
    const run = await this.status(tabId);
    if (run && pending(run)) await this.deps.alarm(tabId, true);
  }

  async cancel(tabId: number, runId?: string): Promise<void> {
    const previous = await this.exclusive(tabId, async () => {
      const current = await this.deps.read(tabId);
      if (!current || (runId && current.runId !== runId)) return null;
      await this.deps.write(tabId, null);
      await this.deps.alarm(tabId, false);
      return current;
    });
    if (previous)
      await Promise.all(
        previous.frames.map((frame) =>
          this.deps
            .send(previous, frame, { action: 'AUTOFILL_CANCEL', runId: previous.runId })
            .catch(() => {}),
        ),
      );
  }

  private drive(run: AutofillRun): Promise<AutofillRun | null> {
    const existing = this.running.get(run.tabId);
    if (existing?.runId === run.runId) {
      return existing.work.then((result) =>
        run.stage === 'filling' && result?.stage === 'confirming' ? this.drive(run) : result,
      );
    }
    const work = this.perform(run).finally(() => {
      if (this.running.get(run.tabId)?.work === work) this.running.delete(run.tabId);
    });
    this.running.set(run.tabId, { runId: run.runId, work });
    return work;
  }

  private async perform(initial: AutofillRun): Promise<AutofillRun | null> {
    let run = initial;
    try {
      const frames = await this.deps.frames(run.tabId);
      const original =
        run.sourceDocumentId ?? run.frames.find((frame) => frame.frameId === 0)?.documentId;
      if (original && frames.find((frame) => frame.frameId === 0)?.documentId !== original)
        throw new Error(AUTOFILL_ERROR.pageChanged);
      if (Date.now() > (run.expiresAt ?? run.startedAt + RUN_LIMIT_MS))
        throw new Error(AUTOFILL_ERROR.failed);
      if (run.stage === 'scanning') {
        const replies = await Promise.all(
          run.frames.map(async (frame) => ({
            frame,
            reply: await this.deps
              .send(run, frame, { action: 'AUTOFILL_SCAN', runId: run.runId })
              .catch(() => null),
          })),
        );
        const error = replies
          .map(({ reply }) => (reply as { error?: string })?.error)
          .find(Boolean);
        if (error) throw new Error(error);
        const scanned = replies.filter(
          ({ reply }) =>
            typeof (reply as { preFilledCount?: unknown })?.preFilledCount === 'number',
        );
        if (!scanned.length) throw new Error(AUTOFILL_ERROR.failed);
        const needsChoice = run.mode === undefined && scanned.some(
          ({ reply }) => (reply as { preFilledCount: number }).preFilledCount > 0,
        );
        run = {
          ...run,
          frames: scanned.map(({ frame }) => frame),
          stage: needsChoice ? 'confirming' : 'filling',
          ...(needsChoice ? {} : { mode: run.mode ?? 'overwrite' }),
        };
        if (!(await this.update(run))) return null;
      }
      if (run.stage === 'filling') {
        if (run.mode !== 'merge' && run.mode !== 'overwrite') throw new Error(AUTOFILL_ERROR.failed);
        const results = await Promise.all(
          run.frames.map((frame) =>
            this.deps
              .send(run, frame, { action: 'AUTOFILL_FILL', mode: run.mode, runId: run.runId })
              .catch(() => null),
          ),
        );
        const error = results.map((reply) => (reply as { error?: string })?.error).find(Boolean);
        const valid = results
          .filter(
            (reply) => typeof (reply as { totalScanned?: unknown })?.totalScanned === 'number',
          )
          .map((reply) => {
            const source = reply as Record<string, unknown>;
            return Object.fromEntries(
              [
                'noReview',
                'needReview',
                'lowConfidence',
                'noData',
                'totalScanned',
                'kept',
                'excluded',
                'failed',
                'aiStatus',
                'runId',
                'startedAt',
              ]
                .filter((key) => typeof source[key] === 'number' || typeof source[key] === 'string')
                .map((key) => [key, source[key]]),
            );
          });
        if (!valid.length) throw new Error(error ?? AUTOFILL_ERROR.failed);
        run = { ...run, stage: 'completed', results: valid, ...(error ? { error } : {}) };
        if (!(await this.update(run))) return null;
      }
      return run;
    } catch (error) {
      run = {
        ...run,
        stage: 'error',
        error: error instanceof Error ? error.message : AUTOFILL_ERROR.failed,
      };
      return (await this.update(run)) ? run : null;
    }
  }
}

export function createAutofillCoordinator() {
  const storage = wrapStorageArea(() => chrome.storage.session, 'autofill session', {
    rejectOnSetError: true,
  });
  return new AutofillCoordinator({
    setup: async () => {
      try {
        const completion = calculateCompletion((await getProfile()) ?? {});
        if (completion.missingFields.some((field) => field === 'First Name' || field === 'Email'))
          return AUTOFILL_ERROR.profileSetupRequired;
      } catch {
        return AUTOFILL_ERROR.profileUnavailable;
      }
      try {
        const settings = await getGeminiSettings();
        return settings.apiKey && settings.model ? undefined : AUTOFILL_ERROR.aiSetupRequired;
      } catch {
        return AUTOFILL_ERROR.aiSettingsUnavailable;
      }
    },
    read: async (tabId) =>
      ((await storage.get(`${RUN_PREFIX}${tabId}`, { rejectOnError: true }))[
        `${RUN_PREFIX}${tabId}`
      ] as AutofillRun) ?? null,
    write: async (tabId, run) => {
      if (run) await storage.set({ [`${RUN_PREFIX}${tabId}`]: run });
      else await storage.remove(`${RUN_PREFIX}${tabId}`, { rejectOnError: true });
    },
    frames: async (tabId) => {
      try {
        const frames = await chrome.webNavigation.getAllFrames({ tabId });
        if (frames?.length)
          return frames.map(({ frameId, documentId }) => ({
            frameId,
            ...(documentId ? { documentId } : {}),
          }));
      } catch {
        /* A top-frame fallback still supports older Chrome and simple pages. */
      }
      return [{ frameId: 0 }];
    },
    send: async (run, frame, message) => {
      const target = frame.documentId
        ? { tabId: run.tabId, documentIds: [frame.documentId] }
        : { tabId: run.tabId, frameIds: [frame.frameId] };
      await chrome.scripting
        .executeScript({ target, files: ['content-scripts/content.js'] })
        .catch(() => {});
      return chrome.tabs.sendMessage(run.tabId, message, {
        frameId: frame.frameId,
        ...(frame.documentId ? { documentId: frame.documentId } : {}),
      });
    },
    alarm: async (tabId, pending) => {
      if (pending)
        await chrome.alarms.create(`${RUN_ALARM_PREFIX}${tabId}`, { delayInMinutes: 0.5 });
      else await chrome.alarms.clear(`${RUN_ALARM_PREFIX}${tabId}`);
    },
  });
}

export function requestAutofillRun(
  action: 'START' | 'STATUS' | 'CONFIRM' | 'CANCEL',
  tabId: number,
  options: { runId?: string; mode?: 'merge' | 'overwrite' } = {},
): Promise<AutofillRun | null> {
  return chrome.runtime.sendMessage({ action: `AUTOFILL_RUN_${action}`, tabId, ...options });
}
