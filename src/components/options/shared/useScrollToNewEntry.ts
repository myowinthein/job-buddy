import { useEffect, type RefObject } from 'react';

const FOCUSABLE_SELECTOR =
  'input:not([type="radio"]):not([type="checkbox"]):not([type="hidden"]):not([readonly]),' +
  ' select, button[aria-haspopup="listbox"]';

export function useScrollToNewEntry(ref: RefObject<HTMLDivElement | null>, tick: number) {
  useEffect(() => {
    if (!tick) return;
    const raf = requestAnimationFrame(() => {
      const last = ref.current?.lastElementChild as HTMLElement | null;
      last?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      last?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [tick]);
}
