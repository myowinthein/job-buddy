import { createNamedLock } from './namedLock';
import { wrapStorageArea } from './storageArea';

const session = wrapStorageArea(() => chrome.storage.session, 'secondary feedback', {
  rejectOnSetError: true,
});
const locked = createNamedLock('jb-secondary-feedback');
const keyFor = (feature: string) => `jb:secondaryFeedback:${feature}`;

/** Claims one notice per issue and scope until recovery or browser restart. */
export async function takeSecondaryFeedback(
  feature: string,
  scope: string,
  issue: string,
): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.storage?.session) return true;
  try {
    return await locked(async () => {
      const key = keyFor(feature);
      const stored = (await session.get(key, { rejectOnError: true }))[key] as
        | { scope?: unknown; issues?: unknown }
        | undefined;
      const issues =
        stored?.scope === scope && Array.isArray(stored.issues)
          ? stored.issues.filter((value): value is string => typeof value === 'string')
          : [];
      if (issues.includes(issue)) return false;
      await session.set({ [key]: { scope, issues: [...issues, issue] } });
      return true;
    });
  } catch {
    // A notification-history failure must not hide the original problem.
    return true;
  }
}

export async function resetSecondaryFeedback(feature: string): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.session) return;
  try {
    await locked(() => session.remove(keyFor(feature), { rejectOnError: true }));
  } catch {
    // Notification bookkeeping must not turn a successful action into a failure.
  }
}
