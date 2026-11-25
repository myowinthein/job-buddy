// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const source = readFileSync(resolve('docs/assets/site.js'), 'utf8');
let intersection: IntersectionObserverCallback;
let decode: ReturnType<typeof vi.fn>;
let imageSources: string[];
let removeThemeListeners: (() => void)[];
beforeEach(() => {
  removeThemeListeners = [];
  const addListener = document.addEventListener.bind(document);
  vi.spyOn(document, 'addEventListener').mockImplementation((type, listener, options) => {
    addListener(type, listener, options);
    if (type === 'jb-theme-change')
      removeThemeListeners.push(() => document.removeEventListener(type, listener, options));
  });
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
  // The shared theme initializer publishes this event after changing appearance.
  document.querySelector('.theme-toggle')!.addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
    document.dispatchEvent(new Event('jb-theme-change'));
  });
});
afterEach(() => {
  removeThemeListeners.forEach((remove) => remove());
  vi.restoreAllMocks();
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

it('retries a failed preload when its screenshot is requested again', async () => {
  decode.mockRejectedValueOnce(new Error('temporary image failure'));
  enterFirstImage();
  await Promise.resolve();
  document.querySelector<HTMLButtonElement>('[data-show-visual="one"]')!
    .dispatchEvent(new Event('pointerenter'));
  expect(imageSources).toEqual(['one-light.webp', 'two-light.webp', 'one-light.webp']);
});

it('reassigns a broken screenshot source when its tab is selected again', async () => {
  enterFirstImage();
  const image = document.querySelector<HTMLImageElement>('#one img')!;
  Object.defineProperty(image, 'complete', { configurable: true, value: true });
  const setSource = vi.spyOn(image, 'src', 'set');
  document.querySelector<HTMLButtonElement>('[data-show-visual="one"]')!.click();
  await Promise.resolve();
  await Promise.resolve();
  expect(setSource).toHaveBeenCalledWith('one-light.webp');
});

it('keeps a newer preload when an older evicted request fails', async () => {
  let failOld!: (error: Error) => void;
  decode.mockReturnValueOnce(new Promise<void>((_, reject) => { failOld = reject; }));
  enterFirstImage();
  const image = document.querySelector<HTMLImageElement>('#one img')!;
  const button = document.querySelector<HTMLButtonElement>('[data-show-visual="one"]')!;
  for (let index = 0; index < 17; index++) {
    image.dataset.light = `other-${index}.webp`;
    button.dispatchEvent(new Event('pointerenter'));
  }
  image.dataset.light = 'one-light.webp';
  button.dispatchEvent(new Event('pointerenter'));
  failOld(new Error('old request failed'));
  await Promise.resolve();
  button.dispatchEvent(new Event('pointerenter'));
  expect(imageSources.filter(source => source === 'one-light.webp')).toHaveLength(2);
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
