import type { FillLogField, FillLogSnapshot, FrameFillLog } from '@/src/autofill/fillLog';
import {
  AI_OUTCOME_LABELS,
  FILL_OUTCOME_LABELS,
  RULE_OUTCOME_LABELS,
  LEARNED_CHECK_LABELS,
  safeFormUrl,
} from '@/src/autofill/fillLog';
import { wrapStorageArea } from '@/src/utils/storageArea';
import { devLockName } from '@/src/devtools/context';
import { DEV_PROFILE } from '@/src/utils/devProfile';

export const RETAINED_FILL_DETAILS = 'jb:last-fill-details';
const session = wrapStorageArea(() => chrome.storage.session, 'last fill details', {
  rejectOnSetError: true,
});
const local = wrapStorageArea(() => chrome.storage.local, 'last fill profile');
let queue: Promise<unknown> = Promise.resolve();
async function locked<T>(action: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks?.request)
    return navigator.locks.request(
      import.meta.env.DEV ? devLockName(RETAINED_FILL_DETAILS) : RETAINED_FILL_DETAILS,
      action,
    );
  const result = queue.then(action, action);
  queue = result.catch(() => {});
  return result;
}

/** Project only the report metadata. Never retain values or arbitrary message properties. */
function reportMetadata(value: unknown): FrameFillLog | null {
  if (!value || typeof value !== 'object') return null;
  const log = value as FrameFillLog;
  if (
    log.version !== 1 ||
    typeof log.runId !== 'string' ||
    !Number.isFinite(log.startedAt) ||
    !['completed', 'undone'].includes(log.status) ||
    typeof log.origin !== 'string' ||
    !Array.isArray(log.fields) ||
    (log.completedAt !== undefined && !Number.isFinite(log.completedAt)) ||
    (log.modifiedAt !== undefined && !Number.isFinite(log.modifiedAt)) ||
    (log.mode !== undefined && !['merge', 'overwrite'].includes(log.mode)) ||
    (log.aiStatus !== undefined &&
      !['not_needed', 'succeeded', 'unavailable'].includes(log.aiStatus))
  )
    return null;
  let origin: string;
  try {
    origin = log.origin === 'null' ? 'null' : new URL(log.origin).origin;
  } catch {
    return null;
  }
  const fields: FillLogField[] = [];
  for (const field of log.fields) {
    if (
      !field ||
      typeof field.id !== 'string' ||
      typeof field.label !== 'string' ||
      (field.required !== undefined && typeof field.required !== 'boolean') ||
      !['text', 'select', 'file', 'radio', 'checkbox'].includes(field.kind) ||
      !Object.hasOwn(FILL_OUTCOME_LABELS, field.outcome) ||
      !field.rule ||
      !field.ai ||
      !Object.hasOwn(RULE_OUTCOME_LABELS, field.rule.outcome) ||
      !Object.hasOwn(AI_OUTCOME_LABELS, field.ai.outcome) ||
      ![null, 'rules', 'ai', 'manual'].includes(field.source) ||
      (field.reason !== undefined &&
        ![
          'consent',
          'existing_value',
          'fill_failed',
          'manual_clear',
          'manual_edit',
          'profile_updated',
          'option_unavailable',
          'value_changed',
        ].includes(field.reason)) ||
      (field.rule.layer !== undefined &&
        ![
          'learned',
          'autocomplete',
          'dictionary_exact',
          'fuzzy',
          'custom_link',
          'checkbox_status',
          'context',
          'none',
        ].includes(field.rule.layer)) ||
      (field.rule.confidence !== undefined && !Number.isFinite(field.rule.confidence)) ||
      (field.rule.matchConfidence !== undefined &&
        (!Number.isFinite(field.rule.matchConfidence) ||
          field.rule.matchConfidence < 0 ||
          field.rule.matchConfidence > 1)) ||
      (field.rule.ran !== undefined && typeof field.rule.ran !== 'boolean') ||
      (field.learned !== undefined &&
        (!field.learned ||
          !Object.hasOwn(LEARNED_CHECK_LABELS, field.learned.status) ||
          (field.learned.profilePath !== undefined &&
            typeof field.learned.profilePath !== 'string') ||
          (field.learned.confirmations !== undefined &&
            (!Number.isSafeInteger(field.learned.confirmations) ||
              field.learned.confirmations < 0)) ||
          (field.learned.legacy !== undefined && field.learned.legacy !== true))) ||
      (field.rule.profilePath !== undefined && typeof field.rule.profilePath !== 'string') ||
      (field.ai.profilePath !== undefined && typeof field.ai.profilePath !== 'string') ||
      (field.ai.confidence !== undefined && ![null, 'high', 'low'].includes(field.ai.confidence)) ||
      (field.ai.optionReview !== undefined && typeof field.ai.optionReview !== 'boolean') ||
      (field.ai.skipReason !== undefined &&
        !['answer_changed', 'profile_changed', 'cancelled'].includes(field.ai.skipReason))
    )
      return null;
    fields.push({
      id: field.id,
      label: field.label,
      kind: field.kind,
      required: field.required,
      outcome: field.outcome,
      source: field.source,
      reason: field.reason,
      ...(field.learned && {
        learned: {
          status: field.learned.status,
          profilePath: field.learned.profilePath,
          confirmations: field.learned.confirmations,
          legacy: field.learned.legacy,
        },
      }),
      rule: {
        outcome: field.rule.outcome,
        ran: field.rule.ran,
        layer: field.rule.layer,
        confidence: field.rule.confidence,
        matchConfidence: field.rule.matchConfidence,
        profilePath: field.rule.profilePath,
      },
      ai: {
        outcome: field.ai.outcome,
        confidence: field.ai.confidence,
        profilePath: field.ai.profilePath,
        optionReview: field.ai.optionReview,
        skipReason: field.ai.skipReason,
      },
    });
  }
  return {
    version: 1,
    runId: log.runId,
    startedAt: log.startedAt,
    completedAt: log.completedAt,
    modifiedAt: log.modifiedAt,
    origin,
    url: safeFormUrl(log.url),
    status: log.status,
    mode: log.mode,
    aiStatus: log.aiStatus,
    fields,
  };
}

export async function readRetainedFillLog(): Promise<FillLogSnapshot | null> {
  const value = (await session.get(RETAINED_FILL_DETAILS))[RETAINED_FILL_DETAILS] as
    | FillLogSnapshot
    | undefined;
  if (
    !value ||
    !Number.isSafeInteger(value.tabId) ||
    value.tabId < 0 ||
    !Array.isArray(value.frames)
  )
    return null;
  const frames = value.frames.flatMap((frame) => {
    const log = reportMetadata(frame?.log);
    return log && Number.isInteger(frame.frameId) && frame.frameId >= 0
      ? [{ frameId: frame.frameId, log }]
      : [];
  });
  frames.sort((a, b) => a.frameId - b.frameId);
  if (!frames.length && !Number.isFinite(value.selectedAt)) return null;
  return {
    tabId: value.tabId,
    frames,
    pageUrl: safeFormUrl(value.pageUrl),
    selectedAt: Number.isFinite(value.selectedAt)
      ? value.selectedAt
      : Math.max(0, ...frames.map((frame) => frame.log.startedAt)),
    ...(value.needsRefresh ? { needsRefresh: true } : {}),
  };
}

/** Explicit View details chooses a report without starting a scan or fill. */
export async function selectRetainedFillLog(
  snapshot: FillLogSnapshot,
  requestedAt: number,
): Promise<void> {
  await locked(async () => {
    const previous = await readRetainedFillLog();
    if ((previous?.selectedAt ?? 0) > requestedAt) return;
    const cutoff = await fillDetailsClearedAt();
    if (requestedAt < cutoff) return;
    const frames = snapshot.frames.flatMap((frame) => {
      const log = reportMetadata(frame.log);
      return log && log.startedAt >= cutoff ? [{ frameId: frame.frameId, log }] : [];
    });
    const keepCompleted =
      !frames.length &&
      snapshot.frames.some((frame) => frame.log.status === 'scanning') &&
      previous?.tabId === snapshot.tabId;
    await session.set({
      [RETAINED_FILL_DETAILS]: {
        tabId: snapshot.tabId,
        frames: keepCompleted ? previous.frames : frames,
        selectedAt: requestedAt,
        clearedAt: cutoff,
        pageUrl: keepCompleted ? previous.pageUrl : safeFormUrl(snapshot.pageUrl),
        ...(snapshot.needsRefresh ? { needsRefresh: true } : {}),
      },
    });
  });
}

export async function clearRetainedFillLog(): Promise<void> {
  // A nonpersonal cutoff also hides old reports still held by open form scripts.
  await locked(() => session.set({ [RETAINED_FILL_DETAILS]: { clearedAt: Date.now() } }));
}

export async function fillDetailsClearedAt(): Promise<number> {
  const value = (await session.get(RETAINED_FILL_DETAILS))[RETAINED_FILL_DETAILS] as
    | { clearedAt?: number }
    | undefined;
  return typeof value?.clearedAt === 'number' && Number.isFinite(value.clearedAt)
    ? value.clearedAt
    : 0;
}

/** Called only in the worker; tab/frame identity comes from Chrome's sender. */
export async function retainFrameFillLog(
  sender: chrome.runtime.MessageSender,
  value: unknown,
  profileId: unknown,
): Promise<void> {
  const tabId = sender.tab?.id;
  if (
    sender.id !== chrome.runtime.id ||
    !Number.isSafeInteger(tabId) ||
    tabId! < 0 ||
    !Number.isInteger(sender.frameId) ||
    sender.frameId! < 0 ||
    typeof profileId !== 'string'
  )
    return;
  const log = reportMetadata(value);
  if (!log) return;
  let pageUrl = safeFormUrl(sender.tab?.url);
  if (!pageUrl) {
    try {
      pageUrl = safeFormUrl(
        (await chrome.webNavigation.getFrame({ tabId: tabId!, frameId: 0 }))?.url,
      );
    } catch {
      /* Sender/document metadata remains sufficient when frame lookup is unavailable. */
    }
  }
  await locked(async () => {
    const stored = await local.get(['profile', 'devProfileDisabled']);
    const profile = stored.profile as { id?: string } | undefined;
    const currentId =
      profile?.id ??
      (import.meta.env.DEV && !stored.devProfileDisabled ? DEV_PROFILE.id : undefined);
    if (currentId !== profileId) return; // Reset/replacement invalidates old form reports.
    const cutoff = await fillDetailsClearedAt();
    if (log.startedAt < cutoff) return;
    const previous = await readRetainedFillLog();
    const prior = previous?.frames[0]?.log;
    const sameTab = previous?.tabId === tabId;
    const sameRun = previous?.tabId === tabId && prior?.runId === log.runId;
    const priorFrame = sameRun
      ? previous!.frames.find((frame) => frame.frameId === sender.frameId)?.log
      : undefined;
    const revisedAt = (frame: FrameFillLog) =>
      frame.modifiedAt ?? frame.completedAt ?? frame.startedAt;
    if (
      priorFrame &&
      ((priorFrame.status === 'undone' && log.status !== 'undone') ||
        revisedAt(priorFrame) > revisedAt(log))
    )
      return;
    // Empty sandbox frames cannot replace a real form, nor can late old-run edits.
    if (
      !sameRun &&
      (!log.fields.length ||
        (previous &&
          (sameTab
            ? Math.max(0, ...previous.frames.map((frame) => frame.log.startedAt))
            : (previous.selectedAt ?? prior?.startedAt ?? 0)) >= log.startedAt))
    )
      return;
    const frames = sameRun
      ? previous!.frames.filter((frame) => frame.frameId !== sender.frameId)
      : [];
    frames.push({ frameId: sender.frameId!, log });
    await session.set({
      [RETAINED_FILL_DETAILS]: {
        tabId,
        frames,
        selectedAt: sameTab ? Math.max(previous!.selectedAt ?? 0, log.startedAt) : log.startedAt,
        clearedAt: cutoff,
        pageUrl:
          (sender.frameId === 0 ? log.url : undefined) ??
          (sameRun ? previous!.pageUrl : undefined) ??
          pageUrl,
      },
    });
  });
}

/** Content scripts cannot access session storage; send metadata to the worker. */
export async function publishFillLog(
  log: FrameFillLog | null,
  profileId: string | null,
): Promise<void> {
  if (!log || !profileId || log.status === 'scanning') return;
  try {
    await chrome.runtime.sendMessage({ action: 'FILL_DETAILS_UPDATED', log, profileId });
  } catch {
    /* Retention must never interrupt filling or manual edits. */
  }
}
