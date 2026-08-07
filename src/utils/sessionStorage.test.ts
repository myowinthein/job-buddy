import { describe, it, expect, vi, beforeEach } from 'vitest';

const store: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  storage: {
    session: {
      get(key: string, cb: (r: Record<string, unknown>) => void) { cb({ [key]: store[key] }); },
      set(items: Record<string, unknown>, cb: () => void) { Object.assign(store, items); cb(); },
      remove(key: string, cb: () => void) { delete store[key]; cb(); },
    },
  },
  runtime: { lastError: null as { message: string } | null },
});

import { sessionGet, sessionSet, sessionRemove } from './sessionStorage';

beforeEach(() => {
  Object.keys(store).forEach((k) => delete store[k]);
  (chrome.runtime as unknown as { lastError: { message: string } | null }).lastError = null;
});

describe('sessionGet/sessionSet/sessionRemove', () => {
  it('sets then gets a value', async () => {
    await sessionSet({ 'jb:focusOnLoad': 'gemini-api-key' });
    const result = await sessionGet('jb:focusOnLoad');
    expect(result['jb:focusOnLoad']).toBe('gemini-api-key');
  });

  it('removes a value', async () => {
    await sessionSet({ 'jb:focusOnLoad': 'gemini-api-key' });
    await sessionRemove('jb:focusOnLoad');
    const result = await sessionGet('jb:focusOnLoad');
    expect(result['jb:focusOnLoad']).toBeUndefined();
  });

  it('sessionGet resolves to an empty-ish result rather than rejecting on chrome.runtime.lastError', async () => {
    (chrome.runtime as unknown as { lastError: { message: string } | null }).lastError = { message: 'boom' };
    await expect(sessionGet('jb:focusOnLoad')).resolves.toEqual({});
  });

  it('sessionSet resolves rather than rejecting on chrome.runtime.lastError', async () => {
    (chrome.runtime as unknown as { lastError: { message: string } | null }).lastError = { message: 'boom' };
    await expect(sessionSet({ x: 1 })).resolves.toBeUndefined();
  });

  it('sessionRemove resolves rather than rejecting on chrome.runtime.lastError', async () => {
    (chrome.runtime as unknown as { lastError: { message: string } | null }).lastError = { message: 'boom' };
    await expect(sessionRemove('x')).resolves.toBeUndefined();
  });
});

describe('sessionGet/sessionSet/sessionRemove — synchronous throw from chrome.storage.session itself', () => {
  // Distinct from the chrome.runtime.lastError tests above: here
  // chrome.storage.session.get/set/remove throws synchronously (e.g. the API
  // is unavailable in this context) rather than calling back with an error.
  // The outer try/catch in each function must still resolve gracefully.
  it('sessionGet resolves to {} when chrome.storage.session.get throws synchronously', async () => {
    const original = chrome.storage.session.get;
    chrome.storage.session.get = () => { throw new Error('session API unavailable'); };
    await expect(sessionGet('jb:focusOnLoad')).resolves.toEqual({});
    chrome.storage.session.get = original;
  });

  it('sessionSet resolves undefined when chrome.storage.session.set throws synchronously', async () => {
    const original = chrome.storage.session.set;
    chrome.storage.session.set = () => { throw new Error('session API unavailable'); };
    await expect(sessionSet({ x: 1 })).resolves.toBeUndefined();
    chrome.storage.session.set = original;
  });

  it('sessionRemove resolves undefined when chrome.storage.session.remove throws synchronously', async () => {
    const original = chrome.storage.session.remove;
    chrome.storage.session.remove = () => { throw new Error('session API unavailable'); };
    await expect(sessionRemove('x')).resolves.toBeUndefined();
    chrome.storage.session.remove = original;
  });
});
