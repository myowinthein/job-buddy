// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import { useEscapeToClose } from './useEscapeToClose';

afterEach(cleanup);

function pressEscape() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
}

describe('useEscapeToClose', () => {
  it('calls the handler on Escape', () => {
    const onClose = vi.fn();
    renderHook(() => useEscapeToClose(onClose));
    pressEscape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores other keys', () => {
    const onClose = vi.fn();
    renderHook(() => useEscapeToClose(onClose));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('picks up a handler that becomes defined after being undefined (e.g. a guard clearing)', () => {
    const onClose = vi.fn();
    const { rerender } = renderHook(({ handler }) => useEscapeToClose(handler), {
      initialProps: { handler: undefined as (() => void) | undefined },
    });
    pressEscape();
    expect(onClose).not.toHaveBeenCalled();

    rerender({ handler: onClose });
    pressEscape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('removes its listener on unmount', () => {
    const onClose = vi.fn();
    const { unmount } = renderHook(() => useEscapeToClose(onClose));
    unmount();
    pressEscape();
    expect(onClose).not.toHaveBeenCalled();
  });
});
