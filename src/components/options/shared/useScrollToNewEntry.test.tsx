// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { RefObject } from 'react';
import { useScrollToNewEntry } from './useScrollToNewEntry';

let container: HTMLDivElement;

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  container.remove();
});

async function flushRaf() {
  await act(async () => { await new Promise((resolve) => requestAnimationFrame(resolve)); });
}

describe('useScrollToNewEntry', () => {
  it('does nothing on the initial render (tick=0)', async () => {
    const child = document.createElement('div');
    child.innerHTML = '<input type="text" />';
    container.appendChild(child);
    const ref: RefObject<HTMLDivElement | null> = { current: container };

    renderHook(({ tick }) => useScrollToNewEntry(ref, tick), { initialProps: { tick: 0 } });
    await flushRaf();

    expect(vi.mocked(child.scrollIntoView)).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(child.querySelector('input'));
  });

  it('scrolls the last child into view and focuses its first focusable descendant when tick increments', async () => {
    const first = document.createElement('div');
    first.innerHTML = '<input type="text" />';
    const last = document.createElement('div');
    last.innerHTML = '<input type="text" />';
    container.append(first, last);
    const ref: RefObject<HTMLDivElement | null> = { current: container };

    const { rerender } = renderHook(({ tick }) => useScrollToNewEntry(ref, tick), { initialProps: { tick: 0 } });
    rerender({ tick: 1 });
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
    last.innerHTML = `
      <input type="radio" />
      <input type="checkbox" />
      <input type="hidden" />
      <input type="text" readonly />
      <input type="text" id="real-target" />
    `;
    container.appendChild(last);
    const ref: RefObject<HTMLDivElement | null> = { current: container };

    const { rerender } = renderHook(({ tick }) => useScrollToNewEntry(ref, tick), { initialProps: { tick: 0 } });
    rerender({ tick: 1 });
    await flushRaf();

    expect(document.activeElement).toBe(last.querySelector('#real-target'));
  });

  it('cancels the pending animation frame on unmount, never touching a since-removed element', async () => {
    const last = document.createElement('div');
    last.innerHTML = '<input type="text" />';
    container.appendChild(last);
    const ref: RefObject<HTMLDivElement | null> = { current: container };

    const { rerender, unmount } = renderHook(({ tick }) => useScrollToNewEntry(ref, tick), { initialProps: { tick: 0 } });
    rerender({ tick: 1 });
    unmount(); // before the rAF callback has a chance to fire
    await flushRaf();

    expect(vi.mocked(last.scrollIntoView)).not.toHaveBeenCalled();
  });

  it('focuses a select or an aria-haspopup=listbox button when present instead of skipping to nothing', async () => {
    const last = document.createElement('div');
    last.innerHTML = `<select><option>a</option></select>`;
    container.appendChild(last);
    const ref: RefObject<HTMLDivElement | null> = { current: container };

    const { rerender } = renderHook(({ tick }) => useScrollToNewEntry(ref, tick), { initialProps: { tick: 0 } });
    rerender({ tick: 1 });
    await flushRaf();

    expect(document.activeElement).toBe(last.querySelector('select'));
  });
});
