import { useEffect, useRef, useState } from 'react';

interface UseDropdownPanelOptions {
  // Called when the panel is about to open, before `search` is cleared —
  // e.g. to seed which sections/subgroups start expanded from the current value.
  onOpen?: () => void;
}

// Open/search/outside-click/focus-on-open plumbing shared by dropdown panels
// whose item rendering is too structurally different from the flat filtered
// list useSearchableDropdown assumes (e.g. SearchableProfileFieldSelect's
// grouped section/cluster/subgroup tree) to compose from that hook directly.
export function useDropdownPanel({ onOpen }: UseDropdownPanelOptions = {}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const close = () => {
    setOpen(false);
    setSearch('');
  };

  const toggle = () => {
    if (!open) {
      onOpen?.();
      setSearch('');
    }
    setOpen((o) => !o);
  };

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return { open, search, setSearch, containerRef, searchRef, toggle, close };
}
