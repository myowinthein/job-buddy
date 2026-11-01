import type { Profile } from '@/src/types/profile';
import { calculateCompletion, type CompletionResult } from '@/src/utils/profileCompletion';
import { profileData } from '@/src/utils/profileData';

export function inspectProfile(raw: unknown): Partial<Profile> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const profile = profileData(raw as Partial<Profile>);
  for (const entry of [profile.documents?.cv, profile.documents?.coverLetter]) {
    if (entry?.file && typeof entry.file === 'object') Reflect.deleteProperty(entry.file, 'base64');
  }
  return profile;
}

export async function readDevSnapshot() {
  const values = await new Promise<Record<string, unknown>>((resolve, reject) => {
    chrome.storage.local.get(
      ['profile', 'learnedMappings', 'driveBackupState', 'geminiModel'],
      (result) => {
        if (chrome.runtime.lastError) reject(new Error('Could not read local data.'));
        else resolve(result);
      },
    );
  });
  const storageBytes = await new Promise<number>((resolve) => {
    try {
      chrome.storage.local.getBytesInUse(null, (bytes) =>
        resolve(chrome.runtime.lastError ? 0 : bytes),
      );
    } catch {
      resolve(0);
    }
  });
  const drive =
    values.driveBackupState && typeof values.driveBackupState === 'object'
      ? (values.driveBackupState as Record<string, unknown>)
      : {};
  let completion: CompletionResult | null = null;
  try {
    completion = calculateCompletion((values.profile ?? {}) as Partial<Profile>);
  } catch {
    /* Malformed stored values remain inspectable. */
  }
  return {
    profile: inspectProfile(values.profile),
    completion,
    storageBytes,
    mappings:
      values.learnedMappings && typeof values.learnedMappings === 'object'
        ? Object.keys(values.learnedMappings).length
        : 0,
    aiModel:
      typeof values.geminiModel === 'string' && /^gemini-[a-z0-9.-]+$/.test(values.geminiModel)
        ? values.geminiModel
        : null,
    drive: {
      pendingSync: drive.pendingSync === true,
      error: [
        'token_expired',
        'storage_full',
        'sync_error',
        'review_required',
        'invalid_backup',
        'delete_failed',
      ].includes(String(drive.error))
        ? String(drive.error)
        : null,
      retryCount: typeof drive.retryCount === 'number' ? drive.retryCount : 0,
      retryAt: typeof drive.retryAt === 'number' ? drive.retryAt : null,
      lastSynced:
        typeof drive.lastSynced === 'string' && Number.isFinite(Date.parse(drive.lastSynced))
          ? drive.lastSynced
          : null,
    },
  };
}
