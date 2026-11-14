import type { Profile } from '../types/profile';
import type { LearnedMappings } from '../types/storage';
import { equalJsonValues } from './equalJsonValues';
import { getLearningContext, saveLearnedMappings } from './storage';
import {
  mappingReviewCatalog,
  reviewedMappingChanges,
  type MappingReviewDecision,
  type MappingReviewItem,
} from '../learned-mappings/review';
import { feedback } from '../ui/feedback';

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
