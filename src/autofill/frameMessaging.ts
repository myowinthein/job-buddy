// Actively (re-)injects the content script into every given frame before
// messaging it. Chrome's declarative content_scripts injection (matches +
// allFrames + matchAboutBlank + matchOriginAsFallback, see content.ts) does
// NOT reliably re-run for a frame whose document was populated
// asynchronously via document.write() after the frame was created — a known
// Chromium quirk. HubSpot's embedded-form iframe pattern hits this exactly:
// an empty iframe is created up front, then its form HTML is fetched and
// document.write()-ten in well after (confirmed on moroku.com/designer).
// Re-injecting here is idempotent (see content.ts's __jobBuddyInjected
// guard) so it's safe to call unconditionally rather than only retrying
// frames that failed to respond. Best-effort per frame: frames that reject
// (chrome:// pages, frames that detached, etc.) are silently skipped.
async function ensureContentScriptInjected(tabId: number, frameIds: number[]): Promise<void> {
  await Promise.all(
    frameIds.map((frameId) =>
      chrome.scripting
        .executeScript({
          target: { tabId, frameIds: [frameId] },
          files: ['content-scripts/content.js'],
        })
        .catch(() => undefined),
    ),
  );
}

// Sends `message` to every frame of the tab (content.ts runs in all frames —
// see its allFrames flag — since job forms are frequently embedded in a
// cross-origin iframe rather than living on the top-level page).
// chrome.tabs.sendMessage only reaches the top frame unless a frameId is
// given explicitly, so frames are enumerated first. Frames with no content
// script listening even after the active re-injection above (blocked
// cross-origin frames without host permissions, chrome:// pages, etc.)
// reject and are silently dropped — that's expected for most iframes on a
// page (ads, trackers, unrelated widgets), not an error condition.
export async function sendToAllFrames(tabId: number, message: object): Promise<unknown[]> {
  let frameIds = [0]; // always include the top frame, even if enumeration fails
  try {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    if (frames) frameIds = [...new Set([0, ...frames.map((f) => f.frameId)])];
  } catch {
    // webNavigation unavailable or the call failed — fall back to top frame only.
  }

  await ensureContentScriptInjected(tabId, frameIds);

  const responses = await Promise.all(
    frameIds.map((frameId) =>
      chrome.tabs.sendMessage(tabId, message, { frameId }).catch(() => undefined),
    ),
  );
  return responses.filter((r) => r !== undefined);
}
