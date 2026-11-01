import {
  scanAutofill,
  executeAutofill,
  undoAutofill,
  getLastResult,
  getDebugSession,
  getFillLog,
  cancelAutofillRun,
} from '@/src/autofill/index';
import { installQuickFill } from '@/src/quick-fill/content';
import { getGeminiSettings } from '@/src/utils/storage';

// Check fresh settings in each frame before an explicit scan or fill. Undo and
// previous results remain available after a key is removed.
async function withAISetup<T>(action: () => Promise<T>) {
  let settings;
  try {
    settings = await getGeminiSettings();
  } catch {
    return { error: 'ai_settings_unavailable' };
  }
  if (!settings.apiKey || !settings.model) return { error: 'ai_setup_required' };
  return action();
}

export default defineContentScript({
  matches: ['*://*/*'],
  // Many job application forms are embedded via a cross-origin iframe (ATS
  // widgets, embedded application flows) rather than living on the top-level
  // page. all_frames injects this script into every matching frame, not just
  // the top one, so scanAutofill/executeAutofill can find fields there too.
  // The background coordinator sends to each captured frame and document.
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
    installQuickFill();

    // Retries after a worker restart must reuse the same scan and fill, never
    // reset pending matches or make a second AI request for the same run.
    interface ContentRun {
      id: string;
      scan: Promise<unknown>;
      fill?: Promise<unknown>;
      cancelled?: boolean;
    }
    let run: ContentRun | null = null;
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.action === 'AUTOFILL_SCAN') {
        const id = typeof message.runId === 'string' ? message.runId : undefined;
        if (!id || !run || run.id !== id) {
          const next: ContentRun | null = id ? { id, scan: Promise.resolve(null) } : null;
          run = next;
          const scan = withAISetup<unknown>(() =>
            next && (run !== next || next.cancelled)
              ? Promise.resolve({ error: 'autofill_failed' })
              : scanAutofill(id),
          );
          if (next) next.scan = scan;
          scan.then(sendResponse).catch(() => sendResponse({ error: 'autofill_failed' }));
          return true;
        }
        (run.cancelled ? Promise.resolve({ error: 'autofill_failed' }) : run.scan)
          .then(sendResponse)
          .catch((err) => {
            console.error('[Job Buddy] AUTOFILL_SCAN failed:', err);
            sendResponse({ error: 'autofill_failed' });
          });
        return true;
      }

      if (message.action === 'AUTOFILL_FILL') {
        if (message.runId && (message.runId !== run?.id || run?.cancelled)) {
          sendResponse({ error: 'autofill_failed' });
          return true;
        }
        const mode: 'merge' | 'overwrite' = message.mode === 'merge' ? 'merge' : 'overwrite';
        const current = run;
        const fill =
          current?.fill ??
          withAISetup<unknown>(() =>
            current && (run !== current || current.cancelled)
              ? Promise.resolve({ error: 'autofill_failed' })
              : executeAutofill(mode),
          );
        if (run) run.fill = fill;
        fill.then(sendResponse).catch((err) => {
          console.error('[Job Buddy] AUTOFILL_FILL failed:', err);
          sendResponse({ error: 'autofill_failed' });
        });
        return true;
      }

      if (message.action === 'AUTOFILL_CANCEL') {
        if (run && run.id === message.runId) {
          run.cancelled = true;
          cancelAutofillRun();
        }
        sendResponse({ success: true });
        return true;
      }

      if (message.action === 'CLEAR') {
        run = null;
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

      if (message.action === 'GET_FILL_LOG') {
        sendResponse(getFillLog());
        return true;
      }
    });
  },
});
