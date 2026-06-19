import type { Profile } from '../types/profile';
import type { LearnedMappings, ApplicationEntry } from '../types/storage';

// Wraps chrome.storage.local.get so that the returned Promise always resolves.
// A synchronous throw (e.g. permission missing) or a runtime error in the
// callback both resolve to an empty object rather than rejecting, keeping
// callers free of unhandled-rejection hangs.
function storageGet(key: string): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(key, (result: Record<string, unknown>) => {
        if (chrome.runtime.lastError) {
          console.error('[Job Buddy] storage.get error:', chrome.runtime.lastError.message);
          resolve({});
          return;
        }
        resolve(result);
      });
    } catch (err) {
      console.error('[Job Buddy] storage.get threw:', err);
      resolve({});
    }
  });
}

// Same resilience wrapper for writes. Resolves even on error so callers
// using await don't hang.
function storageSet(items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set(items, () => {
        if (chrome.runtime.lastError) {
          console.error('[Job Buddy] storage.set error:', chrome.runtime.lastError.message);
        }
        resolve();
      });
    } catch (err) {
      console.error('[Job Buddy] storage.set threw:', err);
      resolve();
    }
  });
}

export async function getProfile(): Promise<Profile | null> {
  const result = await storageGet('profile');
  const profile = (result.profile as Profile) ?? null;
  if (profile && !profile.id) {
    profile.id = crypto.randomUUID();
    await storageSet({ profile });
  }
  return profile;
}

export async function saveProfile(profile: Profile): Promise<void> {
  await storageSet({ profile });
}

export async function getLearnedMappings(): Promise<LearnedMappings> {
  const result = await storageGet('learnedMappings');
  return (result.learnedMappings as LearnedMappings) ?? {};
}

export async function saveLearmedMappings(mappings: LearnedMappings): Promise<void> {
  await storageSet({ learnedMappings: mappings });
}

export async function getApplicationHistory(): Promise<ApplicationEntry[]> {
  const result = await storageGet('applicationHistory');
  return (result.applicationHistory as ApplicationEntry[]) ?? [];
}

export async function saveApplicationHistory(history: ApplicationEntry[]): Promise<void> {
  await storageSet({ applicationHistory: history });
}

function storageRemove(keys: string[]): Promise<void> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.remove(keys, () => {
        if (chrome.runtime.lastError) {
          console.error('[Job Buddy] storage.remove error:', chrome.runtime.lastError.message);
        }
        resolve();
      });
    } catch (err) {
      console.error('[Job Buddy] storage.remove threw:', err);
      resolve();
    }
  });
}

export async function clearAllStorage(): Promise<void> {
  await storageRemove(['profile', 'learnedMappings', 'applicationHistory']);
}

export async function saveLearnedMapping(
  domain: string,
  normalizedSignal: string,
  fieldPath: string,
): Promise<void> {
  const mappings = await getLearnedMappings();
  if (!mappings[domain]) mappings[domain] = {};
  mappings[domain][normalizedSignal] = fieldPath;
  await saveLearmedMappings(mappings);
}
