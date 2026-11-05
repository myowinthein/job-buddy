import type { Profile } from '@/src/types/profile';
import { wrapStorageArea } from '@/src/utils/storageArea';

export const PREVIEW_SEED_PREFIX = 'jb:dev:quick-preview:';
export const PROFILE_PRESETS = [
  { id: 'empty', label: 'Empty', scenario: 'profile-empty' },
  { id: 'required', label: 'Required only', scenario: 'profile-minimum' },
  { id: 'complete', label: 'Complete', scenario: 'profile-complete' },
] as const;
export type PreviewPreset = (typeof PROFILE_PRESETS)[number]['id'] | 'saved';
export interface QuickPreview {
  preset: PreviewPreset;
  missingKey: boolean;
  driveConnected: boolean;
  seedId: string | null;
}
interface PreviewSeed {
  profile?: Partial<Profile>;
  learnedMappings?: unknown;
  themePreference?: unknown;
}

export function readQuickPreview(search = location.search): QuickPreview | null {
  const params = new URLSearchParams(search);
  const preset = params.get('devPreview');
  if (preset === null) return null;
  if (preset !== 'saved' && !PROFILE_PRESETS.some((item) => item.id === preset))
    throw new Error('Unknown profile preview');
  const seedId = params.get('devPreviewSeed');
  if (seedId && !/^[a-z0-9-]{1,64}$/i.test(seedId)) throw new Error('Invalid preview seed');
  return {
    preset: preset as PreviewPreset,
    missingKey: params.get('devNoKey') === '1',
    driveConnected: params.get('devDrive') === '1',
    seedId,
  };
}

export function previewUrl(
  preset: PreviewPreset,
  missingKey: boolean,
  seedId: string,
  driveConnected = false,
): string {
  const url = new URL(location.href);
  url.search = new URLSearchParams({ devPreview: preset, devPreviewSeed: seedId }).toString();
  if (missingKey) url.searchParams.set('devNoKey', '1');
  if (driveConnected) url.searchParams.set('devDrive', '1');
  url.hash = '';
  return url.href;
}

export function exitPreviewUrl(): string {
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  return url.href;
}

export function cleanupPreviewSeeds(keepId: string | null): void {
  const keep = keepId ? PREVIEW_SEED_PREFIX + keepId : null;
  for (let index = sessionStorage.length - 1; index >= 0; index--) {
    const key = sessionStorage.key(index);
    if (key?.startsWith(PREVIEW_SEED_PREFIX) && key !== keep) sessionStorage.removeItem(key);
  }
}

export async function preparePreview(preset: PreviewPreset): Promise<string> {
  // A unique seed leaves the active data intact if the replacement fails to load.
  cleanupPreviewSeeds(readQuickPreview()?.seedId ?? null);
  const local = wrapStorageArea(() => chrome.storage.local, 'development preview');
  const data = await local.get(
    preset === 'saved' ? ['profile', 'learnedMappings', 'themePreference'] : ['themePreference'],
    { rejectOnError: true },
  );
  const seed: PreviewSeed = { themePreference: data.themePreference };
  if (preset === 'saved') {
    seed.profile = (data.profile as Partial<Profile> | undefined) ?? { id: 'dev-preview-empty' };
    seed.learnedMappings = data.learnedMappings;
  }
  const id = crypto.randomUUID();
  sessionStorage.setItem(PREVIEW_SEED_PREFIX + id, JSON.stringify(seed));
  return id;
}

export function loadPreviewSeed(preview: QuickPreview): {
  profile?: Partial<Profile>;
  initialData: Record<string, unknown>;
} {
  const raw = preview.seedId && sessionStorage.getItem(PREVIEW_SEED_PREFIX + preview.seedId);
  const seed: PreviewSeed = raw ? JSON.parse(raw) : {};
  if (!seed || typeof seed !== 'object') throw new Error('Invalid preview data');
  if (preview.preset === 'saved' && (!seed.profile || typeof seed.profile !== 'object'))
    throw new Error('Saved profile preview is unavailable');
  const initialData: Record<string, unknown> = {};
  if (['system', 'light', 'dark'].includes(String(seed.themePreference)))
    initialData.themePreference = seed.themePreference;
  if (preview.preset === 'saved' && seed.learnedMappings)
    initialData.learnedMappings = seed.learnedMappings;
  return {
    ...(preview.preset === 'saved' ? { profile: seed.profile } : {}),
    initialData,
  };
}
