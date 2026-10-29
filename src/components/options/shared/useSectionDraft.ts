import { useState } from 'react';
import type { Profile } from '@/src/types/profile';
import { useDraftFlag } from './draftStatus';

/** A successful save acknowledges only the submitted draft, including during slow writes. */
export function useSectionDraft(
  draft: unknown,
  onSave: (patch: Partial<Profile>) => Promise<void>,
) {
  const snapshot = JSON.stringify(draft);
  const [saved, setSaved] = useState(snapshot);
  useDraftFlag(snapshot !== saved);

  return async (patch: Partial<Profile>) => {
    await onSave(patch);
    setSaved(snapshot);
  };
}
