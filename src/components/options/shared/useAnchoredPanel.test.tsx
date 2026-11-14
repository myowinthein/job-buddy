// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, renderHook } from '@testing-library/react';
import { useAnchoredPanel } from './useAnchoredPanel';

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it('ignores scrolling inside a separate dropdown list but follows its scrolling ancestor', () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const main = document.createElement('main');
  const anchor = document.createElement('button');
  const list = document.createElement('div');
  main.append(anchor);
  document.body.append(main, list);
  let top = 50;
  const measure = vi.fn(() => new DOMRect(20, top, 120, 40));
  anchor.getBoundingClientRect = measure;
  const reference = { current: anchor };
  const { result } = renderHook(() => useAnchoredPanel(true, reference, 240));
  const position = result.current;
  measure.mockClear();

  fireEvent.scroll(list);
  expect(measure).not.toHaveBeenCalled();
  expect(result.current).toBe(position);

  top = 30;
  fireEvent.scroll(main);
  expect(result.current.top).toBe(78);
});
