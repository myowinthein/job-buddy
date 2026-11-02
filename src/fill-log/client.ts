import { latestFillLogFrames, safeFormUrl } from '@/src/autofill/fillLog';
import type { FillLogFrame, FillLogSnapshot, FrameFillLog } from '@/src/autofill/fillLog';
import { requestFillDetails, sourceTabId } from './navigation';
import { readRetainedFillLog, fillDetailsClearedAt, selectRetainedFillLog } from './retention';

/** Read only: never scan, fill, or switch the source tab while opening its log. */
export async function loadFillLog(tabId: number | null): Promise<FillLogSnapshot> {
  const cached = await readRetainedFillLog();
  const clearedAt = await fillDetailsClearedAt();
  const retained = cached?.frames.every((frame) => frame.log.startedAt >= clearedAt)
    ? cached
    : null;
  const source = retained?.tabId ?? tabId;
  if (source === null) return { tabId: -1, frames: [] };
  try {
    const live = await readLiveFillLog(source, clearedAt);
    // Keep the completed report through a refresh or an in-progress retry.
    if (retained && !live.frames.some((frame) => frame.log.status !== 'scanning')) return retained;
    return live;
  } catch (error) {
    if (retained) return { ...retained, sourceClosed: true };
    throw error;
  }
}

export async function selectFillLog(tabId: number): Promise<void> {
  if (sourceTabId(tabId) === null) throw new Error('Invalid source form');
  const requestedAt = Date.now();
  const snapshot = await readLiveFillLog(tabId, await fillDetailsClearedAt());
  await selectRetainedFillLog(snapshot, requestedAt);
}

async function readLiveFillLog(tabId: number, clearedAt: number): Promise<FillLogSnapshot> {
  // Distinguish a closed source tab from a page with no completed fill.
  const tab = await chrome.tabs.get(tabId);
  let ids = [0];
  try {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    if (frames) ids = [...new Set([0, ...frames.map((frame) => frame.frameId)])];
  } catch {
    /* The top frame can still supply a log. */
  }
  let needsRefresh = false;
  const responses = await Promise.all(
    ids.map(async (frameId) => {
      try {
        const log = (await chrome.tabs.sendMessage(
          tabId,
          { action: 'GET_FILL_LOG' },
          { frameId },
        )) as FrameFillLog | null;
        if (
          log?.version === 1 &&
          typeof log.runId === 'string' &&
          typeof log.startedAt === 'number' &&
          Array.isArray(log.fields) &&
          log.startedAt >= clearedAt
        )
          return { frameId, log };
      } catch {
        // An already-open form may still have the earlier content script.
      }
      try {
        const status = await chrome.tabs.sendMessage(tabId, { action: 'GET_STATUS' }, { frameId });
        if (!clearedAt && typeof status?.totalScanned === 'number' && status.totalScanned > 0)
          needsRefresh = true;
      } catch {
        /* A detached or inaccessible frame has no readable result. */
      }
      return null;
    }),
  );
  const frames = latestFillLogFrames(
    responses.filter((frame): frame is FillLogFrame => frame !== null),
  );
  return {
    tabId,
    pageUrl:
      safeFormUrl(frames.find((frame) => frame.frameId === 0)?.log.url) ?? safeFormUrl(tab.url),
    frames,
    ...(needsRefresh ? { needsRefresh: true } : {}),
  };
}

export async function openFillLog(tabId: number): Promise<void> {
  await selectFillLog(tabId);
  await requestFillDetails(tabId);
}

export async function returnToForm(tabId: number): Promise<void> {
  const tab = await chrome.tabs.update(tabId, { active: true });
  if (typeof tab?.windowId === 'number')
    await chrome.windows.update(tab.windowId, { focused: true });
}
