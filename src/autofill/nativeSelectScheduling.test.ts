import { afterEach, expect, it, vi } from 'vitest';
import { waitNativeSelectCommit } from './nativeSelectCommit';

function throttleTimers() {
  vi.useFakeTimers();
  const schedule = globalThis.setTimeout;
  vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback, delay, ...args) =>
    schedule(callback, Math.max(Number(delay) || 0, 1000), ...args),
  );
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('requires two retained observations even when Chrome delays the first timer beyond the wait budget', async () => {
  throttleTimers();
  const retained = vi.fn(() => true);
  const pending = waitNativeSelectCommit(retained, () => true);
  await vi.advanceTimersByTimeAsync(2000);
  expect(await pending).toBe(true);
  expect(retained).toHaveBeenCalledTimes(2);
});

it('rejects a value that a framework reverts between delayed observations', async () => {
  throttleTimers();
  const retained = vi.fn().mockReturnValueOnce(true).mockReturnValue(false);
  const pending = waitNativeSelectCommit(retained, () => true);
  await vi.advanceTimersByTimeAsync(2000);
  expect(await pending).toBe(false);
  expect(retained).toHaveBeenCalledTimes(2);
});

it('does not extend the recovery window for a rejected value', async () => {
  throttleTimers();
  const retained = vi.fn(() => false);
  const pending = waitNativeSelectCommit(retained, () => true);
  await vi.advanceTimersByTimeAsync(1000);
  expect(await pending).toBe(false);
  expect(retained).toHaveBeenCalledOnce();
});

it('does not accept a delayed observation after cancellation', async () => {
  throttleTimers();
  let active = true;
  const retained = vi.fn(() => true);
  const pending = waitNativeSelectCommit(retained, () => active);
  await vi.advanceTimersByTimeAsync(1000);
  active = false;
  await vi.advanceTimersByTimeAsync(1000);
  expect(await pending).toBe(false);
});
