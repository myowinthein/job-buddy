import { expect, it } from 'vitest';
import { backgroundTint } from './backgroundTint';

it('keeps transparent surfaces at the standard 12% opacity', () => {
  expect(backgroundTint('rgba(0, 0, 0, 0)', 'green')).toBe('rgba(34, 197, 94, 0.12)');
  expect(backgroundTint('transparent', 'red')).toBe('rgba(239, 68, 68, 0.12)');
});
it('preserves an opaque white input surface for dark text in every tier', () => {
  expect(backgroundTint('rgb(255, 255, 255)', 'green')).toBe('rgb(228, 248, 236)');
  expect(backgroundTint('rgb(255, 255, 255)', 'yellow')).toBe('rgb(252, 246, 225)');
  expect(backgroundTint('rgb(255, 255, 255)', 'red')).toBe('rgb(253, 233, 233)');
  expect(backgroundTint('rgb(255, 255, 255)', 'gray')).toBe('rgb(237, 238, 240)');
});
it('preserves dark and translucent surfaces instead of discarding their opacity', () => {
  expect(backgroundTint('rgb(0, 0, 0)', 'green')).toBe('rgb(4, 24, 11)');
  expect(backgroundTint('rgba(0, 0, 0, 0.5)', 'gray')).toBe('rgba(23, 24, 27, 0.56)');
});
it('retains browser-supported color spaces when legacy rgb parsing does not apply', () => {
  expect(backgroundTint('color(display-p3 1 1 1)', 'green')).toBe(
    'color-mix(in srgb, color(display-p3 1 1 1) 88%, rgb(34, 197, 94) 12%)',
  );
});
