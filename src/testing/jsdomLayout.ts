import { vi } from 'vitest';

/** jsdom has no layout, so scrolling is a no-op. */
export function stubScrolling(): void {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
}

/** jsdom has no layout: run animation frames on timers and make scrolling a no-op. */
export function stubJsdomLayout(): void {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 0),
  );
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  stubScrolling();
}
