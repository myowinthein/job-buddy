import { scanAutofill, executeAutofill, undoAutofill, getLastResult, getDebugSession, EMPTY_AUTOFILL_RESULT } from '@/src/autofill/index';

export default defineContentScript({
  matches: ['*://*/*'],
  // Many job application forms are embedded via a cross-origin iframe (ATS
  // widgets, embedded application flows) rather than living on the top-level
  // page. all_frames injects this script into every matching frame, not just
  // the top one, so scanAutofill/executeAutofill can find fields there too.
  // The popup's messaging layer is frame-aware to match (see popup/App.tsx).
  allFrames: true,
  // Some ATS widgets render their application form inside an about:blank (or
  // srcdoc/data:) iframe rather than one with a real http(s) src (confirmed
  // on moroku.com/designer) — matches: ['*://*/*'] alone never injects into
  // those, since about:blank doesn't match an http(s) pattern. Both options
  // extend injection to those empty-URL frames based on their creator's
  // origin; matchOriginAsFallback is Chrome's newer, more robust mechanism
  // (handles nested about:blank/data: chains), matchAboutBlank is kept
  // alongside it for broader engine/version coverage.
  matchAboutBlank: true,
  matchOriginAsFallback: true,
  main() {
    // Idempotency guard: popup/App.tsx's sendToAllFrames() actively
    // re-injects this same script via chrome.scripting.executeScript before
    // every message, as a fallback for frames whose document was populated
    // asynchronously via document.write() after the frame was created (e.g.
    // HubSpot's embedded-form iframe pattern) — a known Chromium quirk where
    // declarative content_scripts injection (matches/allFrames/
    // matchAboutBlank/matchOriginAsFallback above) doesn't reliably re-run
    // for those. That means this main() can legitimately run twice in the
    // same frame; skip re-registering the message listener if it already is.
    const g = globalThis as unknown as { __jobBuddyInjected?: boolean };
    if (g.__jobBuddyInjected) return;
    g.__jobBuddyInjected = true;

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.action === 'AUTOFILL_SCAN') {
        scanAutofill()
          .then(sendResponse)
          .catch(() => sendResponse({ preFilledCount: 0, totalMatched: 0 }));
        return true;
      }

      if (message.action === 'AUTOFILL_FILL') {
        const mode: 'merge' | 'overwrite' = message.mode === 'merge' ? 'merge' : 'overwrite';
        executeAutofill(mode)
          .then(sendResponse)
          .catch(() => sendResponse(EMPTY_AUTOFILL_RESULT));
        return true;
      }

      if (message.action === 'CLEAR') {
        undoAutofill();
        sendResponse({ success: true });
        return true;
      }

      if (message.action === 'GET_STATUS') {
        sendResponse(getLastResult());
        return true;
      }

      if (message.action === 'GET_DEBUG_SESSION') {
        sendResponse(getDebugSession());
        return true;
      }
    });
  },
});
