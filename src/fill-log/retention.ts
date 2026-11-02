import type { FillLogField, FillLogSnapshot, FrameFillLog } from '@/src/autofill/fillLog';
import {
  AI_OUTCOME_LABELS,
  FILL_OUTCOME_LABELS,
  RULE_OUTCOME_LABELS,
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
      (field.rule.profilePath !== undefined && typeof field.rule.profilePath !== 'string') ||
      (field.ai.profilePath !== undefined && typeof field.ai.profilePath !== 'string') ||
      (field.ai.confidence !== undefined && ![null, 'high', 'low'].includes(field.ai.confidence))
    )
      return null;
    fields.push({
      id: field.id,
      label: field.label,
      kind: field.kind,
      outcome: field.outcome,
      source: field.source,
      reason: field.reason,
      rule: {
        outcome: field.rule.outcome,
        layer: field.rule.layer,
        confidence: field.rule.confidence,
        profilePath: field.rule.profilePath,
      },
      ai: {
        outcome: field.ai.outcome,
        confidence: field.ai.confidence,
        profilePath: field.ai.profilePath,
      },
    });
  }
  return {
    version: 1,
    runId: log.runId,
    startedAt: log.startedAt,
    completedAt: log.completedAt,
    origin,
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
  return frames.length ? { tabId: value.tabId, frames } : null;
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
  await locked(async () => {
    const stored = await local.get(['profile', 'devProfileDisabled']);
    const profile = stored.profile as { id?: string } | undefined;
    const currentId =
      profile?.id ??
      (import.meta.env.DEV && !stored.devProfileDisabled ? DEV_PROFILE.id : undefined);
    if (currentId !== profileId) return; // Reset/replacement invalidates old form reports.
    if (log.startedAt < (await fillDetailsClearedAt())) return;
    const previous = await readRetainedFillLog();
    const prior = previous?.frames[0]?.log;
    const sameRun = previous?.tabId === tabId && prior?.runId === log.runId;
    // Empty sandbox frames cannot replace a real form, nor can late old-run edits.
    if (!sameRun && (!log.fields.length || (prior && prior.startedAt >= log.startedAt))) return;
    const frames = sameRun
      ? previous!.frames.filter((frame) => frame.frameId !== sender.frameId)
      : [];
    frames.push({ frameId: sender.frameId!, log });
    await session.set({ [RETAINED_FILL_DETAILS]: { tabId, frames } });
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
