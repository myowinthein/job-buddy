// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, renderHook, act } from '@testing-library/react';
import type { RefObject } from 'react';
import { useScrollToNewEntry } from './useScrollToNewEntry';

let container: HTMLDivElement;

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  cleanup();
  container.remove();
  vi.unstubAllGlobals();
});

async function flushRaf() {
  await act(async () => { await new Promise((resolve) => requestAnimationFrame(resolve)); });
}

describe('useScrollToNewEntry', () => {
  it('scrolls instantly while preserving focus when reduced motion is enabled', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    const entry = document.createElement('div');
    entry.dataset.entryId = 'reduced-motion';
    entry.innerHTML = '<input type="text" />';
    container.appendChild(entry);
    const { result } = renderHook(() => useScrollToNewEntry({ current: container }));
    act(() => result.current.focusEntry('reduced-motion'));
    await flushRaf();
    expect(entry.scrollIntoView).toHaveBeenCalledWith({ behavior: 'instant', block: 'nearest' });
    expect(document.activeElement).toBe(entry.querySelector('input'));
  });

  it('does nothing until an entry is requested', async () => {
    const child = document.createElement('div');
    child.innerHTML = '<input type="text" />';
    container.appendChild(child);
    const ref: RefObject<HTMLDivElement | null> = { current: container };

    renderHook(() => useScrollToNewEntry(ref));
    await flushRaf();

    expect(vi.mocked(child.scrollIntoView)).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(child.querySelector('input'));
  });

  it('scrolls the requested entry into view and focuses its first focusable descendant', async () => {
    const first = document.createElement('div');
    first.innerHTML = '<input type="text" />';
    const last = document.createElement('div');
    last.dataset.entryId = 'last';
    last.innerHTML = '<input type="text" />';
    container.append(first, last);
    const ref: RefObject<HTMLDivElement | null> = { current: container };

    const { result } = renderHook(() => useScrollToNewEntry(ref));
    act(() => result.current.focusEntry('last'));
    await flushRaf();

    // Element.prototype.scrollIntoView is one shared mock across all
    // elements — inspect recorded call `this` contexts to see which
    // instance was actually called.
    const scrollMock = Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>;
    expect(scrollMock.mock.contexts).toEqual([last]);
    expect(scrollMock).toHaveBeenCalledWith({ behavior: 'smooth', block: 'nearest' });
    expect(document.activeElement).toBe(last.querySelector('input'));
  });

  it('skips radio, checkbox, hidden, and readonly inputs, focusing the first real text input instead', async () => {
    const last = document.createElement('div');
    last.dataset.entryId = 'last';
    last.innerHTML = `
      <input type="radio" />
      <input type="checkbox" />
      <input type="hidden" />
      <input type="text" readonly />
      <input type="text" id="real-target" />
    `;
    container.appendChild(last);
    const ref: RefObject<HTMLDivElement | null> = { current: container };

    const { result } = renderHook(() => useScrollToNewEntry(ref));
    act(() => result.current.focusEntry('last'));
    await flushRaf();

    expect(document.activeElement).toBe(last.querySelector('#real-target'));
  });

  it('cancels the pending animation frame on unmount, never touching a since-removed element', async () => {
    const last = document.createElement('div');
    last.dataset.entryId = 'last';
    last.innerHTML = '<input type="text" />';
    container.appendChild(last);
    const ref: RefObject<HTMLDivElement | null> = { current: container };

    const { result, unmount } = renderHook(() => useScrollToNewEntry(ref));
    act(() => result.current.focusEntry('last'));
    unmount(); // before the rAF callback has a chance to fire
    await flushRaf();

    expect(vi.mocked(last.scrollIntoView)).not.toHaveBeenCalled();
  });

  it('focuses a select or an aria-haspopup=listbox button when present instead of skipping to nothing', async () => {
    const last = document.createElement('div');
    last.dataset.entryId = 'last';
    last.innerHTML = `<select><option>a</option></select>`;
    container.appendChild(last);
    const ref: RefObject<HTMLDivElement | null> = { current: container };

    const { result } = renderHook(() => useScrollToNewEntry(ref));
    act(() => result.current.focusEntry('last'));
    await flushRaf();

    expect(document.activeElement).toBe(last.querySelector('select'));
  });
});
