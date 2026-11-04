import type { Profile } from '../types/profile';
import type { LearnedMappings } from '../types/storage';
import type { GeminiModel } from '../resume-ai/types';
import { PROFILE_ENTRY_PATHS } from '../profile/fieldCatalog';
import { readProfilePath } from '../profile/fieldMetadata';
import { equalJsonValues } from './equalJsonValues';
import { wrapStorageArea } from './storageArea';
import { withLearnedMappingsLock } from './learnedMappingsLock';
import { getLearningContext, getLearnedMappings, saveLearnedMappings } from './storage';
import {
  MAPPING_REVIEW_VERSION,
  mappingReviewCatalog,
  parseMappingAssessments,
  reviewFingerprint,
  reviewedMappingChanges,
  type CachedMappingAssessment,
  type MappingAssessment,
  type MappingReviewCache,
  type MappingReviewDecision,
  type MappingReviewItem,
} from '../learned-mappings/review';
import { feedback } from '../ui/feedback';

const local = wrapStorageArea(() => chrome.storage.local, 'mapping review', {
  rejectOnSetError: true,
});
const CACHE_KEY = 'learnedMappingReviews';
const MAX_CACHE_ENTRIES = 2000;

export async function mappingReviewKeys(
  profile: Partial<Profile>,
  items: MappingReviewItem[],
  model: GeminiModel,
): Promise<Map<string, string>> {
  // Entry contents matter when an indexed destination moves or disappears. This
  // fingerprint stays local and never enters the Gemini request.
  const structure = await reviewFingerprint([
    MAPPING_REVIEW_VERSION,
    model,
    profile.id,
    mappingReviewCatalog(profile),
    PROFILE_ENTRY_PATHS.map((path) => [path, readProfilePath(profile, path)]),
  ]);
  return new Map(
    await Promise.all(
      items.map(
        async (item) =>
          [item.id, await reviewFingerprint([structure, item.domain, item.members])] as const,
      ),
    ),
  );
}

export async function readMappingReviews(
  profile: Partial<Profile>,
  items: MappingReviewItem[],
  keys: Map<string, string>,
): Promise<Map<string, CachedMappingAssessment>> {
  const stored = await local.get(CACHE_KEY, { rejectOnError: true });
  const cache = stored[CACHE_KEY] as MappingReviewCache | undefined;
  const results = new Map<string, CachedMappingAssessment>();
  const catalog = mappingReviewCatalog(profile);
  for (const item of items) {
    const value = cache?.[keys.get(item.id)!];
    if (!value || typeof value.model !== 'string' || !Number.isFinite(value.reviewedAt)) continue;
    try {
      const [assessment] = parseMappingAssessments(
        JSON.stringify([{ ...value.assessment, id: item.id }]),
        [item],
        catalog,
      );
      results.set(item.id, { ...value, assessment });
    } catch {
      /* A malformed cache entry is reviewed again. */
    }
  }
  return results;
}

export async function saveMappingReviews(
  profile: Partial<Profile>,
  items: MappingReviewItem[],
  keys: Map<string, string>,
  assessments: MappingAssessment[],
  model: string,
): Promise<void> {
  await withLearnedMappingsLock(async () => {
    const context = await getLearningContext(profile.id ? (profile as Profile) : null);
    if (!context) throw new Error(feedback.mappingReviewChanged);
    const fresh = await getLearnedMappings();
    const stored = await local.get(CACHE_KEY, { rejectOnError: true });
    const current = stored[CACHE_KEY];
    const cache: MappingReviewCache =
      current && typeof current === 'object' && !Array.isArray(current)
        ? { ...(current as MappingReviewCache) }
        : {};
    const byId = new Map(items.map((item) => [item.id, item]));
    for (const assessment of assessments) {
      const item = byId.get(assessment.id);
      const key = keys.get(assessment.id);
      if (
        item &&
        key &&
        item.members.every(([signal, value]) =>
          equalJsonValues(fresh[item.domain]?.[signal], value),
        )
      )
        cache[key] = { assessment, model, reviewedAt: Date.now() };
    }
    const bounded = Object.fromEntries(
      Object.entries(cache)
        .sort(([, a], [, b]) => (b?.reviewedAt ?? 0) - (a?.reviewedAt ?? 0))
        .slice(0, MAX_CACHE_ENTRIES),
    );
    await local.set({ [CACHE_KEY]: bounded });
  });
}

export async function applyMappingReview(
  profile: Partial<Profile>,
  base: LearnedMappings,
  items: MappingReviewItem[],
  decisions: Record<string, MappingReviewDecision>,
): Promise<void> {
  const next = reviewedMappingChanges(
    base,
    items,
    decisions,
    new Set(mappingReviewCatalog(profile).map((field) => field.path)),
  );
  if (equalJsonValues(base, next)) return;
  const context = await getLearningContext(profile.id ? (profile as Profile) : null);
  if (!context) throw new Error(feedback.mappingReviewChanged);
  try {
    await saveLearnedMappings(next, { base, context, strictBase: true });
  } catch (error) {
    if (error instanceof Error && /^(Profile changed|Learned mapping changed)/.test(error.message))
      throw new Error(feedback.mappingReviewChanged);
    throw error;
  }
}
