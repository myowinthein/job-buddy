// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

vi.mock('@/src/utils/storage', () => ({
  getProfile: vi.fn().mockResolvedValue({ personal: { firstName: 'Jane', lastName: 'Doe', email: 'jane@x.com' } }),
  getGeminiApiKey: vi.fn().mockResolvedValue('fake-key'),
}));
vi.mock('@/src/utils/sessionStorage', () => ({
  sessionGet: vi.fn().mockResolvedValue({}),
  sessionSet: vi.fn().mockResolvedValue(undefined),
}));

// `entrypoints/popup/App.tsx` reads `chrome.runtime.getManifest()` at module
// top level (EXTENSION_VERSION), which runs at import time — before any
// plain `vi.stubGlobal` call textually preceding the import would execute,
// per real ESM import evaluation order. `vi.hoisted` forces this to run
// first, same as `vi.mock` factories.
const { sendMessageMock, getAllFramesMock, tabsQueryMock, executeScriptMock } = vi.hoisted(() => {
  const sendMessageMock = vi.fn();
  const getAllFramesMock = vi.fn();
  const tabsQueryMock = vi.fn();
  const executeScriptMock = vi.fn().mockResolvedValue(undefined);

  vi.stubGlobal('chrome', {
    runtime: {
      getManifest: () => ({ version: '9.9.9' }),
      openOptionsPage: vi.fn(),
      lastError: null,
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

  return { sendMessageMock, getAllFramesMock, tabsQueryMock, executeScriptMock };
});

import App from '@/entrypoints/popup/App';
import { getProfile, getGeminiApiKey } from '@/src/utils/storage';
import type { Profile } from '@/src/types/profile';

function renderApp() {
  render(<App />);
}

// A "scan"/"status" response shape as returned by content.ts's AUTOFILL_SCAN
// or GET_STATUS handlers, keyed per frame.
function statusResult(overrides: Partial<Record<string, number>> = {}, aiAvailable?: boolean) {
  return {
    noReview: 0, needReview: 0, lowConfidence: 0, noData: 0, totalScanned: 0,
    ...overrides,
    ...(aiAvailable !== undefined ? { aiAvailable } : {}),
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
    await waitFor(() => expect(screen.getByText('(3)')).toBeTruthy());
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
    // Combined totalScanned = 3 + 2 = 5, noReview = 2 + 1 = 3 -> "Filled (3)"
    await waitFor(() => expect(screen.getByText('(3)')).toBeTruthy());
  });

  it('shows the AI nudge when aiAvailable is false, no key is set, and it has not been dismissed', async () => {
    vi.mocked(getGeminiApiKey).mockResolvedValue(null);
    sendMessageMock.mockImplementation((_tabId, message) => {
      if (message.action === 'GET_STATUS') return Promise.resolve(statusResult({ noReview: 1, totalScanned: 1 }, false));
      return Promise.reject(new Error('n/a'));
    });

    renderApp();
    // "Add an AI key in" also appears in the header sparkle's hover tooltip
    // (always in the DOM, just hidden via CSS) — target the nudge banner's
    // own distinguishing text instead.
    expect(await screen.findByText(/to improve autofill accuracy\./)).toBeTruthy();
  });

  it('drops frames with no listener (rejected sendMessage) and still aggregates the rest', async () => {
    getAllFramesMock.mockResolvedValue([{ frameId: 0 }, { frameId: 9 }]);
    sendMessageMock.mockImplementation((_tabId, message, opts) => {
      if (message.action !== 'GET_STATUS') return Promise.reject(new Error('n/a'));
      if (opts.frameId === 0) return Promise.resolve(statusResult({ noReview: 5, totalScanned: 5 }));
      return Promise.reject(new Error('no listener')); // frame 9: ad/tracker iframe, no content script
    });

    renderApp();
    await waitFor(() => expect(screen.getByText('(5)')).toBeTruthy());
  });

  it('stays idle (no crash) when every frame rejects', async () => {
    sendMessageMock.mockRejectedValue(new Error('no listener anywhere'));
    renderApp();
    await screen.findByText('Fill Form ✨');
    expect(screen.queryByText('Undo')).toBeNull();
  });

  it('merges aiAvailable with OR across frames — true from any frame wins', async () => {
    getAllFramesMock.mockResolvedValue([{ frameId: 0 }, { frameId: 3 }]);
    sendMessageMock.mockImplementation((_tabId, message, opts) => {
      if (message.action !== 'GET_STATUS') return Promise.reject(new Error('n/a'));
      if (opts.frameId === 0) return Promise.resolve(statusResult({ totalScanned: 1 }, false));
      if (opts.frameId === 3) return Promise.resolve(statusResult({ totalScanned: 1 }, true));
      return Promise.reject(new Error('no listener'));
    });

    renderApp();
    await screen.findByText('Undo');
    // aiAvailable merged true -> the "add an AI key" nudge must not appear.
    expect(screen.queryByText(/Add an AI key in/)).toBeNull();
  });
});

describe('popup App — handleAutofill scan orchestration', () => {
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
    fireEvent.click(await screen.findByText('Fill Form ✨'));
    expect(await screen.findByText('This form already has data filled in.')).toBeTruthy();
    expect(screen.getByText(/3 fields already have a value/)).toBeTruthy();
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
    fireEvent.click(await screen.findByText('Fill Form ✨'));
    expect(screen.queryByText('This form already has data filled in.')).toBeNull();
    await waitFor(() => expect(screen.getByText('(4)')).toBeTruthy());
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
    fireEvent.click(await screen.findByText('Fill Form ✨'));
    await screen.findByText('This form already has data filled in.');
    fireEvent.click(screen.getByText('Continue')); // default fillMode is 'merge'

    await waitFor(() => expect(screen.getByText('(2)')).toBeTruthy());
  });

  it('shows an error state when no active tab can be found', async () => {
    tabsQueryMock.mockResolvedValue([]); // no tab.id
    renderApp();
    fireEvent.click(await screen.findByText('Fill Form ✨'));
    expect(await screen.findByText(/Could not connect to page/)).toBeTruthy();
  });
});

describe('popup App — openDebugPanel', () => {
  it('picks the frame session with the highest green+yellow+red+gray total, opened via shift-click', async () => {
    getAllFramesMock.mockResolvedValue([{ frameId: 0 }, { frameId: 5 }]);
    sendMessageMock.mockImplementation((_tabId, message, opts) => {
      if (message.action === 'GET_STATUS') {
        if (opts.frameId === 0) return Promise.resolve(statusResult({ noReview: 1, totalScanned: 1 }));
        return Promise.reject(new Error('no listener'));
      }
      if (message.action === 'GET_DEBUG_SESSION') {
        if (opts.frameId === 0) {
          return Promise.resolve({
            timestamp: 1, scanner: [], mapping: [], ai: [],
            summary: { green: 1, yellow: 0, red: 0, gray: 0 }, // total 1
            aiSkipped: true,
          });
        }
        if (opts.frameId === 5) {
          return Promise.resolve({
            timestamp: 2, scanner: [],
            mapping: [{ fieldId: 'f1', matchLayer: 'dictionary_exact', confidence: 0.9, profilePath: 'personal.firstName', finalState: 'green' }],
            ai: [],
            summary: { green: 2, yellow: 1, red: 0, gray: 0 }, // total 3, higher
            aiSkipped: true,
          });
        }
      }
      return Promise.reject(new Error('n/a'));
    });

    renderApp();
    await screen.findByText('Undo'); // confirms autofillState === 'success' before shift-clicking
    fireEvent.click(screen.getByAltText('Job Buddy'), { shiftKey: true });

    // Frame 5's session (total 3) is chosen over frame 0's (total 1) — its
    // one mapping entry renders as "1 field", not frame 0's "0 fields".
    expect(await screen.findByText('1 field')).toBeTruthy();
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
        return Promise.resolve(undefined);
      }
      return Promise.reject(new Error('n/a'));
    });

    renderApp();
    fireEvent.click(await screen.findByText('Undo'));

    await waitFor(() => expect(screen.getByText('Fill Form ✨')).toBeTruthy());
    expect(screen.queryByText('Undo')).toBeNull();
    expect(clearCalledFrames.sort()).toEqual([0, 2]);
  });
});
