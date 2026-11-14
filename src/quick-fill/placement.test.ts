import { expect, it } from 'vitest';
import { avoidQuickFillOverlap } from './placement';

const viewport = { width: 1000, height: 800 };
const bottomRight = { left: 788, top: 738, width: 200, height: 50 };

it('places dev above live with a twelve-pixel gap when both use the bottom-right corner', () => {
  expect(avoidQuickFillOverlap(bottomRight, [bottomRight], viewport)).toEqual({
    left: 788,
    top: 676,
  });
});

it('preserves a preferred position that already has room', () => {
  expect(
    avoidQuickFillOverlap({ ...bottomRight, left: 100, top: 100 }, [bottomRight], viewport),
  ).toEqual({ left: 100, top: 100 });
});

it('places dev below live when the top edge prevents moving above', () => {
  const topLeft = { ...bottomRight, left: 12, top: 12 };
  expect(avoidQuickFillOverlap(topLeft, [topLeft], viewport)).toEqual({ left: 12, top: 74 });
});

it('chooses a nearby side when it requires less movement', () => {
  expect(
    avoidQuickFillOverlap(
      { ...bottomRight, left: 700, top: 400 },
      [{ left: 650, top: 300, width: 100, height: 200 }],
      viewport,
    ),
  ).toEqual({ left: 762, top: 400 });
});

it('avoids every live control when several are present', () => {
  expect(
    avoidQuickFillOverlap(bottomRight, [bottomRight, { ...bottomRight, top: 676 }], viewport),
  ).toEqual({ left: 788, top: 614 });
});

it('bounds positions after a window resize even without a live control', () => {
  expect(avoidQuickFillOverlap({ ...bottomRight, left: 1200, top: 900 }, [], viewport)).toEqual({
    left: 788,
    top: 738,
  });
});

it('reduces overlap within the viewport when both expanded controls cannot fit', () => {
  const control = { left: 38, top: 18, width: 200, height: 70 };
  expect(avoidQuickFillOverlap(control, [control], { width: 250, height: 100 })).toEqual({
    left: 12,
    top: 18,
  });
});
