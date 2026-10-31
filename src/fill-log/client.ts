import { latestFillLogFrames } from '@/src/autofill/fillLog';
import type { FillLogFrame, FillLogSnapshot, FrameFillLog } from '@/src/autofill/fillLog';

/** Read only: never scan, fill, or switch the source tab while opening its log. */
export async function loadFillLog(tabId: number): Promise<FillLogSnapshot> {
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
          Array.isArray(log.fields)
        )
          return { frameId, log };
      } catch {
        // An already-open form may still have the earlier content script.
      }
      try {
        const status = await chrome.tabs.sendMessage(tabId, { action: 'GET_STATUS' }, { frameId });
        if (typeof status?.totalScanned === 'number' && status.totalScanned > 0)
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
  await chrome.tabs.create({ url: `${chrome.runtime.getURL('fill-log.html')}?tabId=${tabId}` });
}

export async function returnToForm(tabId: number): Promise<void> {
  await chrome.tabs.update(tabId, { active: true });
}
