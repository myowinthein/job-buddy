const COMMIT_TIMEOUT_MS = 500;
const COMMIT_SAMPLE_MS = 16;

/** Controlled selects can restore their old DOM value until a deferred change
 * handler commits. Yield to that handler before blur or another field write. */
export async function waitNativeSelectCommit(
  retained: () => boolean,
  active: () => boolean,
): Promise<boolean> {
  const started = Date.now();
  let consecutive = 0;
  while (active() && Date.now() - started < COMMIT_TIMEOUT_MS) {
    await new Promise<void>((resolve) => setTimeout(resolve, COMMIT_SAMPLE_MS));
    if (!active()) return false;
    consecutive = retained() ? consecutive + 1 : 0;
    if (consecutive >= 2) return true;
  }
  return false;
}
