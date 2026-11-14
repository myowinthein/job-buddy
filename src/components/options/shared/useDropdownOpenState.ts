import { useEffect, useRef, useState, type RefObject } from 'react';
import { getTabbableElements } from '@/src/components/ui/focusableElements';

// Open/search/outside-click/focus-on-open plumbing shared by both
// useDropdownPanel and useSearchableDropdown — extracted since they had
// near-identical copies of this state and these two effects, differing only
// in what (if anything) each layers on top (filter/highlight machinery for
// useSearchableDropdown, nothing extra for useDropdownPanel).
//
// `onClose` fires (in addition to the open/search reset) whenever the
// outside-click handler closes the panel — e.g. so a caller with its own
// extra state (a highlight index) can reset that too. Read via a ref so the
// outside-click effect only re-subscribes when `open` changes, not on every
// render a fresh inline callback would otherwise trigger.
export function useDropdownOpenState(
  onClose?: () => void,
  portalRef?: RefObject<HTMLElement | null>,
) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        !containerRef.current?.contains(e.target as Node) &&
        !portalRef?.current?.contains(e.target as Node)
      ) {
        setOpen(false);
        setSearch('');
        onCloseRef.current?.();
      }
    };
    const leaveWithTab = (event: KeyboardEvent) => {
      const panel = portalRef?.current;
      if (event.key !== 'Tab' || !panel?.contains(event.target as Node)) return;
      const controls = getTabbableElements(panel);
      const boundary = event.shiftKey ? controls[0] : controls.at(-1);
      if (document.activeElement !== boundary) return;
      const trigger = containerRef.current?.querySelector<HTMLButtonElement>('button');
      if (!trigger) return;
      setOpen(false);
      setSearch('');
      onCloseRef.current?.();
      // Native Tab continues from the trigger's place in the form.
      trigger.focus({ preventScroll: true });
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', leaveWithTab);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', leaveWithTab);
    };
  }, [open, portalRef]);

  return { open, setOpen, search, setSearch, containerRef, searchRef };
}
