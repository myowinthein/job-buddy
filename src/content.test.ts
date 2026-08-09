import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/src/autofill/index', () => ({
  scanAutofill: vi.fn(),
  executeAutofill: vi.fn(),
  undoAutofill: vi.fn(),
  getLastResult: vi.fn(),
  getDebugSession: vi.fn(),
  EMPTY_AUTOFILL_RESULT: { noReview: 0, needReview: 0, lowConfidence: 0, noData: 0, totalScanned: 0 },
}));

// entrypoints/content.ts calls the WXT-auto-imported `defineContentScript` at
// module top level (`export default defineContentScript({...})`). Its real
// implementation (wxt/dist/utils/define-content-script.mjs) is the identity
// function — inlined here since vi.hoisted must stay synchronous, same
// reasoning as the background.ts and popup/App.tsx tests.
const { onMessageAddListener } = vi.hoisted(() => {
  const onMessageAddListener = vi.fn();
  vi.stubGlobal('chrome', { runtime: { onMessage: { addListener: onMessageAddListener } } });
  vi.stubGlobal('defineContentScript', (def: unknown) => def);
  return { onMessageAddListener };
});

import contentScript from '@/entrypoints/content';
import {
  scanAutofill, executeAutofill, undoAutofill, getLastResult, getDebugSession, EMPTY_AUTOFILL_RESULT,
} from '@/src/autofill/index';

type SendResponse = (r: unknown) => void;
function getListener(): (message: object, sender: object, sendResponse: SendResponse) => boolean | undefined {
  return onMessageAddListener.mock.calls[0][0];
}

beforeEach(() => {
  vi.clearAllMocks();
  // main()'s idempotency guard (see entrypoints/content.ts) sets a flag on
  // globalThis that would otherwise persist across tests in this same file
  // and silently no-op every main() call after the first.
  delete (globalThis as { __jobBuddyInjected?: boolean }).__jobBuddyInjected;
  (contentScript as { main: () => void }).main();
});

describe('content script — message dispatcher', () => {
  it('declares allFrames: true and matches all URLs', () => {
    expect(contentScript.matches).toEqual(['*://*/*']);
    expect(contentScript.allFrames).toBe(true);
  });

  it('routes AUTOFILL_SCAN to scanAutofill and responds asynchronously (returns true)', async () => {
    vi.mocked(scanAutofill).mockResolvedValue({ preFilledCount: 2, totalMatched: 5 });
    const sendResponse = vi.fn();
    const handled = getListener()({ action: 'AUTOFILL_SCAN' }, {}, sendResponse);

    expect(handled).toBe(true);
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ preFilledCount: 2, totalMatched: 5 }));
  });

  it('falls back to a zeroed scan result when scanAutofill rejects', async () => {
    vi.mocked(scanAutofill).mockRejectedValue(new Error('scan failed'));
    const sendResponse = vi.fn();
    getListener()({ action: 'AUTOFILL_SCAN' }, {}, sendResponse);

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ preFilledCount: 0, totalMatched: 0 }));
  });

  it('routes AUTOFILL_FILL with mode "merge" through unchanged', async () => {
    vi.mocked(executeAutofill).mockResolvedValue({ noReview: 1, needReview: 0, lowConfidence: 0, noData: 0, totalScanned: 1 });
    const sendResponse = vi.fn();
    getListener()({ action: 'AUTOFILL_FILL', mode: 'merge' }, {}, sendResponse);

    await vi.waitFor(() => expect(vi.mocked(executeAutofill)).toHaveBeenCalledWith('merge'));
  });

  it('defaults any AUTOFILL_FILL mode other than "merge" to "overwrite"', async () => {
    vi.mocked(executeAutofill).mockResolvedValue({ noReview: 0, needReview: 0, lowConfidence: 0, noData: 0, totalScanned: 0 });
    const sendResponse = vi.fn();
    getListener()({ action: 'AUTOFILL_FILL', mode: undefined }, {}, sendResponse);

    await vi.waitFor(() => expect(vi.mocked(executeAutofill)).toHaveBeenCalledWith('overwrite'));
  });

  it('falls back to EMPTY_AUTOFILL_RESULT when executeAutofill rejects', async () => {
    vi.mocked(executeAutofill).mockRejectedValue(new Error('fill failed'));
    const sendResponse = vi.fn();
    getListener()({ action: 'AUTOFILL_FILL', mode: 'overwrite' }, {}, sendResponse);

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith(EMPTY_AUTOFILL_RESULT));
  });

  it('routes CLEAR to undoAutofill and responds synchronously with success', () => {
    const sendResponse = vi.fn();
    const handled = getListener()({ action: 'CLEAR' }, {}, sendResponse);

    expect(vi.mocked(undoAutofill)).toHaveBeenCalledTimes(1);
    expect(sendResponse).toHaveBeenCalledWith({ success: true });
    expect(handled).toBe(true);
  });

  it('routes GET_STATUS to getLastResult synchronously', () => {
    vi.mocked(getLastResult).mockReturnValue({ noReview: 3, needReview: 0, lowConfidence: 0, noData: 0, totalScanned: 3 });
    const sendResponse = vi.fn();
    getListener()({ action: 'GET_STATUS' }, {}, sendResponse);

    expect(sendResponse).toHaveBeenCalledWith({ noReview: 3, needReview: 0, lowConfidence: 0, noData: 0, totalScanned: 3 });
  });

  it('routes GET_DEBUG_SESSION to getDebugSession synchronously', () => {
    vi.mocked(getDebugSession).mockReturnValue(null);
    const sendResponse = vi.fn();
    getListener()({ action: 'GET_DEBUG_SESSION' }, {}, sendResponse);

    expect(sendResponse).toHaveBeenCalledWith(null);
  });

  it('does not respond to an unrecognized action', () => {
    const sendResponse = vi.fn();
    const handled = getListener()({ action: 'SOMETHING_UNKNOWN' }, {}, sendResponse);

    expect(sendResponse).not.toHaveBeenCalled();
    expect(handled).toBeUndefined();
  });
});

describe('content script — re-injection idempotency guard', () => {
  // popup/App.tsx's sendToAllFrames() actively re-injects this script via
  // chrome.scripting.executeScript before every message (see its own
  // comment for why) — main() can legitimately run more than once in the
  // same frame as a result. A second run must not register a second
  // message listener, which would otherwise double-handle every message.
  it('does not register a second listener when main() runs again in the same frame', () => {
    const callsBeforeSecondRun = onMessageAddListener.mock.calls.length;
    (contentScript as { main: () => void }).main();
    expect(onMessageAddListener.mock.calls.length).toBe(callsBeforeSecondRun);
  });
});
