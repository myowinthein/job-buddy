// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';

vi.mock('@/src/fill-log/client', () => ({ openFillLog: vi.fn().mockResolvedValue(undefined) }));

vi.mock('@/src/utils/storage', () => ({
  getProfile: vi.fn().mockResolvedValue({ personal: { firstName: 'Jane', lastName: 'Doe', email: 'jane@x.com' } }),
  getGeminiApiKey: vi.fn().mockResolvedValue('fake-key'),
}));
vi.mock('@/src/utils/sessionStorage', () => ({
  sessionSet: vi.fn().mockResolvedValue(undefined),
}));

// `entrypoints/popup/App.tsx` reads `chrome.runtime.getManifest()` at module
// top level (EXTENSION_VERSION), which runs at import time — before any
// plain `vi.stubGlobal` call textually preceding the import would execute,
// per real ESM import evaluation order. `vi.hoisted` forces this to run
// first, same as `vi.mock` factories.
const { sendMessageMock, getAllFramesMock, tabsQueryMock, executeScriptMock, runtimeSendMock } = vi.hoisted(() => {
  const sendMessageMock = vi.fn();
  const getAllFramesMock = vi.fn();
  const tabsQueryMock = vi.fn();
  const executeScriptMock = vi.fn().mockResolvedValue(undefined);
  const runtimeSendMock = vi.fn();

  vi.stubGlobal('chrome', {
    runtime: {
      getManifest: () => ({ version: '9.9.9' }),
      openOptionsPage: vi.fn(),
      lastError: null,
      sendMessage: runtimeSendMock,
    },
    tabs: {
      query: tabsQueryMock,
      sendMessage: sendMessageMock,
    },
    webNavigation: {
      getAllFrames: getAllFramesMock,
    },
    scripting: {
      executeScript: executeScriptMock,
    },
    storage: {
      session: {
        get: (_key: string, cb: (r: object) => void) => cb({}),
        set: (_items: object, cb: () => void) => cb(),
      },
    },
  });

  return { sendMessageMock, getAllFramesMock, tabsQueryMock, executeScriptMock, runtimeSendMock };
});

import App from '@/entrypoints/popup/App';
import { openFillLog } from '@/src/fill-log/client';
import { getProfile, getGeminiApiKey } from '@/src/utils/storage';
import type { Profile } from '@/src/types/profile';
import type { AIAutofillStatus } from '@/src/autofill/ai';
import { DEV_PROFILE } from '@/src/utils/devProfile';
import { AutofillCoordinator, type AutofillRun } from '@/src/autofill/runCoordinator';

function renderApp() {
  render(<App />);
}

async function readyFill() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Fill Form' })).toHaveProperty('disabled', false));
  return screen.getByRole('button', { name: 'Fill Form' });
}

// A "scan"/"status" response shape as returned by content.ts's AUTOFILL_SCAN
// or GET_STATUS handlers, keyed per frame.
function statusResult(overrides: Partial<Record<string, number>> = {}, aiStatus: AIAutofillStatus = 'not_needed') {
  return {
    noReview: 0, needReview: 0, lowConfidence: 0, noData: 0, totalScanned: 0,
    ...overrides,
    aiStatus,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getProfile).mockResolvedValue({ personal: { firstName: 'Jane', lastName: 'Doe', email: 'jane@x.com' } } as Profile);
  vi.mocked(getGeminiApiKey).mockResolvedValue('fake-key');
  tabsQueryMock.mockResolvedValue([{ id: 123 }]);
  getAllFramesMock.mockRejectedValue(new Error('unavailable')); // single top frame by default
  sendMessageMock.mockRejectedValue(new Error('no listener')); // idle by default
  executeScriptMock.mockResolvedValue(undefined); // injection succeeds by default
  const records = new Map<number, AutofillRun>();
  const coordinator = new AutofillCoordinator({
    read: async tabId => records.get(tabId) ?? null,
    write: async (tabId, run) => { if (run) records.set(tabId, run); else records.delete(tabId); },
    setup: async () => {
      try { return await getGeminiApiKey() ? undefined : 'ai_setup_required'; }
      catch { return 'ai_settings_unavailable'; }
    },
    frames: async () => {
      try { return await getAllFramesMock(); } catch { return [{ frameId: 0 }]; }
    },
    send: async (run, frame, message) => {
      await executeScriptMock({ target: { tabId: run.tabId, frameIds: [frame.frameId] }, files: ['content-scripts/content.js'] });
      return sendMessageMock(run.tabId, message, { frameId: frame.frameId });
    },
    alarm: async () => {},
  });
  runtimeSendMock.mockImplementation(async message => {
    if (message.action === 'AUTOFILL_RUN_START') return coordinator.start(message.tabId);
    if (message.action === 'AUTOFILL_RUN_STATUS') return coordinator.status(message.tabId);
    if (message.action === 'AUTOFILL_RUN_CONFIRM') return coordinator.confirm(message.tabId, message.runId, message.mode);
    if (message.action === 'AUTOFILL_RUN_CANCEL') { await coordinator.cancel(message.tabId, message.runId); return null; }
    return null;
  });
});

afterEach(cleanup);

describe('popup App — active content-script re-injection', () => {
  // Chrome's declarative content_scripts injection doesn't reliably re-run
  // for a frame whose document was populated asynchronously via
  // document.write() after the frame was created (e.g. HubSpot's
  // embedded-form iframe) — sendToAllFrames actively re-injects via
  // chrome.scripting.executeScript before messaging as a fallback.
  it('injects the content script into every frame before sending a message to it', async () => {
    getAllFramesMock.mockResolvedValue([{ frameId: 0 }, { frameId: 5 }]);
    sendMessageMock.mockResolvedValue(statusResult());

    renderApp();
    await waitFor(() => expect(executeScriptMock).toHaveBeenCalledTimes(2));

    expect(executeScriptMock).toHaveBeenCalledWith({
      target: { tabId: 123, frameIds: [0] },
      files: ['content-scripts/content.js'],
    });
    expect(executeScriptMock).toHaveBeenCalledWith({
      target: { tabId: 123, frameIds: [5] },
      files: ['content-scripts/content.js'],
    });
  });

  it('still messages a frame whose injection call rejects (already has the script from declarative injection)', async () => {
    getAllFramesMock.mockResolvedValue([{ frameId: 0 }, { frameId: 5 }]);
    executeScriptMock.mockImplementation(({ target }: { target: { frameIds: number[] } }) =>
      target.frameIds[0] === 5 ? Promise.reject(new Error('already injected')) : Promise.resolve(undefined),
    );
    sendMessageMock.mockImplementation((_tabId, message, opts) => {
      if (message.action !== 'GET_STATUS') return Promise.reject(new Error('n/a'));
      if (opts.frameId === 5) return Promise.resolve(statusResult({ noReview: 3, totalScanned: 3 }));
      return Promise.reject(new Error('no listener'));
    });

    renderApp();
    await waitFor(() => expect(screen.getByText('3 fields filled')).toBeTruthy());
  });
});

describe('popup App — GET_STATUS frame aggregation on mount', () => {
  it('sums per-frame results across multiple frames into one merged state', async () => {
    getAllFramesMock.mockResolvedValue([{ frameId: 0 }, { frameId: 7 }]);
    sendMessageMock.mockImplementation((_tabId, message, opts) => {
      if (message.action !== 'GET_STATUS') return Promise.reject(new Error('n/a'));
      if (opts.frameId === 0) return Promise.resolve(statusResult({ noReview: 2, totalScanned: 3 }));
      if (opts.frameId === 7) return Promise.resolve(statusResult({ noReview: 1, totalScanned: 2 }));
      return Promise.reject(new Error('no listener'));
    });

    renderApp();
    // Both frames contribute to the compact filled count.
    await waitFor(() => expect(screen.getByText('3 fields filled')).toBeTruthy());
  });

  it('requires AI setup without a key while keeping previous results and Undo available', async () => {
    vi.mocked(getGeminiApiKey).mockResolvedValue(null);
    sendMessageMock.mockImplementation((_tabId, message) => Promise.resolve(message.action === 'CLEAR' ? { success: true } : statusResult({ noReview: 1, totalScanned: 1 }, 'unavailable')));
    renderApp();
    expect(await screen.findByRole('button', { name: 'Set Up AI Autofill' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Fill Form' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Dismiss AI suggestion' })).toBeNull();
  });

  it('drops frames with no listener (rejected sendMessage) and still aggregates the rest', async () => {
    getAllFramesMock.mockResolvedValue([{ frameId: 0 }, { frameId: 9 }]);
    sendMessageMock.mockImplementation((_tabId, message, opts) => {
      if (message.action !== 'GET_STATUS') return Promise.reject(new Error('n/a'));
      if (opts.frameId === 0) return Promise.resolve(statusResult({ noReview: 5, totalScanned: 5 }));
      return Promise.reject(new Error('no listener')); // frame 9: ad/tracker iframe, no content script
    });

    renderApp();
    await waitFor(() => expect(screen.getByText('5 fields filled')).toBeTruthy());
  });

  it('stays idle (no crash) when every frame rejects', async () => {
    sendMessageMock.mockRejectedValue(new Error('no listener anywhere'));
    renderApp();
    await readyFill();
    expect(screen.queryByText('Undo')).toBeNull();
  });

  it('restores filled fields even when a later unrelated empty frame reports another run', async () => {
    getAllFramesMock.mockResolvedValue([{ frameId: 0 }, { frameId: 9 }]);
    sendMessageMock.mockImplementation((_id, message, options) => Promise.resolve(
      message.action !== 'GET_STATUS' ? null : options.frameId === 0
        ? { ...statusResult({ noReview: 4, totalScanned: 4 }), runId: 'form', startedAt: 10 }
        : { ...statusResult(), runId: 'empty-sandbox', startedAt: 20 },
    ));
    renderApp();
    expect(await screen.findByText('4 fields filled')).toBeTruthy();
    expect(screen.queryByText('No fillable fields found.')).toBeNull();
  });

  it('keeps an earlier script’s filled result when only an empty iframe has run metadata', async () => {
    getAllFramesMock.mockResolvedValue([{ frameId: 0 }, { frameId: 9 }]);
    sendMessageMock.mockImplementation((_id, message, options) => Promise.resolve(
      message.action !== 'GET_STATUS' ? null : options.frameId === 0
        ? statusResult({ noReview: 7, lowConfidence: 5, totalScanned: 12 })
        : { ...statusResult(), runId: 'empty-sandbox', startedAt: 20 },
    ));
    renderApp();
    expect(await screen.findByText('7 fields filled')).toBeTruthy();
  });

  it('keeps every frame in the latest run and excludes older or legacy results', async () => {
    getAllFramesMock.mockResolvedValue([{ frameId: 0 }, { frameId: 3 }, { frameId: 7 }, { frameId: 9 }]);
    const replies = [
      { ...statusResult({ noReview: 8, totalScanned: 8 }), runId: 'old', startedAt: 100 },
      { ...statusResult({ noReview: 2, kept: 1, failed: 1, totalScanned: 4 }), runId: 'latest', startedAt: 200 },
      { ...statusResult({ noReview: 1, excluded: 1, totalScanned: 2 }), runId: 'latest', startedAt: 201 },
      statusResult({ noReview: 5, totalScanned: 5 }),
    ];
    sendMessageMock.mockImplementation((_id, message, options) => Promise.resolve(
      message.action === 'GET_STATUS' ? replies[[0, 3, 7, 9].indexOf(options.frameId)] : null,
    ));
    renderApp();
    expect(await screen.findByText('3 fields filled')).toBeTruthy();
    expect(screen.getByText('1 field still needs your input.')).toBeTruthy();
    expect(screen.getByText('1 existing answer kept.')).toBeTruthy();
  });

  it('reports an unavailable AI pass even when another frame succeeds', async () => {
    getAllFramesMock.mockResolvedValue([{ frameId: 0 }, { frameId: 3 }]);
    sendMessageMock.mockImplementation((_tabId, message, opts) => {
      if (message.action !== 'GET_STATUS') return Promise.resolve(null);
      return Promise.resolve(statusResult({ totalScanned: 1 }, opts.frameId === 0 ? 'unavailable' : 'succeeded'));
    });
    renderApp();
    expect(await screen.findByText('AI was unavailable, but basic autofill still ran.')).toBeTruthy();
    expect(screen.getByRole('alert').className).toContain('border-amber-500');
  });
});

describe('popup App — handleAutofill scan orchestration', () => {
  it('uses the explicitly requested empty run rather than resurrecting an older filled run', async () => {
    getAllFramesMock.mockResolvedValue([{ frameId: 0 }, { frameId: 9 }]);
    let runId = '';
    sendMessageMock.mockImplementation((_id, message, options) => {
      if (message.action === 'GET_STATUS') return Promise.resolve(null);
      if (message.action === 'AUTOFILL_SCAN') { runId = message.runId; return Promise.resolve({ preFilledCount: 0 }); }
      if (message.action === 'AUTOFILL_FILL') return Promise.resolve(options.frameId === 0
        ? { ...statusResult({ noReview: 4, totalScanned: 4 }), runId: 'old', startedAt: 10 }
        : { ...statusResult(), runId, startedAt: 20 });
      return Promise.resolve(null);
    });
    renderApp();
    fireEvent.click(await readyFill());
    expect(await screen.findByText('No fillable fields found.')).toBeTruthy();
    expect(screen.queryByText('4 fields filled')).toBeNull();
  });
  it('shows the merge/overwrite confirmation dialog when scanned pre-filled fields sum > 0 across frames', async () => {
    getAllFramesMock.mockResolvedValue([{ frameId: 0 }, { frameId: 4 }]);
    sendMessageMock.mockImplementation((_tabId, message, opts) => {
      if (message.action === 'GET_STATUS') return Promise.reject(new Error('no listener'));
      if (message.action === 'AUTOFILL_SCAN') {
        if (opts.frameId === 0) return Promise.resolve({ preFilledCount: 2 });
        if (opts.frameId === 4) return Promise.resolve({ preFilledCount: 1 });
      }
      return Promise.reject(new Error('n/a'));
    });

    renderApp();
    fireEvent.click(await readyFill());
    expect(await screen.findByText('This form already has some answers.')).toBeTruthy();
    expect(screen.getByRole('radio', { name: /^Fill empty fields/ })).toHaveProperty('checked', true);
  });

  it('dispatches an overwrite fill directly when the scan sums to zero pre-filled fields', async () => {
    sendMessageMock.mockImplementation((_tabId, message) => {
      if (message.action === 'GET_STATUS') return Promise.reject(new Error('no listener'));
      if (message.action === 'AUTOFILL_SCAN') return Promise.resolve({ preFilledCount: 0 });
      if (message.action === 'AUTOFILL_FILL' && message.mode === 'overwrite') {
        return Promise.resolve(statusResult({ noReview: 4, totalScanned: 4 }));
      }
      return Promise.reject(new Error('n/a'));
    });

    renderApp();
    fireEvent.click(await readyFill());
    expect(screen.queryByText('This form already has some answers.')).toBeNull();
    await waitFor(() => expect(screen.getByText('4 fields filled')).toBeTruthy());
  });

  it('confirming the dialog dispatches fill with the selected mode and merges the result', async () => {
    sendMessageMock.mockImplementation((_tabId, message) => {
      if (message.action === 'GET_STATUS') return Promise.reject(new Error('no listener'));
      if (message.action === 'AUTOFILL_SCAN') return Promise.resolve({ preFilledCount: 1 });
      if (message.action === 'AUTOFILL_FILL' && message.mode === 'merge') {
        return Promise.resolve(statusResult({ needReview: 2, totalScanned: 2 }));
      }
      return Promise.reject(new Error('n/a'));
    });

    renderApp();
    fireEvent.click(await readyFill());
    await screen.findByText('This form already has some answers.');
    fireEvent.click(screen.getByRole('button', { name: 'Fill Form' })); // default fillMode is 'merge'

    await waitFor(() => expect(screen.getByText('2 fields filled')).toBeTruthy());
  });

  it('shows an error state when no active tab can be found', async () => {
    tabsQueryMock.mockResolvedValue([]); // no tab.id
    renderApp();
    fireEvent.click(await readyFill());
    expect(await screen.findByText(/Refresh the page to retry after an autofill error/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Report/ })).toBeNull();
  });

  it('shows an error state when every frame\'s fill response is invalid, distinct from the no-tab case', async () => {
    // A tab is found and the scan succeeds, but AUTOFILL_FILL comes back
    // shaped wrong in every frame — mergeAutofillResults filters all of them
    // out and returns null, taking the else-branch setAutofillState('error')
    // in dispatchFill rather than a thrown/caught error.
    sendMessageMock.mockImplementation((_tabId, message) => {
      if (message.action === 'GET_STATUS') return Promise.reject(new Error('no listener'));
      if (message.action === 'AUTOFILL_SCAN') return Promise.resolve({ preFilledCount: 0 });
      if (message.action === 'AUTOFILL_FILL') return Promise.resolve({ malformed: true }); // no totalScanned
      return Promise.reject(new Error('n/a'));
    });

    renderApp();
    fireEvent.click(await readyFill());
    expect(await screen.findByText(/Refresh the page to retry after an autofill error/)).toBeTruthy();
  });
});

describe('popup App — Fill Details access', () => {
  it('opens the full-page log for the original application tab', async () => {
    sendMessageMock.mockImplementation((_tabId, message) => Promise.resolve(message.action === 'CLEAR' ? { success: true } : statusResult({ noReview: 3, totalScanned: 3 })));
    renderApp();
    const details = await screen.findByRole('button', { name: 'View details' });
    expect(details.closest('section')).toBe(screen.getByRole('region', { name: 'Fill results' }));
    fireEvent.click(details);
    expect(openFillLog).toHaveBeenCalledWith(123);
    expect(sendMessageMock.mock.calls.some(([, message]) => message.action === 'GET_DEBUG_SESSION')).toBe(false);
  });

  it('keeps the logo noninteractive while the public details action remains available', async () => {
    sendMessageMock.mockImplementation((_tabId, message) => Promise.resolve(message.action === 'CLEAR' ? { success: true } : statusResult({ noReview: 1, totalScanned: 1 })));
    renderApp();
    const details = await screen.findByRole('button', { name: 'View details' });
    const logo = screen.getByRole('img', { name: 'Job Buddy' });
    expect(logo.getAttribute('tabindex')).toBeNull();
    fireEvent.click(logo);
    expect(openFillLog).not.toHaveBeenCalled();
    fireEvent.click(details);
    expect(openFillLog).toHaveBeenCalledWith(123);
  });

  it('reports a failed log open without losing Fill Form and Undo', async () => {
    vi.mocked(openFillLog).mockRejectedValueOnce(new Error('could not open'));
    sendMessageMock.mockImplementation((_tabId, message) => Promise.resolve(message.action === 'CLEAR' ? { success: true } : statusResult({ noReview: 1, totalScanned: 1 })));
    renderApp();
    fireEvent.click(await screen.findByRole('button', { name: 'View details' }));
    expect(await screen.findByText('Please try opening Fill Details again.')).toBeTruthy();
    expect(screen.getByRole('alert').className).toContain('border-red-500');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fill Form' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'View details' }));
    await waitFor(() => expect(screen.queryByText('Please try opening Fill Details again.')).toBeNull());
    expect(screen.getByText('1 field filled')).toBeTruthy();
  });
});

describe('popup message categories', () => {
  it('treats missing AI setup as information and failed settings reads as errors', async () => {
    vi.mocked(getGeminiApiKey).mockResolvedValue(null);
    renderApp();
    await screen.findByRole('button', { name: 'Set Up AI Autofill' });
    expect(screen.getByRole('status').className).toContain('border-blue-500');
    expect(screen.queryByRole('alert')).toBeNull();
    cleanup();
    vi.mocked(getGeminiApiKey).mockRejectedValue(new Error('read failed'));
    renderApp();
    await screen.findByRole('button', { name: 'Retry AI Settings' });
    expect(screen.getByRole('alert').className).toContain('border-red-500');
    expect(screen.getByText('Your saved AI settings could not be loaded.')).toBeTruthy();
  });

  it('retries AI settings in place while retaining previous results and Undo', async () => {
    vi.mocked(getGeminiApiKey).mockRejectedValueOnce(new Error('storage unavailable'));
    sendMessageMock.mockImplementation((_tabId, message) => Promise.resolve(message.action === 'CLEAR' ? { success: true } : statusResult({ noReview: 2, totalScanned: 2 })));
    renderApp();
    const retry = await screen.findByRole('button', { name: 'Retry AI Settings' });
    await screen.findByText('2 fields filled');
    let finishRead!: (value: string | null) => void;
    vi.mocked(getGeminiApiKey).mockReturnValueOnce(
      new Promise((resolve) => {
        finishRead = resolve;
      }),
    );
    fireEvent.click(retry);
    expect(await screen.findByText('Loading AI settings…')).toBeTruthy();
    expect(retry).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
    finishRead('saved-key');
    await readyFill();
    expect(screen.queryByText('Your saved AI settings could not be loaded.')).toBeNull();
    expect(screen.getByText('2 fields filled')).toBeTruthy();
    expect(chrome.runtime.openOptionsPage).not.toHaveBeenCalled();
  });

  it('offers key setup when retry finds no saved key', async () => {
    vi.mocked(getGeminiApiKey).mockRejectedValueOnce(new Error('storage unavailable'));
    renderApp();
    const retry = await screen.findByRole('button', { name: 'Retry AI Settings' });
    vi.mocked(getGeminiApiKey).mockResolvedValueOnce(null);
    fireEvent.click(retry);
    await screen.findByRole('button', { name: 'Set Up AI Autofill' });
    expect(screen.queryByRole('button', { name: 'Fill Form' })).toBeNull();
  });

  it('summarizes an all-kept merge as kept answers rather than a failed fill', async () => {
    sendMessageMock.mockImplementation((_tabId, message) => Promise.resolve(message.action === 'CLEAR' ? { success: true } : statusResult({ kept: 4, totalScanned: 4 })));
    renderApp();
    expect(await screen.findByText('4 existing answers kept')).toBeTruthy();
    expect(screen.queryByText('0 fields filled')).toBeNull();
    expect(screen.getByRole('status').className).toContain('border-gray-300');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
  });

  it('keeps previous results and Undo accessible after the profile cannot be loaded', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(getProfile).mockRejectedValueOnce(new Error('read failed'));
    sendMessageMock.mockImplementation((_tabId, message) => Promise.resolve(message.action === 'CLEAR' ? { success: true } : statusResult({ noReview: 1, totalScanned: 1 })));
    renderApp();
    await screen.findByRole('button', { name: 'Open Profile' });
    expect(screen.getByText('Last fill')).toBeTruthy();
    expect(screen.getByText('1 field filled')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull());
    expect(sendMessageMock).toHaveBeenCalledWith(123, { action: 'CLEAR' }, { frameId: 0 });
    error.mockRestore();
  });
});

describe('popup App — Undo', () => {
  it('sends CLEAR to all frames and resets to idle even if some frames reject', async () => {
    getAllFramesMock.mockResolvedValue([{ frameId: 0 }, { frameId: 2 }]);
    let clearCalledFrames: number[] = [];
    sendMessageMock.mockImplementation((_tabId, message, opts) => {
      if (message.action === 'GET_STATUS') return Promise.resolve(statusResult({ noReview: 1, totalScanned: 1 }));
      if (message.action === 'CLEAR') {
        clearCalledFrames.push(opts.frameId);
        if (opts.frameId === 2) return Promise.reject(new Error('gone'));
        return Promise.resolve({ success: true });
      }
      return Promise.reject(new Error('n/a'));
    });

    renderApp();
    fireEvent.click(await screen.findByText('Undo'));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Fill Form' })).toBeTruthy());
    expect(screen.queryByText('Undo')).toBeNull();
    expect(clearCalledFrames.sort()).toEqual([0, 2]);
  });
  it('keeps Undo and the previous results visible after an incomplete restoration', async () => {
    sendMessageMock.mockImplementation((_tabId, message) => Promise.resolve(message.action === 'CLEAR' ? { success: false } : statusResult({ noReview: 1, totalScanned: 1 })));
    renderApp();
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await screen.findByText('Undo incomplete. Review the remaining answers.');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fill Form' })).toHaveProperty('disabled', false);
  });

});

// Required progress uses all completion checks; autofill needs a valid first name and email.
describe('popup profile and action presentation', () => {
  it.each([
    [0, {}],
    [10, { personal: { firstName: 'Jane' } }],
    [40, { personal: DEV_PROFILE.personal, address: { city: 'Austin', country: '' } }],
    [50, { personal: DEV_PROFILE.personal, address: DEV_PROFILE.address }],
    [80, { ...DEV_PROFILE, languages: [], documents: { cv: {} } }],
    [90, { ...DEV_PROFILE, documents: { cv: {} } }],
    [100, DEV_PROFILE],
  ] as const)('shows saved required progress consistently at %s%%', async (percentage, profile) => {
    vi.mocked(getProfile).mockResolvedValue(profile as unknown as Profile);
    renderApp();
    await screen.findByRole('progressbar');
    const progress = screen.getByRole('progressbar', { name: 'Saved required profile details' });
    expect(progress.getAttribute('aria-valuenow')).toBe(String(percentage));
    expect(progress.firstElementChild?.className).toContain(
      percentage === 100 ? 'bg-green-500' : 'bg-blue-500',
    );
    expect(
      screen.getByText(percentage === 100 ? 'Required details complete' : 'Required profile'),
    ).toBeTruthy();
    if (percentage === 100) expect(screen.queryByText('100%')).toBeNull();
    else expect(screen.getByText(`${percentage}%`)).toBeTruthy();
    expect(screen.queryByText(/ready to apply|Almost there|optional fields available/)).toBeNull();
  });

  it.each([
    { links: { linkedin: 'https://linkedin.com/in/jane' } },
    { personal: { lastName: 'Doe' } },
    { professional: { summary: 'Frontend engineer' } },
  ])('requires identity setup at 0%% even when optional profile data exists: %j', async (profile) => {
    vi.mocked(getProfile).mockResolvedValue(profile as unknown as Profile);
    renderApp();
    const setup = await screen.findByRole('button', { name: 'Set Up Profile' });
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0');
    await waitFor(() => expect(document.activeElement).toBe(setup));
    expect(screen.queryByRole('button', { name: 'Fill Form' })).toBeNull();
    expect(screen.getByText('Add your first name and email to enable autofill.')).toBeTruthy();
    fireEvent.click(setup);
    expect(chrome.runtime.openOptionsPage).toHaveBeenCalled();
    expect(sendMessageMock.mock.calls.some(([, message]) => message.action === 'AUTOFILL_SCAN')).toBe(false);
  });

  it.each([
    [{ firstName: 'Jane' }, 'email'],
    [{ email: 'jane@example.test' }, 'first name'],
    [{ firstName: '  ', email: 'jane@example.test' }, 'first name'],
    [{ firstName: 'Jane', email: 'invalid' }, 'email'],
    [{ firstName: 'J'.repeat(101), email: 'jane@example.test' }, 'first name'],
  ])('requires a valid missing identity field: %j', async (personal, missing) => {
    vi.mocked(getProfile).mockResolvedValue({ personal } as Profile);
    renderApp();
    await screen.findByRole('button', { name: 'Set Up Profile' });
    expect(screen.queryByRole('button', { name: 'Fill Form' })).toBeNull();
    expect(screen.getByText(`Add your ${missing} to enable autofill.`)).toBeTruthy();
  });

  it('enables Fill Form with a valid first name and email at 20% completion', async () => {
    renderApp();
    await readyFill();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('20');
    expect(screen.queryByRole('button', { name: 'Set Up Profile' })).toBeNull();
  });

  it('retains previous results and Undo when identity setup is needed', async () => {
    vi.mocked(getProfile).mockResolvedValue({ personal: { firstName: 'Jane' } } as Profile);
    sendMessageMock.mockImplementation(async (_id, message) =>
      message.action === 'GET_STATUS' ? statusResult({ noReview: 1, totalScanned: 1 }) : { success: true },
    );
    renderApp();
    await screen.findByRole('button', { name: 'Set Up Profile' });
    expect(await screen.findByText('Last fill')).toBeTruthy();
    expect(screen.getByText('1 field filled')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'View details' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull());
  });

  it.each([
    null,
    {
      id: 'empty',
      personal: { firstName: '', lastName: '', email: '' },
      links: { linkedin: '', custom: [] },
    },
  ])('offers setup for an empty profile', async (profile) => {
    vi.mocked(getProfile).mockResolvedValue(profile as Profile | null);
    renderApp();
    const setup = await screen.findByRole('button', { name: 'Set Up Profile' });
    await waitFor(() => expect(document.activeElement).toBe(setup));
    expect(screen.queryByRole('button', { name: 'Fill Form' })).toBeNull();
  });

  it('reports a profile load failure rather than suggesting the profile is empty', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(getProfile).mockRejectedValueOnce(new Error('storage failed'));
    renderApp();
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('Open Profile to retry loading'),
    );
    expect(screen.getByRole('button', { name: 'Open Profile' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Set Up Profile' })).toBeNull();
    error.mockRestore();
  });

  it('does not show an empty details region before filling', async () => {
    renderApp();
    await readyFill();
    expect(screen.queryByRole('region', { name: 'Autofill details' })).toBeNull();
    expect(screen.queryByText('Open a job application form, then select Fill Form.')).toBeNull();
  });
});

it('does not ask for another AI key when a saved key exists but the fill did not use AI', async () => {
  sendMessageMock.mockResolvedValue(
    statusResult(
      { noReview: 2, needReview: 1, lowConfidence: 1, noData: 1, totalScanned: 5 },
      'unavailable',
    ),
  );
  renderApp();
  await screen.findByRole('button', { name: 'Undo' });
  expect(screen.getByRole('banner').querySelector('svg')).toBeNull();
  expect(screen.getByRole('button', { name: 'Fill Form' }).querySelector('svg')).not.toBeNull();
  expect(screen.queryByRole('button', { name: 'Dismiss AI suggestion' })).toBeNull();
  expect(screen.getByText('3 fields filled')).toBeTruthy();
  expect(screen.getByText(/1 filled value needs review/)).toBeTruthy();
  expect(screen.getByText(/2 fields still need your input/)).toBeTruthy();
  expect(screen.queryByText('High confidence')).toBeNull();
  expect(screen.getByRole('button', { name: 'View details' })).toBeTruthy();
  expect(screen.getByRole('alert').textContent).toContain('AI was unavailable,');
  expect(screen.getAllByRole('alert')).toHaveLength(1);
  const summary = screen.getByRole('region', { name: 'Fill results' });
  expect(summary.parentElement?.className).toContain('border-t');
  expect(summary.parentElement?.textContent).toContain('Last fill');
  expect(summary.textContent).not.toContain('AI was unavailable');
  expect(screen.queryByText(/choose a value|No Review/)).toBeNull();
});

it('blocks a new fill without a key instead of showing the old dismissible AI suggestion', async () => {
  vi.mocked(getGeminiApiKey).mockResolvedValue(null);
  renderApp();
  expect(await screen.findByRole('button', { name: 'Set Up AI Autofill' })).toBeTruthy();
  expect(screen.getByText('Add a Gemini API key to enable autofill.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Fill Form' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Dismiss AI suggestion' })).toBeNull();
  expect(
    sendMessageMock.mock.calls.some(
      ([, message]) => message.action === 'AUTOFILL_SCAN' || message.action === 'AUTOFILL_FILL',
    ),
  ).toBe(false);
});

it('preserves the overwrite choice and fills without rescanning after confirmation', async () => {
  sendMessageMock.mockImplementation(async (_tabId, message) => {
    if (message.action === 'AUTOFILL_SCAN') return { preFilledCount: 2 };
    if (message.action === 'AUTOFILL_FILL') return statusResult({ noReview: 2, totalScanned: 2 });
    return null;
  });
  renderApp();
  fireEvent.click(await readyFill());
  fireEvent.click(await screen.findByRole('radio', { name: /Fill all matched fields/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Fill Form' }));
  await screen.findByRole('button', { name: 'Undo' });
  expect(sendMessageMock).toHaveBeenCalledWith(
    123,
    expect.objectContaining({ action: 'AUTOFILL_FILL', mode: 'overwrite', runId: expect.any(String) }),
    { frameId: 0 },
  );
  expect(
    sendMessageMock.mock.calls.filter(([, message]) => message.action === 'AUTOFILL_SCAN'),
  ).toHaveLength(1);
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Fill Form' }));
});

it('shows a no-form explanation without promoting AI or suggesting iframes are unsupported', async () => {
  vi.mocked(getGeminiApiKey).mockResolvedValue(null);
  sendMessageMock.mockImplementation((_tabId, message) => Promise.resolve(message.action === 'CLEAR' ? { success: true } : statusResult({}, 'unavailable')));
  renderApp();
  await screen.findByText('No fillable fields found.');
  expect(screen.queryByText('Open the application form, then try Fill Form again.')).toBeNull();
  expect(screen.queryByRole('link', { name: /Report/ })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Dismiss AI suggestion' })).toBeNull();
  expect(screen.queryByText(/iframe/)).toBeNull();
});

it('stores the Settings focus request before opening the options page', async () => {
  const { sessionSet } = await import('@/src/utils/sessionStorage');
  let stored!: () => void;
  vi.mocked(sessionSet).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        stored = resolve;
      }),
  );
  vi.mocked(getGeminiApiKey).mockResolvedValue(null);
  sendMessageMock.mockImplementation((_tabId, message) => Promise.resolve(message.action === 'CLEAR' ? { success: true } : statusResult({ noReview: 1, totalScanned: 1 }, 'unavailable')));
  renderApp();
  fireEvent.click(await screen.findByRole('button', { name: 'Set Up AI Autofill' }));
  expect(chrome.runtime.openOptionsPage).not.toHaveBeenCalled();
  stored();
  await waitFor(() => expect(chrome.runtime.openOptionsPage).toHaveBeenCalledOnce());
  expect(sessionSet).toHaveBeenCalledWith({ 'jb:focusOnLoad': 'gemini-api-key' });
});

it('distinguishes an AI settings read failure from missing-key setup', async () => {
  vi.mocked(getGeminiApiKey).mockRejectedValueOnce(new Error('storage unavailable'));
  sendMessageMock.mockImplementation((_tabId, message) => Promise.resolve(message.action === 'CLEAR' ? { success: true } : statusResult({ noReview: 1, totalScanned: 1 }, 'unavailable')));
  renderApp();
  await screen.findByRole('button', { name: 'Undo' });
  expect(await screen.findByRole('button', { name: 'Retry AI Settings' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Fill Form' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Dismiss AI suggestion' })).toBeNull();
});

it('announces a pending fill, prevents duplicate actions, and returns focus after completion', async () => {
  let complete!: (result: ReturnType<typeof statusResult>) => void;
  sendMessageMock.mockImplementation(async (_tabId, message) => {
    if (message.action === 'AUTOFILL_SCAN') return { preFilledCount: 0 };
    if (message.action === 'AUTOFILL_FILL')
      return new Promise<ReturnType<typeof statusResult>>((resolve) => {
        complete = resolve;
      });
    return null;
  });
  renderApp();
  fireEvent.click(await readyFill());
  await screen.findByText('Filling…');
  expect(screen.getByRole('button', { name: 'Fill Form' })).toHaveProperty('disabled', true);
  expect(screen.getByRole('button', { name: 'Complete Profile' })).toHaveProperty('disabled', true);
  expect(screen.getByRole('status').textContent).toBe('Filling…');
  await waitFor(() => expect(complete).toBeTypeOf('function'));
  complete(statusResult({ noReview: 1, totalScanned: 1 }));
  await screen.findByRole('button', { name: 'Undo' });
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Fill Form' }));
});

it('waits for key loading before offering setup or filling', async () => {
  let finish!: (key: string | null) => void;
  vi.mocked(getGeminiApiKey).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  renderApp();
  await screen.findByText('Loading AI settings…');
  expect(screen.getByRole('button', { name: 'Fill Form' })).toHaveProperty('disabled', true);
  expect(screen.queryByRole('button', { name: 'Set Up AI Autofill' })).toBeNull();
  finish(null);
  await screen.findByRole('button', { name: 'Set Up AI Autofill' });
});

it('rechecks a key removed after opening without sending scan or fill messages', async () => {
  renderApp();
  const fill = await readyFill();
  vi.mocked(getGeminiApiKey).mockResolvedValue(null);
  fireEvent.click(fill);
  await screen.findByRole('button', { name: 'Set Up AI Autofill' });
  expect(
    sendMessageMock.mock.calls.some(([, message]) =>
      ['AUTOFILL_SCAN', 'AUTOFILL_FILL'].includes(message.action),
    ),
  ).toBe(false);
});

it('rechecks the key when confirming existing values', async () => {
  sendMessageMock.mockImplementation(async (_id, message) =>
    message.action === 'AUTOFILL_SCAN' ? { preFilledCount: 1 } : null,
  );
  renderApp();
  fireEvent.click(await readyFill());
  await screen.findByRole('radio', { name: /^Fill empty fields/ });
  vi.mocked(getGeminiApiKey).mockResolvedValue(null);
  fireEvent.click(screen.getByRole('button', { name: 'Fill Form' }));
  await screen.findByRole('button', { name: 'Set Up AI Autofill' });
  expect(sendMessageMock.mock.calls.some(([, message]) => message.action === 'AUTOFILL_FILL')).toBe(
    false,
  );
});

it('honors a setup rejection from a content frame without dispatching fill', async () => {
  sendMessageMock.mockImplementation(async (_id, message) =>
    message.action === 'AUTOFILL_SCAN' ? { error: 'ai_setup_required' } : null,
  );
  renderApp();
  fireEvent.click(await readyFill());
  await screen.findByRole('button', { name: 'Set Up AI Autofill' });
  expect(sendMessageMock.mock.calls.some(([, message]) => message.action === 'AUTOFILL_FILL')).toBe(
    false,
  );
});

it.each(['succeeded', 'not_needed'] as const)(
  'does not warn about a %s AI pass',
  async (aiStatus) => {
    sendMessageMock.mockImplementation((_tabId, message) => Promise.resolve(message.action === 'CLEAR' ? { success: true } : statusResult({ noReview: 1, totalScanned: 1 }, aiStatus)));
    renderApp();
    await screen.findByRole('button', { name: 'Undo' });
    expect(
      screen.queryByText('AI was unavailable, but basic autofill still ran.'),
    ).toBeNull();
  },
);

it('keeps legacy fill results available without warning about unknown AI outcomes', async () => {
  const result = {
    noReview: 1,
    needReview: 0,
    lowConfidence: 0,
    noData: 0,
    totalScanned: 1,
    aiAvailable: true,
  };
  sendMessageMock.mockResolvedValue(result);
  renderApp();
  await screen.findByRole('button', { name: 'Undo' });
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByText('1 field filled')).toBeTruthy();
});

it('can undo previous fills after the key is removed', async () => {
  vi.mocked(getGeminiApiKey).mockResolvedValue(null);
  sendMessageMock.mockImplementation(async (_id, message) =>
    message.action === 'GET_STATUS'
      ? statusResult({ noReview: 1, totalScanned: 1 })
      : { success: true },
  );
  renderApp();
  await screen.findByRole('button', { name: 'Set Up AI Autofill' });
  fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull());
  expect(sendMessageMock).toHaveBeenCalledWith(123, { action: 'CLEAR' }, { frameId: 0 });
});


it('does not restore a cancelled choice from a delayed startup reply', async () => {
  let release!: () => void;
  const route = runtimeSendMock.getMockImplementation()!;
  runtimeSendMock.mockImplementation(async message => {
    const result = await route(message);
    if (message.action === 'AUTOFILL_RUN_START') await new Promise<void>(resolve => { release = resolve; });
    return result;
  });
  sendMessageMock.mockImplementation(async (_tabId, message) => {
    if (message.action === 'AUTOFILL_SCAN') return { preFilledCount: 1 };
    return null;
  });
  renderApp();
  fireEvent.click(await readyFill());
  // Polling discovers the choice while the original message is still pending.
  await screen.findByRole('radio', { name: /^Fill empty fields/ });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await act(async () => { release(); });
  expect(screen.queryByRole('radio')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Fill Form' })).toHaveProperty('disabled', false);
});
