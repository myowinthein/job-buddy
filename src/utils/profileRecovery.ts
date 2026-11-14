import type { Profile } from '@/src/types/profile';
import { FIELD_DEFS, generateDiff } from '@/src/resume-ai/parser';
import { selectChange } from '@/src/resume-ai/entrySelection';
import { equalJsonValues } from './equalJsonValues';

/** Compare actual unsaved edits with a replacement profile, preserving saved values by default. */
export function profileRecoveryChanges(
  original: Partial<Profile>,
  draft: Partial<Profile>,
  current: Partial<Profile>,
) {
  const edited = new Set(
    FIELD_DEFS.filter(
      (field) =>
        !equalJsonValues(field.getValue(original), field.getValue(draft)) &&
        !(field.isEmpty(field.getValue(original)) && field.isEmpty(field.getValue(draft))),
    ).map((field) => field.id),
  );
  return generateDiff(current, draft)
    .filter((change) => edited.has(change.id))
    .map((change) =>
      selectChange(
        {
          ...change,
          suggestedValue: change.suggestedValue ?? undefined,
          ...(!change.hasIncomingValue &&
            change.displayCurrent && {
              status: 'conflict' as const,
              displaySuggested: 'Clear this detail',
            }),
          note: undefined,
        },
        false,
      ),
    );
}
