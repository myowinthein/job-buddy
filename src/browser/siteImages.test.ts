// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const source = readFileSync(resolve('docs/assets/site.js'), 'utf8');
let intersection: IntersectionObserverCallback;
let decode: ReturnType<typeof vi.fn>;
let imageSources: string[];
beforeEach(() => {
  document.documentElement.className = '';
  document.body.innerHTML = `<button class="theme-toggle"></button><main><section id="first"><div data-visual-tour>
    <button data-show-visual="one">First</button><button data-show-visual="two">Second</button>
    <div data-visual-panel id="one"><img src="one-light.webp" data-light="one-light.webp" data-dark="one-dark.webp"></div>
    <div data-visual-panel id="two"><img src="two-light.webp" data-light="two-light.webp" data-dark="two-dark.webp"></div>
    <span class="visual-status"></span></div></section></main>`;
  decode = vi.fn().mockResolvedValue(undefined);
  imageSources = [];
  vi.stubGlobal(
    'Image',
    class {
      set src(value: string) {
        imageSources.push(value);
      }
      decode = decode;
    },
  );
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        intersection = callback;
      }
      observe() {}
    },
  );
  vi.stubGlobal('matchMedia', () => ({ addEventListener() {} }));
  vi.stubGlobal('requestAnimationFrame', vi.fn());
  new Function(source)();
});
afterEach(() => {
  vi.unstubAllGlobals();
});
function enterFirstImage() {
  intersection(
    [
      {
        target: document.querySelector('#one img')!,
        isIntersecting: true,
      } as IntersectionObserverEntry,
    ],
    {} as IntersectionObserver,
  );
}

it('prepares only a nearby tour and decodes screenshots asynchronously', () => {
  expect(imageSources).toEqual([]);
  expect(document.querySelector<HTMLImageElement>('img')!.decoding).toBe('async');
  enterFirstImage();
  expect(imageSources).toEqual(['one-light.webp', 'two-light.webp']);
  document
    .querySelector<HTMLButtonElement>('[data-show-visual="two"]')!
    .dispatchEvent(new Event('pointerenter'));
  expect(imageSources).toHaveLength(2);
});

it('keeps the current screenshot until the visible replacement is decoded', async () => {
  enterFirstImage();
  let ready!: () => void;
  decode.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      ready = resolve;
    }),
  );
  document.querySelector<HTMLButtonElement>('.theme-toggle')!.click();
  expect(document.documentElement.classList.contains('dark')).toBe(true);
  expect(document.querySelector('img')!.getAttribute('src')).toBe('one-light.webp');
  ready();
  await Promise.resolve();
  await Promise.resolve();
  expect(document.querySelector('img')!.getAttribute('src')).toBe('one-dark.webp');
});

it('does not restore an older theme after a slow decode', async () => {
  enterFirstImage();
  let ready!: () => void;
  decode.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      ready = resolve;
    }),
  );
  const toggle = document.querySelector<HTMLButtonElement>('.theme-toggle')!;
  toggle.click();
  toggle.click();
  ready();
  await Promise.resolve();
  await Promise.resolve();
  expect(document.querySelector('img')!.getAttribute('src')).toBe('one-light.webp');
});

it('falls back to the requested source when decoding fails', async () => {
  enterFirstImage();
  decode.mockRejectedValueOnce(new Error('decode failed'));
  document.querySelector<HTMLButtonElement>('.theme-toggle')!.click();
  await Promise.resolve();
  await Promise.resolve();
  expect(document.querySelector('img')!.getAttribute('src')).toBe('one-dark.webp');
  document.querySelector<HTMLButtonElement>('[data-show-visual="two"]')!.click();
  expect(document.querySelector('#two')!.hasAttribute('hidden')).toBe(false);
  expect(document.querySelector('#two img')!.getAttribute('src')).toBe('two-dark.webp');
});
