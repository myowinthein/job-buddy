import type { Profile } from '../types/profile';
import type { LearnedMappings, LearnedMappingValue, ApplicationEntry, DriveBackupState } from '../types/storage';
import { normalizeProfile } from './migrate';
import { DEV_PROFILE } from './devProfile';
import { DEFAULT_GEMINI_MODEL } from '../resume-ai/types';
import { wrapStorageArea } from './storageArea';

// Rejects on a set() failure (e.g. quota exceeded) so callers can surface an
// error instead of silently losing data — unlike sessionStorage.ts, where
// every current caller already treats session storage as best-effort.
const local = wrapStorageArea(() => chrome.storage.local, 'storage', { rejectOnSetError: true });

function storageGet(key: string): Promise<Record<string, unknown>> {
  return local.get(key);
}

function storageSet(items: Record<string, unknown>): Promise<void> {
  return local.set(items);
}

export async function getProfile(): Promise<Profile | null> {
  const result = await storageGet('profile');
  const raw = (result.profile as Profile) ?? null;
  if (!raw) {
    // No profile saved yet. In local dev, fall back to a fully-filled dummy
    // profile instead of null, so `pnpm dev` doesn't require re-entering
    // profile data by hand every session. Never persisted — an explicit
    // saveProfile() (e.g. editing a section in Options) still takes over
    // normally on the next read. Never true in a production/zip build.
    if (import.meta.env.DEV) return normalizeProfile(DEV_PROFILE);
    return null;
  }

  // On-read migrations are folded into a single write so the user never
  // pays for two storage round-trips when both id backfill and salary period
  // defaulting need to run on the same old profile.
  let profile = raw;
  let migrated = false;

  if (!profile.id) {
    profile = { ...profile, id: crypto.randomUUID() };
    migrated = true;
  }

  const normalized = normalizeProfile(profile);
  if (normalized !== profile) {
    profile = normalized;
    migrated = true;
  }

  if (migrated) await storageSet({ profile });
  return profile;
}

export async function saveProfile(profile: Profile): Promise<void> {
  // Belt-and-braces: normalise on every write so callers cannot persist a
  // salary entry without a valid period, even via Drive restore or resume
  // import paths that bypass validateImportedProfile.
  await storageSet({ profile: normalizeProfile(profile) });
}

export async function getLearnedMappings(): Promise<LearnedMappings> {
  const result = await storageGet('learnedMappings');
  return (result.learnedMappings as LearnedMappings) ?? {};
}

// How trustworthy an entry is, for conflict resolution during a merge. A
// legacy string entry was always unconditionally trusted, so it outranks any
// counted entry regardless of count.
function trustRank(value: LearnedMappingValue): number {
  return typeof value === 'string' ? Infinity : value.count;
}

// Merges two LearnedMappings snapshots without losing data from either side —
// used when restoring from a Drive backup, since a blind overwrite could
// silently discard local learning that hadn't been synced to Drive yet.
// Signals present on only one side are kept as-is. For a signal present on
// both sides, keeps whichever entry is more trusted (higher count, or a
// legacy string entry); ties keep the local entry.
export function mergeLearnedMappings(local: LearnedMappings, remote: LearnedMappings): LearnedMappings {
  const merged: LearnedMappings = {};
  const domains = new Set([...Object.keys(local), ...Object.keys(remote)]);

  for (const domain of domains) {
    const localSignals  = local[domain]  ?? {};
    const remoteSignals = remote[domain] ?? {};
    const signals = new Set([...Object.keys(localSignals), ...Object.keys(remoteSignals)]);
    const mergedSignals: Record<string, LearnedMappingValue> = {};

    for (const signal of signals) {
      const l = localSignals[signal];
      const r = remoteSignals[signal];
      if (l === undefined)      mergedSignals[signal] = r;
      else if (r === undefined) mergedSignals[signal] = l;
      else                      mergedSignals[signal] = trustRank(l) >= trustRank(r) ? l : r;
    }
    merged[domain] = mergedSignals;
  }
  return merged;
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
  return local.remove(keys);
}

export async function clearAllStorage(): Promise<void> {
  await storageRemove(['profile', 'learnedMappings', 'applicationHistory']);
}

// ── Gemini AI settings ──────────────────────────────────────────────────────
// Stored in chrome.storage.local only; never exported in profile bundles.

// Falls back to VITE_GEMINI_API_KEY in dev builds only (gated on import.meta.env.DEV,
// never true in a production/zip build) so `pnpm dev` doesn't require re-pasting a key
// into Settings every time chrome.storage.local starts fresh.
export async function getGeminiApiKey(): Promise<string | null> {
  const result = await storageGet('geminiApiKey');
  const stored = (result.geminiApiKey as string | undefined) ?? null;
  if (stored) return stored;
  if (import.meta.env.DEV) {
    const devKey = (import.meta.env.VITE_GEMINI_API_KEY as string | undefined) ?? null;
    // Persist so contexts WXT pre-bundles statically even in dev mode
    // (content scripts, background — Chrome can't load a service worker or
    // content script from the live Vite dev server the way popup/options
    // do, so those bundles never see .env.development's custom VITE_* vars)
    // still pick this up via the normal storage read above, rather than the
    // dev key only ever working when getGeminiApiKey() happens to be called
    // from the popup/options.
    if (devKey) void storageSet({ geminiApiKey: devKey });
    return devKey;
  }
  return null;
}

export async function saveGeminiApiKey(key: string): Promise<void> {
  await storageSet({ geminiApiKey: key });
}

export async function getGeminiModel(): Promise<string | null> {
  const result = await storageGet('geminiModel');
  const stored = (result.geminiModel as string) ?? null;
  if (stored) return stored;
  if (import.meta.env.DEV) {
    // Same reasoning as getGeminiApiKey's dev fallback above — without a
    // stored model, runAIAutofill's `!apiKey || !storedModel` check would
    // still block AI even once the dev API key itself is picked up.
    void storageSet({ geminiModel: DEFAULT_GEMINI_MODEL });
    return DEFAULT_GEMINI_MODEL;
  }
  return null;
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
  label?: string,
): Promise<void> {
  const mappings = await getLearnedMappings();
  if (!mappings[domain]) mappings[domain] = {};
  const existing: LearnedMappingValue | undefined = mappings[domain][normalizedSignal];

  if (existing === undefined) {
    // First confirmation — store with count 1, not yet trusted for Layer 0.
    mappings[domain][normalizedSignal] = { path: fieldPath, count: 1, label };
  } else if (typeof existing === 'string') {
    // Legacy format: already trusted. Leave the path untouched for the same path
    // (but still attach a label if one wasn't recorded before), reset on conflict.
    if (existing !== fieldPath) {
      mappings[domain][normalizedSignal] = { path: fieldPath, count: 1, label };
    } else if (label) {
      mappings[domain][normalizedSignal] = { path: existing, count: 2, label };
    }
  } else {
    // New counted format: increment on same path, reset on conflict. Always
    // refresh the label — it's a display aid, not part of the trust logic.
    if (existing.path === fieldPath) {
      mappings[domain][normalizedSignal] = { path: fieldPath, count: existing.count + 1, label: label ?? existing.label };
    } else {
      mappings[domain][normalizedSignal] = { path: fieldPath, count: 1, label };
    }
  }

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
  if (val === 'light' || val === 'dark' || val === 'system') return val;
  return 'system';
}

export async function saveThemePreference(value: 'system' | 'light' | 'dark'): Promise<void> {
  await storageSet({ themePreference: value });
}
