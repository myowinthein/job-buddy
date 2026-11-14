import { useState } from 'react';
import type { Profile } from '@/src/types/profile';
import { equalJsonValues } from '@/src/utils/equalJsonValues';
import { useDraftFlag } from './draftStatus';

/** A successful save acknowledges only the submitted draft, including during slow writes. */
export function useSectionDraft(
  draft: unknown,
  onSave: (patch: Partial<Profile>) => Promise<void>,
) {
  const [saved, setSaved] = useState(() => draft);
  useDraftFlag(!equalJsonValues(draft, saved));

  return async (patch: Partial<Profile>) => {
    await onSave(patch);
    setSaved(() => draft);
  };
}
