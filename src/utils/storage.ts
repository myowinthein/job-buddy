import type { Profile } from '../types/profile';
import type { LearnedMappings, ApplicationEntry, DriveBackupState } from '../types/storage';

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

// Wrapper for writes. Rejects when the write fails (e.g. quota exceeded) so
// callers can surface an error instead of silently losing data.
function storageSet(items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.set(items, () => {
        if (chrome.runtime.lastError) {
          const msg = chrome.runtime.lastError.message ?? 'storage.set failed';
          console.error('[Job Buddy] storage.set error:', msg);
          reject(new Error(msg));
          return;
        }
        resolve();
      });
    } catch (err) {
      console.error('[Job Buddy] storage.set threw:', err);
      reject(err);
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

export async function saveLearnedMappings(mappings: LearnedMappings): Promise<void> {
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

// ── Gemini AI settings ──────────────────────────────────────────────────────
// Stored in chrome.storage.local only; never exported in profile bundles.

export async function getGeminiApiKey(): Promise<string | null> {
  const result = await storageGet('geminiApiKey');
  return (result.geminiApiKey as string) ?? null;
}

export async function saveGeminiApiKey(key: string): Promise<void> {
  await storageSet({ geminiApiKey: key });
}

export async function getGeminiModel(): Promise<string | null> {
  const result = await storageGet('geminiModel');
  return (result.geminiModel as string) ?? null;
}

export async function saveGeminiModel(model: string): Promise<void> {
  await storageSet({ geminiModel: model });
}

export async function clearGeminiSettings(): Promise<void> {
  await storageRemove(['geminiApiKey', 'geminiModel']);
}

export async function saveLearnedMapping(
  domain: string,
  normalizedSignal: string,
  fieldPath: string,
): Promise<void> {
  const mappings = await getLearnedMappings();
  if (!mappings[domain]) mappings[domain] = {};
  mappings[domain][normalizedSignal] = fieldPath;
  await saveLearnedMappings(mappings);
}

// ── Google Drive Cloud Backup ────────────────────────────────────────────────
// Token and backup state live in chrome.storage.local only; never included
// in profile export bundles (privacy boundary).

export async function getDriveToken(): Promise<string | null> {
  const result = await storageGet('driveToken');
  return (result.driveToken as string) ?? null;
}

export async function saveDriveToken(token: string): Promise<void> {
  await storageSet({ driveToken: token });
}

export async function clearDriveToken(): Promise<void> {
  await storageRemove(['driveToken']);
}

const DEFAULT_DRIVE_STATE: DriveBackupState = {
  fileId:      null,
  lastSynced:  null,
  pendingSync: false,
  error:       null,
};

export async function getDriveBackupState(): Promise<DriveBackupState> {
  const result = await storageGet('driveBackupState');
  return (result.driveBackupState as DriveBackupState) ?? { ...DEFAULT_DRIVE_STATE };
}

export async function saveDriveBackupState(state: DriveBackupState): Promise<void> {
  await storageSet({ driveBackupState: state });
}

export async function clearDriveBackupState(): Promise<void> {
  await storageRemove(['driveBackupState']);
}

// ── Appearance / theme ────────────────────────────────────────────────────────

export async function getThemePreference(): Promise<'system' | 'light' | 'dark'> {
  const result = await storageGet('themePreference');
  const val = result.themePreference as string | undefined;
  if (val === 'light' || val === 'dark') return val;
  return 'system';
}

export async function saveThemePreference(value: 'system' | 'light' | 'dark'): Promise<void> {
  await storageSet({ themePreference: value });
}
