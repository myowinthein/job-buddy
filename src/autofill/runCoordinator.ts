import { wrapStorageArea } from '@/src/utils/storageArea';
import { getGeminiSettings, getProfile } from '@/src/utils/storage';
import { calculateCompletion } from '@/src/utils/profileCompletion';
import { AUTOFILL_ERROR } from './errorCodes';
import { developmentScope } from '@/src/devtools/session';
import { PERSISTED_RESULT_KEYS } from './fillResult';
import { tabActivity } from './pageActivity';

export const RUN_PREFIX = 'jb:autofill-run:';
export const RUN_ALARM_PREFIX = 'jb:autofill-recover:';
const RUN_LIMIT_MS = 5 * 60_000;
export interface RunFrame {
  frameId: number;
  documentId?: string;
}
export interface AutofillRun {
  devSessionId?: string | null;
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
const topDocumentId = (frames: RunFrame[]) =>
  frames.find((frame) => frame.frameId === 0)?.documentId;
// Runs saved before expiresAt existed fall back to the start time plus the limit.
const runDeadline = (run: AutofillRun) => run.expiresAt ?? run.startedAt + RUN_LIMIT_MS;
interface RunDependencies {
  scope?: () => string | null;
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
  claim?: (run: AutofillRun) => Promise<boolean>;
  release?: (run: AutofillRun) => Promise<void>;
  blocked?: (tabId: number) => Promise<boolean>;
}
const pending = (run: AutofillRun) => run.stage === 'scanning' || run.stage === 'filling';

/** Coordinates metadata only. Profile values and DOM work stay in the source documents. */
export class AutofillCoordinator {
  private queues = new Map<number, Promise<unknown>>();
  private running = new Map<number, { runId: string; work: Promise<AutofillRun | null> }>();
  constructor(private deps: RunDependencies) {}

  async blocked(tabId: number): Promise<boolean> {
    return (await this.deps.blocked?.(tabId)) ?? false;
  }

  private async release(run: AutofillRun): Promise<void> {
    await this.deps.release?.(run).catch(() => {});
  }

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
      if (this.deps.scope && run.devSessionId !== this.deps.scope()) return false;
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
    const scope = this.deps.scope?.();
    const run = await this.exclusive(tabId, async () => {
      const existing = await this.deps.read(tabId);
      if (existing && (pending(existing) || existing.stage === 'confirming')) return existing;
      let error = await this.deps.setup?.();
      const frames = error ? [] : await this.deps.frames(tabId);
      if (this.deps.scope && scope !== this.deps.scope()) return null;
      if (!error && sourceDocumentId && topDocumentId(frames) !== sourceDocumentId)
        error = AUTOFILL_ERROR.pageChanged;
      const run: AutofillRun = {
        ...(this.deps.scope && { devSessionId: scope }),
        sourceDocumentId: topDocumentId(frames),
        tabId,
        runId: crypto.randomUUID(),
        startedAt: Date.now(),
        expiresAt: Date.now() + RUN_LIMIT_MS,
        stage: error ? 'error' : 'scanning',
        frames,
        ...(mode ? { mode } : {}),
        ...(error ? { error } : {}),
      };
      if (!error && this.deps.claim && !(await this.deps.claim(run)))
        return { ...run, stage: 'error' as const, error: AUTOFILL_ERROR.otherVersionBusy };
      try {
        await this.deps.write(tabId, run);
        await this.deps.alarm(tabId, pending(run));
      } catch (error) {
        await this.release(run);
        throw error;
      }
      return run;
    });
    return run && pending(run) ? this.drive(run) : run;
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
      if (!error && this.deps.claim && !(await this.deps.claim(next)))
        return { ...current, error: AUTOFILL_ERROR.otherVersionBusy };
      try {
        await this.deps.write(tabId, next);
        await this.deps.alarm(tabId, pending(next));
      } catch (error) {
        await this.release(next);
        throw error;
      }
      if (error) await this.release(current);
      return next;
    });
    return run && pending(run) ? this.drive(run) : run;
  }

  async status(tabId: number): Promise<AutofillRun | null> {
    const run = await this.deps.read(tabId);
    if (!run) return null;
    if (run.stage === 'completed' || run.stage === 'error') await this.release(run);
    if (pending(run) && Date.now() > runDeadline(run)) {
      const expired: AutofillRun = { ...run, stage: 'error', error: AUTOFILL_ERROR.failed };
      if (!(await this.update(expired))) return this.deps.read(tabId);
      await Promise.all(
        run.frames.map((frame) =>
          this.deps
            .send(run, frame, { action: 'AUTOFILL_CANCEL', runId: run.runId })
            .catch(() => {}),
        ),
      );
      await this.release(run);
      return expired;
    }
    if (pending(run)) void this.drive(run).catch(() => {});
    return run;
  }

  async navigated(tabId: number, documentId?: string): Promise<void> {
    const run = await this.deps.read(tabId);
    if (run && (!documentId || (run.sourceDocumentId ?? topDocumentId(run.frames)) !== documentId))
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
    if (previous) {
      await Promise.all(
        previous.frames.map((frame) =>
          this.deps
            .send(previous, frame, { action: 'AUTOFILL_CANCEL', runId: previous.runId })
            .catch(() => {}),
        ),
      );
      await this.release(previous);
    }
  }

  async undo(tabId: number, runId?: string): Promise<boolean> {
    return this.exclusive(tabId, async () => {
      const current = await this.deps.read(tabId);
      if (current && (pending(current) || current.stage === 'confirming')) return false;
      if (runId && (current?.runId !== runId || current.stage !== 'completed')) return false;
      const frames =
        current?.stage === 'completed' ? current.frames : await this.deps.frames(tabId);
      const operation: AutofillRun = {
        ...current,
        ...(this.deps.scope && { devSessionId: this.deps.scope() }),
        tabId,
        runId: crypto.randomUUID(),
        startedAt: Date.now(),
        expiresAt: Date.now() + RUN_LIMIT_MS,
        stage: 'filling',
        frames,
      };
      if (this.deps.claim && !(await this.deps.claim(operation))) return false;
      try {
        const replies = await Promise.all(
          frames.map((frame) =>
            this.deps.send(operation, frame, { action: 'CLEAR' }).catch(() => null),
          ),
        );
        const reachable = runId ? replies : replies.filter((reply) => reply !== null);
        const success =
          reachable.length > 0 &&
          reachable.every((reply) => (reply as { success?: boolean } | null)?.success === true);
        if (success) {
          await this.deps.write(tabId, null);
          await this.deps.alarm(tabId, false);
        }
        return success;
      } finally {
        await this.release(operation);
      }
    });
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
      const original = run.sourceDocumentId ?? topDocumentId(run.frames);
      if (original && topDocumentId(frames) !== original)
        throw new Error(AUTOFILL_ERROR.pageChanged);
      if (Date.now() > runDeadline(run)) throw new Error(AUTOFILL_ERROR.failed);
      if (this.deps.claim && !(await this.deps.claim(run)))
        throw new Error(AUTOFILL_ERROR.otherVersionBusy);
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
        const needsChoice =
          run.mode === undefined &&
          scanned.some(({ reply }) => (reply as { preFilledCount: number }).preFilledCount > 0);
        run = {
          ...run,
          frames: scanned.map(({ frame }) => frame),
          stage: needsChoice ? 'confirming' : 'filling',
          ...(needsChoice ? {} : { mode: run.mode ?? 'overwrite' }),
        };
        if (!(await this.update(run))) return null;
      }
      if (run.stage === 'filling') {
        if (run.mode !== 'merge' && run.mode !== 'overwrite')
          throw new Error(AUTOFILL_ERROR.failed);
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
              [...PERSISTED_RESULT_KEYS]
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
    } finally {
      if (run.stage !== 'confirming') await this.release(run);
    }
  }
}

export function createAutofillCoordinator() {
  const storage = wrapStorageArea(() => chrome.storage.session, 'autofill session', {
    rejectOnSetError: true,
  });
  return new AutofillCoordinator({
    ...(import.meta.env.DEV && { scope: developmentScope }),
    claim: (run) =>
      tabActivity(run.tabId, 'claim', run.runId, runDeadline(run), run.sourceDocumentId),
    release: async (run) => {
      await tabActivity(run.tabId, 'release', run.runId, 0, run.sourceDocumentId);
    },
    blocked: (tabId) => tabActivity(tabId, 'blocked'),
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
      if (run) {
        if (import.meta.env.DEV && run.devSessionId !== developmentScope())
          throw new Error('The development session changed');
        await storage.set({ [`${RUN_PREFIX}${tabId}`]: run });
      } else await storage.remove(`${RUN_PREFIX}${tabId}`, { rejectOnError: true });
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
      if (import.meta.env.DEV && run.devSessionId !== developmentScope())
        throw new Error('The development session changed');
      const target = frame.documentId
        ? { tabId: run.tabId, documentIds: [frame.documentId] }
        : { tabId: run.tabId, frameIds: [frame.frameId] };
      await chrome.scripting
        .executeScript({ target, files: ['content-scripts/content.js'] })
        .catch(() => {});
      return chrome.tabs.sendMessage(
        run.tabId,
        {
          ...message,
          ...(import.meta.env.DEV && { __jbDevSession: run.devSessionId }),
        },
        {
          frameId: frame.frameId,
          ...(frame.documentId ? { documentId: frame.documentId } : {}),
        },
      );
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

export function requestAutofillBlocked(tabId: number): Promise<boolean> {
  return chrome.runtime
    .sendMessage({ action: 'AUTOFILL_RUN_BLOCKED', tabId })
    .then((value) => value === true);
}

export function requestAutofillUndo(tabId: number): Promise<boolean> {
  return chrome.runtime.sendMessage({ action: 'AUTOFILL_RUN_UNDO', tabId });
}
