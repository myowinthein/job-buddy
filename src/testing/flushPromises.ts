/** Lets queued promise callbacks run, long enough for several chained awaits. */
export async function flushPromises(ticks = 40): Promise<void> {
  for (let i = 0; i < ticks; i++) await Promise.resolve();
}
