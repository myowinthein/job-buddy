import { wrapStorageArea } from '@/src/utils/storageArea';
import { createNamedLock } from '@/src/utils/namedLock';
import { RUN_PREFIX, type AutofillRun } from '@/src/autofill/runCoordinator';
import { readRetainedFillLog } from './retention';

export const FILL_DETAILS_REQUEST = 'jb:fillDetailsRequest';
const SOURCE = 'jb:fillDetailsSource';
const session = wrapStorageArea(() => chrome.storage.session, 'fill details navigation', {
  rejectOnSetError: true,
});
const locked = createNamedLock('jb-fill-details-navigation');

export function sourceTabId(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
export function sourceFromQuery(search: string): number | null {
  const value = new URLSearchParams(search).get('tabId');
  return value !== null && /^\d+$/.test(value) ? sourceTabId(Number(value)) : null;
}

/** Only transient navigation metadata: no form values, logs, or history. */
export async function requestFillDetails(tabId: number): Promise<void> {
  if (sourceTabId(tabId) === null) throw new Error('Invalid source form');
  await locked(async () => {
    await session.remove('jb:focusOnLoad');
    await session.set({
      [FILL_DETAILS_REQUEST]: { tabId, requestId: crypto.randomUUID() },
      [SOURCE]: tabId,
    });
  });
  await chrome.runtime.openOptionsPage();
}
export async function takeFillDetailsRequest(): Promise<{ tabId: number } | null> {
  return locked(async () => {
    const stored = (await session.get(FILL_DETAILS_REQUEST, { rejectOnError: true }))[
      FILL_DETAILS_REQUEST
    ];
    if (stored === undefined) return null;
    // Consume once, including when navigation is declined because of unsaved edits.
    await session.remove(FILL_DETAILS_REQUEST, { rejectOnError: true });
    const id =
      stored && typeof stored === 'object'
        ? sourceTabId((stored as { tabId?: unknown }).tabId)
        : null;
    return id === null ? null : { tabId: id };
  });
}
export async function lastFillDetailsSource(): Promise<number | null> {
  const retained = await readRetainedFillLog();
  if (retained) return retained.tabId;
  const explicit = sourceTabId((await session.get(SOURCE))[SOURCE]);
  if (explicit !== null) return explicit;
  // Reuse existing transient run metadata when the sidebar is opened first.
  // This does not collect fields, scan tabs, or introduce saved fill history.
  const stored = await session.get(null);
  const latest = Object.entries(stored)
    .flatMap(([key, value]) => {
      if (!key.startsWith(RUN_PREFIX) || !value || typeof value !== 'object') return [];
      const run = value as AutofillRun;
      return run.stage === 'completed' &&
        sourceTabId(run.tabId) !== null &&
        Number.isFinite(run.startedAt) &&
        Array.isArray(run.results) &&
        run.results.some(
          (result) =>
            typeof (result as { totalScanned?: unknown })?.totalScanned === 'number' &&
            (result as { totalScanned: number }).totalScanned > 0,
        )
        ? [run]
        : [];
    })
    .sort((a, b) => b.startedAt - a.startedAt)[0];
  return latest?.tabId ?? null;
}
