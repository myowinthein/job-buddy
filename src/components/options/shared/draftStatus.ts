import { createContext, useContext, useEffect, useId } from 'react';

export const DraftStatusContext = createContext<(id: string, dirty: boolean) => void>(() => {});
export const SectionSaveStatusContext = createContext<'idle' | 'unsaved' | 'saved'>('idle');

/** Aggregate section values and partial composite inputs without clearing one another. */
export function useDraftFlag(dirty: boolean) {
  const id = useId();
  const reportDirty = useContext(DraftStatusContext);
  useEffect(() => {
    reportDirty(id, dirty);
  }, [id, dirty, reportDirty]);
  useEffect(() => () => reportDirty(id, false), [id, reportDirty]);
}
