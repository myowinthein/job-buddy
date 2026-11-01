import { withLearnedMappingsLock } from './learnedMappingsLock';
import { devLockName } from '@/src/devtools/context';
import type { Profile } from '../types/profile';
import type { LearnedMappings, LearnedMappingValue, DriveBackupState } from '../types/storage';
import { normalizeProfile } from './migrate';
import { DEV_PROFILE } from './devProfile';
import { DEFAULT_GEMINI_MODEL, toGeminiModel } from '../resume-ai/types';
import type { GeminiModel } from '../resume-ai/types';
import { wrapStorageArea } from './storageArea';
import { equalJsonValues } from './equalJsonValues';
import { profileData } from './profileData';
import { withProfileWriteLock } from './profileWriteLock';

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

export async function getProfile(options: { rejectOnError?: boolean } = {}): Promise<Profile | null> {
  const result = await local.get('profile', options);
  const raw = (result.profile as Profile) ?? null;
  if (!raw) {
    // No profile saved yet. In local dev, fall back to a fully-filled dummy
    // profile instead of null, so `pnpm dev` doesn't require re-entering
    // profile data by hand every session. Never persisted — an explicit
    // saveProfile() (e.g. editing a section in Options) still takes over
    // normally on the next read. Never true in a production/zip build.
    if (import.meta.env.DEV) {
      const flags = await local.get('devProfileDisabled', options);
      if (!flags.devProfileDisabled) return normalizeProfile(DEV_PROFILE);
    }
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

export class ProfileReplacementChangedError extends Error {
  constructor(public current: Partial<Profile>) {
    super('The profile changed before replacement.');
  }
}

/** Save the new profile and mappings together during replacement. */
export async function replaceProfileData(
  profile: Profile,
  expected: Partial<Profile>,
  learnedMappings: LearnedMappings,
  pausedDriveState?: DriveBackupState,
): Promise<void> {
  // Fail closed on a read error; never interpret a failed read as an empty profile.
  const stored = await local.get('profile', { rejectOnError: true });
  const current = stored.profile
    ? normalizeProfile(stored.profile as Profile)
    : (await getProfile({ rejectOnError: true })) ?? {};
  if (!equalJsonValues(profileData(current), profileData(expected)))
    throw new ProfileReplacementChangedError(current);
  await storageSet({
    profile: normalizeProfile(profile),
    learnedMappings,
    ...(pausedDriveState ? { driveBackupState: pausedDriveState } : {}),
  });
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

// Content scripts delegate automatic updates to the extension origin. Web Locks
// on a job site's origin cannot coordinate other sites or extension pages.
function contentStorageClient(): boolean {
  return (
    typeof location !== 'undefined' &&
    !['chrome-extension:', 'moz-extension:'].includes(location.protocol) &&
    typeof chrome.runtime?.sendMessage === 'function' &&
    typeof chrome.runtime?.getURL === 'function'
  );
}
export async function saveLearnedMappings(
  mappings: LearnedMappings,
  options: { labelsOnly?: boolean; base?: LearnedMappings; merge?: boolean } = {},
): Promise<void> {
  if (options.labelsOnly && contentStorageClient()) {
    const response = await chrome.runtime.sendMessage({ action: 'SAVE_LEARNED_LABELS', mappings });
    if (!response?.ok) throw new Error('Could not save learned labels');
    return;
  }
  await withLearnedMappingsLock(async () => {
    const current = await getLearnedMappings();
    if (options.merge) {
      await storageSet({ learnedMappings: mergeLearnedMappings(current, mappings) });
      return;
    }
    if (options.base) {
      for (const domain of new Set([...Object.keys(options.base), ...Object.keys(mappings)])) {
        if (!(domain in mappings)) {
          delete current[domain];
          continue;
        }
        const before = options.base[domain] ?? {};
        for (const key of new Set([...Object.keys(before), ...Object.keys(mappings[domain])])) {
          if (equalJsonValues(before[key], mappings[domain][key])) continue;
          current[domain] ??= {};
          if (!(key in mappings[domain])) delete current[domain][key];
          else current[domain][key] = mappings[domain][key];
        }
      }
      await storageSet({ learnedMappings: current });
      return;
    }
    if (!options.labelsOnly) {
      await storageSet({ learnedMappings: mappings });
      return;
    }
    for (const [domain, signals] of Object.entries(mappings))
      for (const [key, value] of Object.entries(signals)) {
        const stored = current[domain]?.[key];
        if (
          typeof stored === 'object' &&
          typeof value === 'object' &&
          stored.path === value.path &&
          !stored.label &&
          value.label
        )
          current[domain][key] = { ...stored, label: value.label };
      }
    await storageSet({ learnedMappings: current });
  });
}

export async function clearAllStorage(): Promise<void> {
  await withProfileWriteLock(async () => {
    // An explicit reset must not immediately resurrect the development fixture.
    if (import.meta.env.DEV) await storageSet({ devProfileDisabled: true });
    const stored = await local.get(null, { rejectOnError: true });
    // Retain reset markers so stale key checks cannot restore credentials.
    const keys = Object.keys(stored).filter(
      (key) => !['devProfileDisabled', 'geminiDevDisabled', 'geminiSettingsMeta'].includes(key),
    );
    if (keys.length) await local.remove(keys, { rejectOnError: true });
  });
}

// ── Gemini AI settings ──────────────────────────────────────────────────────
// Credentials and connection metadata are local only, never profile data.
export type GeminiModelPreference = 'auto' | GeminiModel;
export interface GeminiSettings {
  apiKey: string | null;
  model: GeminiModel | null;
  preference: GeminiModelPreference;
  revision: string | null;
  verifiedAt: number | null;
}
interface GeminiSettingsMeta {
  revision: string;
  preference?: GeminiModelPreference;
  verifiedAt?: number;
}
let geminiQueue: Promise<unknown> = Promise.resolve();
async function withGeminiLock<T>(action: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks?.request)
    return await navigator.locks.request(import.meta.env.DEV ? devLockName('job-buddy-gemini-settings') : 'job-buddy-gemini-settings', action);
  const result = geminiQueue.then(action, action);
  geminiQueue = result.catch(() => {});
  return result;
}
async function readGeminiSettings(): Promise<GeminiSettings> {
  const [key, model, metadata] = await Promise.all([
    local.get('geminiApiKey', { rejectOnError: true }),
    local.get('geminiModel', { rejectOnError: true }),
    local.get('geminiSettingsMeta', { rejectOnError: true }),
  ]);
  const meta = metadata.geminiSettingsMeta as GeminiSettingsMeta | undefined;
  return {
    apiKey: typeof key.geminiApiKey === 'string' && key.geminiApiKey ? key.geminiApiKey : null,
    model: typeof model.geminiModel === 'string' && model.geminiModel ? toGeminiModel(model.geminiModel) : null,
    preference: meta?.preference && meta.preference !== 'auto' ? toGeminiModel(meta.preference) : 'auto',
    revision: meta?.revision ?? null,
    verifiedAt: meta?.verifiedAt ?? null,
  };
}
export async function getGeminiSettings(): Promise<GeminiSettings> {
  return withGeminiLock(async () => {
    const settings = await readGeminiSettings();
    if (!settings.apiKey && import.meta.env.DEV) {
      const flags = await local.get('geminiDevDisabled', { rejectOnError: true });
      const devKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
      if (!flags.geminiDevDisabled && devKey) {
        const revision = crypto.randomUUID();
        await storageSet({ geminiApiKey: devKey, geminiModel: DEFAULT_GEMINI_MODEL,
          geminiSettingsMeta: { revision, preference: 'auto' } });
        return { apiKey: devKey, model: DEFAULT_GEMINI_MODEL, preference: 'auto', revision, verifiedAt: null };
      }
    }
    return settings;
  });
}
export async function getGeminiApiKey(): Promise<string | null> {
  return (await getGeminiSettings()).apiKey;
}
export async function getGeminiModel(): Promise<string | null> {
  return (await getGeminiSettings()).model;
}

/** Commit one verified snapshot, unless removal/reset/another tab won the race. */
export async function saveGeminiSettings(
  apiKey: string, model: GeminiModel, preference: GeminiModelPreference,
  expectedRevision: string | null, isCurrent: () => boolean = () => true,
): Promise<GeminiSettings | null> {
  return withGeminiLock(async () => {
    const current = await readGeminiSettings();
    if (current.revision !== expectedRevision || !isCurrent()) return null;
    const revision = crypto.randomUUID();
    const verifiedAt = Date.now();
    await storageSet({ geminiApiKey: apiKey, geminiModel: model, geminiDevDisabled: true,
      geminiSettingsMeta: { revision, preference, verifiedAt } });
    if (!isCurrent()) {
      // A Chrome write already in flight cannot be aborted. Restore the prior
      // snapshot before releasing the lock; a queued reset/removal runs next.
      await storageSet({ geminiApiKey: current.apiKey, geminiModel: current.model,
        geminiSettingsMeta: { revision: crypto.randomUUID(), preference: current.preference,
          verifiedAt: current.verifiedAt } });
      return null;
    }
    return { apiKey, model, preference, revision, verifiedAt };
  });
}

// Compatibility helpers for callers that explicitly seed local settings.
// The UI uses saveGeminiSettings so the key/model are committed together.
export async function saveGeminiApiKey(key: string): Promise<void> {
  await withGeminiLock(async () => {
    const current = await readGeminiSettings();
    await storageSet({ geminiApiKey: key, geminiModel: current.model ?? DEFAULT_GEMINI_MODEL,
      geminiSettingsMeta: { revision: crypto.randomUUID(), preference: current.preference },
      geminiDevDisabled: true });
  });
}
export async function saveGeminiModel(model: string): Promise<void> {
  await withGeminiLock(async () => {
    await storageSet({ geminiModel: toGeminiModel(model), geminiSettingsMeta: {
      revision: crypto.randomUUID(), preference: toGeminiModel(model),
    } });
  });
}
export async function clearGeminiSettings(): Promise<void> {
  await withGeminiLock(async () => {
    // Advance the revision before removal, invalidating even pending checks in
    // another Options tab. Keep this tombstone to suppress development seeding.
    await storageSet({ geminiDevDisabled: true,
      geminiSettingsMeta: { revision: crypto.randomUUID(), preference: 'auto' } });
    await local.remove(['geminiApiKey', 'geminiModel'], { rejectOnError: true });
  });
}

export async function saveLearnedMapping(
  domain: string,
  normalizedSignal: string,
  fieldPath: string,
  label?: string,
): Promise<void> {
  if (contentStorageClient()) {
    const response = await chrome.runtime.sendMessage({
      action: 'SAVE_LEARNED_MAPPING',
      domain,
      normalizedSignal,
      fieldPath,
      label,
    });
    if (!response?.ok) throw new Error('Could not save learned mapping');
    return;
  }
  return saveLearnedMappingLocally(domain, normalizedSignal, fieldPath, label);
}

/** Background handler and extension pages share the same lock and fresh read. */
export async function saveLearnedMappingLocally(
  domain: string,
  normalizedSignal: string,
  fieldPath: string,
  label?: string,
): Promise<void> {
  await withLearnedMappingsLock(async () => {
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
        mappings[domain][normalizedSignal] = {
          path: fieldPath,
          count: existing.count + 1,
          label: label ?? existing.label,
        };
      } else {
        mappings[domain][normalizedSignal] = { path: fieldPath, count: 1, label };
      }
    }

    await storageSet({ learnedMappings: mappings });
  });
}

// ── Google Drive Cloud Backup ────────────────────────────────────────────────
// Token and backup state live in chrome.storage.local only; never included
// in profile export bundles (privacy boundary).

export async function getDriveToken(options: { rejectOnError?: boolean } = {}): Promise<string | null> {
  const result = await local.get('driveToken', options);
  return (result.driveToken as string) ?? null;
}

export async function saveDriveToken(token: string): Promise<void> {
  await storageSet({ driveToken: token });
}

export async function clearDriveToken(): Promise<void> {
  await local.remove(['driveToken'], { rejectOnError: true });
}

const DEFAULT_DRIVE_STATE: DriveBackupState = {
  fileId:      null,
  lastSynced:  null,
  pendingSync: false,
  error:       null,
};

export async function getDriveBackupState(options: { rejectOnError?: boolean } = {}): Promise<DriveBackupState> {
  const result = await local.get('driveBackupState', options);
  return (result.driveBackupState as DriveBackupState) ?? { ...DEFAULT_DRIVE_STATE };
}

export async function saveDriveBackupState(state: DriveBackupState): Promise<void> {
  await storageSet({ driveBackupState: state });
}

export async function clearDriveBackupState(): Promise<void> {
  await local.remove(['driveBackupState'], { rejectOnError: true });
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
