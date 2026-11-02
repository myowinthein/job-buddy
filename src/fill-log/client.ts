import { latestFillLogFrames } from '@/src/autofill/fillLog';
import type { FillLogFrame, FillLogSnapshot, FrameFillLog } from '@/src/autofill/fillLog';
import { requestFillDetails } from './navigation';
import { readRetainedFillLog, fillDetailsClearedAt } from './retention';

/** Read only: never scan, fill, or switch the source tab while opening its log. */
export async function loadFillLog(tabId: number): Promise<FillLogSnapshot> {
  const cached = await readRetainedFillLog();
  const clearedAt = await fillDetailsClearedAt();
  const retained = cached?.frames.every((frame) => frame.log.startedAt >= clearedAt)
    ? cached
    : null;
  let live: FillLogSnapshot;
  try {
    live = await readLiveFillLog(tabId, clearedAt);
  } catch (error) {
    if (!retained) throw error;
    try {
      return await readLiveFillLog(retained.tabId, clearedAt);
    } catch {
      return { ...retained, sourceClosed: true };
    }
  }
  // A newer fill replaces the single retained report, including in an already-open view.
  const startedAt = (snapshot: FillLogSnapshot) =>
    Math.max(0, ...snapshot.frames.map((frame) => frame.log.startedAt));
  if (retained && retained.tabId !== tabId && startedAt(retained) > startedAt(live)) {
    try {
      return await readLiveFillLog(retained.tabId, clearedAt);
    } catch {
      return { ...retained, sourceClosed: true };
    }
  }
  return live;
}

async function readLiveFillLog(tabId: number, clearedAt: number): Promise<FillLogSnapshot> {
  // Distinguish a closed source tab from a page with no completed fill.
  await chrome.tabs.get(tabId);
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
  return {
    tabId,
    frames: latestFillLogFrames(responses.filter((frame): frame is FillLogFrame => frame !== null)),
    ...(needsRefresh ? { needsRefresh: true } : {}),
  };
}

export async function openFillLog(tabId: number): Promise<void> {
  await requestFillDetails(tabId);
}

export async function returnToForm(tabId: number): Promise<void> {
  const tab = await chrome.tabs.update(tabId, { active: true });
  if (typeof tab?.windowId === 'number')
    await chrome.windows.update(tab.windowId, { focused: true });
}
