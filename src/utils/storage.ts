import { withLearnedMappingsLock } from './learnedMappingsLock';
import { createNamedLock } from './namedLock';
import type { Profile } from '../types/profile';
import type {
  LearnedMappings,
  LearnedObservation,
  LearningContext,
  DriveBackupState,
} from '../types/storage';
import { normalizeProfile } from './migrate';
import { DEV_PROFILE } from './devProfile';
import { DEFAULT_GEMINI_MODEL, toGeminiModel } from '../resume-ai/types';
import type { GeminiModel } from '../resume-ai/types';
import { wrapStorageArea } from './storageArea';
import { equalJsonValues } from './equalJsonValues';
import { profileData } from './profileData';
import { rebaseLearnedMappings, reviewedIncomingMappings } from './learnedMappingProfile';
import { withProfileWriteLock } from './profileWriteLock';
import { clearRetainedFillLog } from '@/src/fill-log/retention';
import {
  repairMappingDomain,
  validRepairFields,
  type LearnedRepairField,
  type LearnedRepairState,
} from './learnedMappingRepair';
import {
  mappingPath,
  readableMappings,
  safeMappingKey,
  validMapping,
} from './learnedMappingData';

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

export async function getProfile(
  options: { rejectOnError?: boolean } = {},
): Promise<Profile | null> {
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

  if (migrated) {
    const saved = await withLearnedMappingsLock(async () => {
      const current = await local.get('profile', { rejectOnError: true });
      if (!equalJsonValues(current.profile, raw)) return false;
      await storageSet({ profile, learnedMappingsRevision: crypto.randomUUID() });
      return true;
    });
    if (!saved) return getProfile(options);
  }
  return profile;
}

export interface ImportedMappings {
  incoming: LearnedMappings;
  base: LearnedMappings;
  source: Partial<Profile>;
}

export async function saveProfile(profile: Profile, imported?: ImportedMappings): Promise<void> {
  // Belt-and-braces: normalise on every write so callers cannot persist a
  // salary entry without a valid period, even via Drive restore or resume
  // import paths that bypass validateImportedProfile.
  await withLearnedMappingsLock(async () => {
    const { profile: currentProfile } = await learningState();
    const current = await getLearnedMappings();
    profile = normalizeProfile(profile);
    let mappings = rebaseLearnedMappings(current, currentProfile ?? {}, profile);
    if (imported) {
      const incoming = reviewedIncomingMappings(current, imported.base, imported.incoming);
      mappings = mergeLearnedMappings(mappings, rebaseLearnedMappings(incoming, imported.source, profile));
    }
    // One transaction: neither the profile nor its mappings can be saved alone.
    await storageSet({
      profile,
      ...(!equalJsonValues(current, mappings) ? { learnedMappings: mappings } : {}),
      learnedMappingsRevision: crypto.randomUUID(),
    });
  });
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
  await withLearnedMappingsLock(async () => {
    const stored = await local.get('profile', { rejectOnError: true });
    const current = stored.profile
      ? normalizeProfile(stored.profile as Profile)
      : import.meta.env.DEV &&
          !(await local.get('devProfileDisabled', { rejectOnError: true })).devProfileDisabled
        ? normalizeProfile(DEV_PROFILE)
        : {};
    if (!equalJsonValues(profileData(current), profileData(expected)))
      throw new ProfileReplacementChangedError(current);
    await storageSet({
      profile: normalizeProfile(profile),
      learnedMappings: readableMappings(learnedMappings, true),
      learnedMappingRepairs: {},
      learnedMappingReviews: {},
      learnedMappingsRevision: crypto.randomUUID(),
      ...(pausedDriveState ? { driveBackupState: pausedDriveState } : {}),
    });
    await clearRetainedFillLog();
  });
}

export async function getLearnedMappings(): Promise<LearnedMappings> {
  const result = await local.get('learnedMappings', { rejectOnError: true });
  return readableMappings(result.learnedMappings, true);
}

/** Serialize repair with edits, imports and reset, using the sender's actual site. */
export async function repairLearnedMappings(
  domain: string,
  fields: LearnedRepairField[],
  context: LearningContext,
): Promise<LearnedMappings> {
  if (!safeMappingKey(domain) || !validRepairFields(fields))
    throw new Error('Invalid mapping repair');
  if (contentStorageClient()) {
    const response = await chrome.runtime.sendMessage({
      action: 'REPAIR_LEARNED_MAPPINGS', fields, context,
    });
    if (!response?.ok) throw new Error('Could not repair learned mappings');
    return readableMappings(response.mappings, true);
  }
  return withLearnedMappingsLock(async () => {
    const current = await learningState();
    if (!current.context.profileId || !equalJsonValues(current.context, context))
      throw new Error('Profile changed before repairing mappings');
    const stored = await local.get(['learnedMappings', 'learnedMappingRepairs'], {
      rejectOnError: true,
    });
    const mappings = readableMappings(stored.learnedMappings, true);
    if (!mappings[domain]) return {};
    const cached = stored.learnedMappingRepairs;
    const checkpoints = (cached && typeof cached === 'object' && !Array.isArray(cached)
      ? cached : {}) as Record<string, LearnedRepairState>;
    const result = await repairMappingDomain(
      mappings[domain], fields, checkpoints[domain] ?? {}, context.profileId,
    );
    const raw = stored.learnedMappings as LearnedMappings;
    const updated = { ...raw[domain], ...result.mappings };
    const changes: Record<string, unknown> = {};
    if (!equalJsonValues(updated, raw[domain]))
      changes.learnedMappings = { ...raw, [domain]: updated };
    if (!equalJsonValues(result.state, checkpoints[domain]))
      changes.learnedMappingRepairs = { ...checkpoints, [domain]: result.state };
    if (Object.keys(changes).length) await storageSet(changes);
    return { [domain]: result.mappings };
  });
}

/** Conflicting historical counts cannot establish which answer is current.
 * Update keeps the local decision; Replace remains the explicit adoption path. */
export function mergeLearnedMappings(
  local: LearnedMappings,
  remote: LearnedMappings,
): LearnedMappings {
  const left = readableMappings(local, true),
    right = readableMappings(remote);
  return Object.fromEntries(
    [...new Set([...Object.keys(left), ...Object.keys(right)])].map((domain) => {
      const a = left[domain] ?? {},
        b = right[domain] ?? {};
      return [
        domain,
        Object.fromEntries(
          [...new Set([...Object.keys(a), ...Object.keys(b)])].map((key) => {
            const l = a[key],
              r = b[key];
            if (!l) return [key, r];
            if (!r) return [key, l];
            const lp = mappingPath(l),
              rp = mappingPath(r);
            if (lp !== rp) return [key, l];
            // An inactive snapshot cannot promote, disable, or reactivate a local choice.
            if ((typeof l !== 'string' && l.inactive) || (typeof r !== 'string' && r.inactive))
              return [key, l];
            if (typeof l === 'string') return [key, l];
            if (typeof r === 'string') return [key, { ...l, count: Math.max(l.count, 2) }];
            // Same-path backups are snapshots, not independent confirmations.
            return [
              key,
              {
                ...r,
                ...l,
                count: Math.max(l.count, r.count),
                ...(l.label || r.label ? { label: l.label || r.label } : {}),
              },
            ];
          }),
        ),
      ];
    }),
  );
}

async function learningState(): Promise<{
  profile: Profile | null;
  context: LearningContext;
}> {
  const stored = await local.get(['profile', 'learnedMappingsRevision', 'devProfileDisabled'], {
    rejectOnError: true,
  });
  const profile = stored.profile
    ? normalizeProfile(stored.profile as Profile)
    : import.meta.env.DEV && !stored.devProfileDisabled
      ? normalizeProfile(DEV_PROFILE)
      : null;
  return {
    profile,
    context: {
      profileId: profile?.id ?? '',
      revision: typeof stored.learnedMappingsRevision === 'string' ? stored.learnedMappingsRevision : null,
    },
  };
}

export async function getLearningContext(profile: Profile | null): Promise<LearningContext | null> {
  const current = await learningState();
  return equalJsonValues(profileData(current.profile ?? {}), profileData(profile ?? {}))
    ? current.context
    : null;
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
  options: { labelsOnly?: boolean; base?: LearnedMappings; context?: LearningContext; strictBase?: boolean } = {},
): Promise<void> {
  if (options.labelsOnly && contentStorageClient()) {
    const response = await chrome.runtime.sendMessage({ action: 'SAVE_LEARNED_LABELS', mappings });
    if (!response?.ok) throw new Error('Could not save learned labels');
    return;
  }
  await withLearnedMappingsLock(async () => {
    if (options.context && !equalJsonValues((await learningState()).context, options.context)) throw new Error('Profile changed before saving learned mappings');
    const current = await getLearnedMappings();
    mappings = readableMappings(mappings, !!options.base);
    const initial = structuredClone(current);
    if (options.base) {
      for (const domain of new Set([...Object.keys(options.base), ...Object.keys(mappings)])) {
        if (!(domain in mappings)) {
          if (!current[domain]) continue;
          if (options.strictBase && !equalJsonValues(current[domain], options.base[domain]))
            throw new Error('Learned mapping changed before saving');
          delete current[domain];
          continue;
        }
        const before = options.base[domain] ?? {};
        for (const key of new Set([...Object.keys(before), ...Object.keys(mappings[domain])])) {
          if (equalJsonValues(before[key], mappings[domain][key])) continue;
          if (options.strictBase && !equalJsonValues(current[domain]?.[key], before[key]))
            throw new Error('Learned mapping changed before saving');
          if (Object.hasOwn(before, key) && !Object.hasOwn(current[domain] ?? {}, key))
            throw new Error('Learned mapping changed before saving');
          current[domain] ??= {};
          if (!(key in mappings[domain])) delete current[domain][key];
          else {
            const value = mappings[domain][key];
            current[domain][key] = typeof value === 'string' ? value : { ...value, scope: 'entry' };
          }
        }
      }
      const stored = await local.get('learnedMappingRepairs');
      const checkpoints = stored.learnedMappingRepairs as Record<string, LearnedRepairState> | undefined;
      const kept = checkpoints && Object.fromEntries(
        Object.entries(checkpoints).filter(([domain]) => Object.hasOwn(current, domain))
          .map(([domain, entries]) => [domain, Object.fromEntries(
            Object.entries(entries).filter(([key]) => Object.hasOwn(current[domain], key)),
          )]),
      );
      await storageSet({
        learnedMappings: current,
        ...(kept ? { learnedMappingRepairs: kept } : {}),
      });
      return;
    }
    if (!options.labelsOnly) {
      await storageSet({ learnedMappings: mappings, learnedMappingRepairs: {}, learnedMappingReviews: {} });
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
    if (!equalJsonValues(current, initial)) await storageSet({ learnedMappings: current });
  });
}

export async function clearAllStorage(): Promise<void> {
  await withProfileWriteLock(() =>
    withLearnedMappingsLock(async () => {
      // Advance the learning revision before removal to invalidate old form observations.
      await storageSet({ learnedMappingsRevision: crypto.randomUUID() });
      // An explicit reset must not immediately resurrect the development fixture.
      if (import.meta.env.DEV) await storageSet({ devProfileDisabled: true });
      const stored = await local.get(null, { rejectOnError: true });
      // Retain reset markers so stale key checks cannot restore credentials.
      const keys = Object.keys(stored).filter(
        (key) =>
          ![
            'devProfileDisabled',
            'geminiDevDisabled',
            'geminiSettingsMeta',
            'learnedMappingsRevision',
          ].includes(key),
      );
      if (keys.length) await local.remove(keys, { rejectOnError: true });
      await clearRetainedFillLog();
    }),
  );
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
const withGeminiLock = createNamedLock('job-buddy-gemini-settings');
async function readGeminiSettings(): Promise<GeminiSettings> {
  // One read, so the key, model and metadata come from the same snapshot.
  const stored = await local.get(['geminiApiKey', 'geminiModel', 'geminiSettingsMeta'], {
    rejectOnError: true,
  });
  const meta = stored.geminiSettingsMeta as GeminiSettingsMeta | undefined;
  return {
    apiKey: typeof stored.geminiApiKey === 'string' && stored.geminiApiKey ? stored.geminiApiKey : null,
    model: typeof stored.geminiModel === 'string' && stored.geminiModel ? toGeminiModel(stored.geminiModel) : null,
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

export async function clearGeminiSettings(): Promise<void> {
  await withGeminiLock(async () => {
    // Advance the revision before removal, invalidating even pending checks in
    // another Options tab. Keep this tombstone to suppress development seeding.
    await storageSet({ geminiDevDisabled: true,
      geminiSettingsMeta: { revision: crypto.randomUUID(), preference: 'auto' } });
    await local.remove(['geminiApiKey', 'geminiModel'], { rejectOnError: true });
  });
}

/** One user observation saves all of its aliases in one storage transaction. */
export async function saveLearnedObservation(
  domain: string,
  observation: LearnedObservation,
): Promise<void> {
  if (contentStorageClient()) {
    const response = await chrome.runtime.sendMessage({
      action: 'SAVE_LEARNED_OBSERVATION',
      observation,
    });
    if (!response?.ok) throw new Error('Could not save learned mapping');
  } else await saveLearnedObservationLocally(domain, observation);
}

export async function saveLearnedObservationLocally(
  domain: string,
  observation: LearnedObservation,
): Promise<void> {
  if (!safeMappingKey(domain) || !validObservation(observation))
    throw new Error('Invalid learned observation');
  await withLearnedMappingsLock(async () => {
    const { context } = await learningState();
    if (!context.profileId || !equalJsonValues(context, observation.context)) return;
    const mappings = await getLearnedMappings();
    mappings[domain] ??= {};
    for (const key of new Set(observation.signals)) {
      const previous = mappings[domain][key];
      const samePath =
        previous && (typeof previous === 'string' || !previous.inactive) &&
        mappingPath(previous) === observation.path;
      const sameQuestion =
        typeof previous !== 'object' ||
        !previous.question ||
        previous.question === observation.question;
      mappings[domain][key] = {
        path: observation.path,
        count:
          samePath && sameQuestion
            ? Math.min(
                Number.MAX_SAFE_INTEGER,
                (typeof previous === 'string' ? 2 : previous.count) + 1,
              )
            : 1,
        ...(observation.label ? { label: observation.label } : {}),
        ...(observation.question ? { question: observation.question } : {}),
        ...(observation.scope ? { scope: observation.scope } : {}),
      };
    }
    if (observation.signals.length) await storageSet({ learnedMappings: mappings });
  });
}

export function validObservation(value: unknown): value is LearnedObservation {
  if (!value || typeof value !== 'object') return false;
  const entry = value as LearnedObservation;
  return (
    Array.isArray(entry.signals) &&
    entry.signals.length > 0 &&
    entry.signals.length <= 5 &&
    entry.signals.every((key) => typeof key === 'string' && safeMappingKey(key)) &&
    validMapping({
      path: entry.path,
      count: 1,
      label: entry.label,
      question: entry.question,
      scope: entry.scope,
    }) &&
    !!entry.context &&
    typeof entry.context.profileId === 'string' &&
    !!entry.context.profileId &&
    entry.context.profileId.length <= 200 &&
    (entry.context.revision === null ||
      (typeof entry.context.revision === 'string' && entry.context.revision.length <= 200))
  );
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
