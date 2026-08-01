import { describe, it, expect, vi, beforeEach } from 'vitest';

const sessionStore: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  storage: {
    session: {
      set(items: Record<string, unknown>, cb: () => void) { Object.assign(sessionStore, items); cb(); },
    },
  },
  runtime: {
    lastError: null as { message: string } | null,
    openOptionsPage: vi.fn((cb: () => void) => cb()),
  },
});

import { handleOpenOptions } from './backgroundHandlers';

beforeEach(() => {
  Object.keys(sessionStore).forEach((k) => delete sessionStore[k]);
  vi.clearAllMocks();
  (chrome.runtime as unknown as { lastError: { message: string } | null }).lastError = null;
});

describe('handleOpenOptions', () => {
  it('writes jb:focusOnLoad to session storage when a focusPath is given, then opens options', () => {
    const sendResponse = vi.fn();
    handleOpenOptions('personal.firstName', sendResponse);

    expect(sessionStore['jb:focusOnLoad']).toEqual({ type: 'profilePath', path: 'personal.firstName' });
    expect(chrome.runtime.openOptionsPage).toHaveBeenCalledTimes(1);
    expect(sendResponse).toHaveBeenCalledWith({ success: true });
  });

  it('opens options directly without touching session storage when focusPath is absent', () => {
    const sendResponse = vi.fn();
    handleOpenOptions(undefined, sendResponse);

    expect(sessionStore['jb:focusOnLoad']).toBeUndefined();
    expect(chrome.runtime.openOptionsPage).toHaveBeenCalledTimes(1);
    expect(sendResponse).toHaveBeenCalledWith({ success: true });
  });

  it('reports success: false when chrome.runtime.lastError is set', () => {
    (chrome.runtime as unknown as { lastError: { message: string } | null }).lastError = { message: 'boom' };
    const sendResponse = vi.fn();
    handleOpenOptions(undefined, sendResponse);

    expect(sendResponse).toHaveBeenCalledWith({ success: false });
  });
});
