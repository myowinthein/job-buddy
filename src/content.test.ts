import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/src/quick-fill/content', () => ({ installQuickFill: vi.fn() }));
vi.mock('@/src/demo/presence', () => ({ installDemoPresence: vi.fn() }));

vi.mock('@/src/utils/storage', () => ({ getGeminiSettings: vi.fn() }));

vi.mock('@/src/autofill/index', () => ({
  scanAutofill: vi.fn(),
  executeAutofill: vi.fn(),
  undoAutofill: vi.fn(),
  getLastResult: vi.fn(),
  getFillLog: vi.fn(),
  cancelAutofillRun: vi.fn(),
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
  scanAutofill, executeAutofill, undoAutofill, getLastResult, getFillLog, cancelAutofillRun,
} from '@/src/autofill/index';

import { getGeminiSettings } from '@/src/utils/storage';
import { DEFAULT_GEMINI_MODEL } from '@/src/resume-ai/types';
const settings = { apiKey: 'synthetic-key', model: DEFAULT_GEMINI_MODEL, preference: 'auto' as const, revision: null, verifiedAt: null };

type SendResponse = (r: unknown) => void;
function getListener(): (message: object, sender: object, sendResponse: SendResponse) => boolean | undefined {
  return onMessageAddListener.mock.calls[0][0];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(undoAutofill).mockResolvedValue(true);
  vi.mocked(getGeminiSettings).mockReset().mockResolvedValue(settings);
  // main()'s idempotency guard (see entrypoints/content.ts) sets a flag on
  // globalThis that would otherwise persist across tests in this same file
  // and silently no-op every main() call after the first.
  delete (globalThis as { __jobBuddyInjected?: boolean }).__jobBuddyInjected;
  (contentScript as { main: () => void }).main();
});

describe('content script — message dispatcher', () => {
  it('reuses a scan and fill when a background worker retries the same run', async () => {
    vi.mocked(scanAutofill).mockResolvedValue({ preFilledCount: 0, totalMatched: 1 });
    vi.mocked(executeAutofill).mockResolvedValue({ noReview: 1, needReview: 0, lowConfidence: 0, noData: 0, totalScanned: 1 });
    const responses = [vi.fn(), vi.fn(), vi.fn(), vi.fn()];
    getListener()({ action: 'AUTOFILL_SCAN', runId: 'durable-run' }, {}, responses[0]);
    getListener()({ action: 'AUTOFILL_SCAN', runId: 'durable-run' }, {}, responses[1]);
    await vi.waitFor(() => expect(responses[1]).toHaveBeenCalled());
    getListener()({ action: 'AUTOFILL_FILL', runId: 'durable-run', mode: 'merge' }, {}, responses[2]);
    getListener()({ action: 'AUTOFILL_FILL', runId: 'durable-run', mode: 'merge' }, {}, responses[3]);
    await vi.waitFor(() => expect(responses[3]).toHaveBeenCalled());
    expect(scanAutofill).toHaveBeenCalledOnce();
    expect(executeAutofill).toHaveBeenCalledOnce();
  });

  it('rejects a stale fill request and invalidates cancelled runs without clearing answers', async () => {
    vi.mocked(scanAutofill).mockResolvedValue({ preFilledCount: 1, totalMatched: 1 });
    const scanned = vi.fn();
    getListener()({ action: 'AUTOFILL_SCAN', runId: 'current-run' }, {}, scanned);
    await vi.waitFor(() => expect(scanned).toHaveBeenCalled());
    const stale = vi.fn();
    getListener()({ action: 'AUTOFILL_FILL', runId: 'other-run' }, {}, stale);
    expect(stale).toHaveBeenCalledWith({ error: 'autofill_failed' });
    getListener()({ action: 'AUTOFILL_CANCEL', runId: 'current-run' }, {}, vi.fn());
    expect(cancelAutofillRun).toHaveBeenCalledOnce();
    getListener()({ action: 'AUTOFILL_FILL', runId: 'current-run' }, {}, stale);
    expect(executeAutofill).not.toHaveBeenCalled();
    expect(undoAutofill).not.toHaveBeenCalled();
  });

  it.each(['AUTOFILL_SCAN', 'AUTOFILL_FILL'])('cancels %s even while its settings check is pending', async action => {
    vi.mocked(scanAutofill).mockResolvedValue({ preFilledCount: 0, totalMatched: 1 });
    const scanned = vi.fn();
    getListener()({ action: 'AUTOFILL_SCAN', runId: 'cancel-during-settings' }, {}, scanned);
    await vi.waitFor(() => expect(scanned).toHaveBeenCalled());
    vi.mocked(scanAutofill).mockClear();
    let release!: (value: typeof settings) => void;
    vi.mocked(getGeminiSettings).mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
    const response = vi.fn();
    const runId = action === 'AUTOFILL_SCAN' ? 'new-run' : 'cancel-during-settings';
    getListener()({ action, runId }, {}, response);
    getListener()({ action: 'AUTOFILL_CANCEL', runId }, {}, vi.fn());
    release(settings);
    await vi.waitFor(() => expect(response).toHaveBeenCalledWith({ error: 'autofill_failed' }));
    expect(scanAutofill).not.toHaveBeenCalled();
    expect(executeAutofill).not.toHaveBeenCalled();
  });

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

  it('reports a scan failure instead of a zero-field success', async () => {
    vi.mocked(scanAutofill).mockRejectedValue(new Error('scan failed'));
    const sendResponse = vi.fn();
    getListener()({ action: 'AUTOFILL_SCAN' }, {}, sendResponse);

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ error: 'autofill_failed' }));
  });

  it('forwards a shared run ID to the scan without changing the two-phase flow', async () => {
    vi.mocked(scanAutofill).mockResolvedValue({ preFilledCount: 0, totalMatched: 1 });
    const response = vi.fn();
    getListener()({ action: 'AUTOFILL_SCAN', runId: 'shared-run' }, {}, response);
    await vi.waitFor(() => expect(scanAutofill).toHaveBeenCalledWith('shared-run'));
    expect(executeAutofill).not.toHaveBeenCalled();
  });

  it('reads the latest log without requiring credentials or initiating a scan or fill', () => {
    vi.mocked(getGeminiSettings).mockRejectedValue(new Error('no key'));
    vi.mocked(getFillLog).mockReturnValue(null);
    const response = vi.fn();
    expect(getListener()({ action: 'GET_FILL_LOG' }, {}, response)).toBe(true);
    expect(response).toHaveBeenCalledWith(null);
    expect(getFillLog).toHaveBeenCalledOnce();
    expect(getGeminiSettings).not.toHaveBeenCalled();
    expect(scanAutofill).not.toHaveBeenCalled();
    expect(executeAutofill).not.toHaveBeenCalled();
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

  it('reports a fill failure instead of a zero-field success', async () => {
    vi.mocked(executeAutofill).mockRejectedValue(new Error('fill failed'));
    const sendResponse = vi.fn();
    getListener()({ action: 'AUTOFILL_FILL', mode: 'overwrite' }, {}, sendResponse);

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ error: 'autofill_failed' }));
  });

  it('routes CLEAR to undoAutofill and waits for confirmed success', async () => {
    const sendResponse = vi.fn();
    const handled = getListener()({ action: 'CLEAR' }, {}, sendResponse);

    expect(vi.mocked(undoAutofill)).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ success: true }));
    expect(handled).toBe(true);
  });

  it('reports incomplete or rejected Undo instead of success', async () => {
    vi.mocked(undoAutofill).mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('restore failed'));
    for (let i = 0; i < 2; i++) {
      const response = vi.fn();
      getListener()({ action: 'CLEAR' }, {}, response);
      await vi.waitFor(() => expect(response).toHaveBeenCalledWith({ success: false }));
    }
  });

  it('coalesces concurrent Undo requests for the same scan', async () => {
    let finish!: (success: boolean) => void;
    vi.mocked(undoAutofill).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const first = vi.fn(), second = vi.fn();
    getListener()({ action: 'CLEAR' }, {}, first);
    getListener()({ action: 'CLEAR' }, {}, second);
    expect(undoAutofill).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
    finish(true);
    await vi.waitFor(() => { expect(first).toHaveBeenCalledWith({ success: true }); expect(second).toHaveBeenCalledWith({ success: true }); });
  });

  it('routes GET_STATUS to getLastResult synchronously', () => {
    vi.mocked(getLastResult).mockReturnValue({ noReview: 3, needReview: 0, lowConfidence: 0, noData: 0, totalScanned: 3 });
    const sendResponse = vi.fn();
    getListener()({ action: 'GET_STATUS' }, {}, sendResponse);

    expect(sendResponse).toHaveBeenCalledWith({ noReview: 3, needReview: 0, lowConfidence: 0, noData: 0, totalScanned: 3 });
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

describe('required AI setup', () => {
  it.each(['AUTOFILL_SCAN', 'AUTOFILL_FILL'])(
    'blocks %s without a key before invoking the engine',
    async (action) => {
      vi.mocked(getGeminiSettings).mockResolvedValue({ ...settings, apiKey: null });
      const response = vi.fn();
      getListener()({ action }, {}, response);
      await vi.waitFor(() => expect(response).toHaveBeenCalledWith({ error: 'ai_setup_required' }));
      expect(scanAutofill).not.toHaveBeenCalled();
      expect(executeAutofill).not.toHaveBeenCalled();
    },
  );
  it('requires the saved model along with the key', async () => {
    vi.mocked(getGeminiSettings).mockResolvedValue({ ...settings, model: null });
    const response = vi.fn();
    getListener()({ action: 'AUTOFILL_FILL' }, {}, response);
    await vi.waitFor(() => expect(response).toHaveBeenCalledWith({ error: 'ai_setup_required' }));
    expect(executeAutofill).not.toHaveBeenCalled();
  });
  it('reports a settings read failure rather than treating it as an empty form', async () => {
    vi.mocked(getGeminiSettings).mockRejectedValue(new Error('read failed'));
    const response = vi.fn();
    getListener()({ action: 'AUTOFILL_SCAN' }, {}, response);
    await vi.waitFor(() =>
      expect(response).toHaveBeenCalledWith({ error: 'ai_settings_unavailable' }),
    );
    expect(scanAutofill).not.toHaveBeenCalled();
  });
  it('rechecks setup between the scan and fill phases', async () => {
    vi.mocked(scanAutofill).mockResolvedValue({ preFilledCount: 1, totalMatched: 1 });
    const scanned = vi.fn();
    getListener()({ action: 'AUTOFILL_SCAN' }, {}, scanned);
    await vi.waitFor(() => expect(scanned).toHaveBeenCalled());
    vi.mocked(getGeminiSettings).mockResolvedValue({ ...settings, apiKey: null });
    const filled = vi.fn();
    getListener()({ action: 'AUTOFILL_FILL', mode: 'overwrite' }, {}, filled);
    await vi.waitFor(() => expect(filled).toHaveBeenCalledWith({ error: 'ai_setup_required' }));
    expect(executeAutofill).not.toHaveBeenCalled();
  });
  it('allows Undo and previous results without reading AI settings', () => {
    vi.mocked(getGeminiSettings).mockRejectedValue(new Error('no settings'));
    const response = vi.fn();
    getListener()({ action: 'CLEAR' }, {}, response);
    getListener()({ action: 'GET_STATUS' }, {}, response);
    expect(undoAutofill).toHaveBeenCalledOnce();
    expect(getLastResult).toHaveBeenCalledOnce();
    expect(getGeminiSettings).not.toHaveBeenCalled();
  });
});
