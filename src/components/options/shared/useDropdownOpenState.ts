import { useEffect, useRef, useState } from 'react';

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
export function useDropdownOpenState(onClose?: () => void) {
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
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
        onCloseRef.current?.();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return { open, setOpen, search, setSearch, containerRef, searchRef };
}
