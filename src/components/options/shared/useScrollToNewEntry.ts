import { useEffect, useState, type RefObject } from 'react';
import { getScrollBehavior } from '@/src/utils/scrollBehavior';

const FOCUSABLE_SELECTOR =
  'input:not([type="radio"]):not([type="checkbox"]):not([type="hidden"]):not([readonly]),' +
  ' select, button[aria-haspopup="listbox"]';

export function useScrollToNewEntry(ref: RefObject<HTMLDivElement | null>) {
  const [focusRequest, setFocusRequest] = useState({ rowId: '', tick: 0 });
  useEffect(() => {
    if (!focusRequest.rowId) return;
    const raf = requestAnimationFrame(() => {
      const entry = ref.current?.querySelector<HTMLElement>(
        `[data-entry-id="${focusRequest.rowId}"]`,
      );
      entry?.scrollIntoView({ behavior: getScrollBehavior(), block: 'nearest' });
      entry?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
  }, [ref, focusRequest]);
  return {
    focusRequest,
    focusEntry: (rowId: string) =>
      setFocusRequest((current) => ({ rowId, tick: current.tick + 1 })),
  };
}
