import { useState, useEffect, useRef, useMemo, type KeyboardEvent } from 'react';
import { useDropdownOpenState } from './useDropdownOpenState';

interface UseSearchableDropdownOptions<T> {
  // Filters the full option list for a given search string. The hook memoizes
  // the result on `search`, so this runs once per keystroke rather than on
  // every render. Pass a stable (module-scope) function.
  filter: (search: string) => T[];
  // Called with the chosen item when the user selects an option.
  onSelect: (item: T) => void;
  // Computes the highlight index to use when the dropdown opens (e.g. the
  // index of the currently-selected value). Return -1 for "no selection";
  // the hook clamps that to 0.
  findOpenIndex: () => number;
}

/**
 * Shared state machinery for the Searchable* dropdown components
 * (country, country+currency, currency, language, calling-code).
 *
 * Owns: open/search/highlight state, the three refs, the focus-on-open,
 * scroll-highlight-into-view, and outside-click effects, plus keyboard
 * navigation and selection. Each component keeps its own trigger and option
 * rendering and supplies its own filter + item type via generics.
 */
export function useSearchableDropdown<T>({ filter, onSelect, findOpenIndex }: UseSearchableDropdownOptions<T>) {
  const [hlIdx, setHlIdx] = useState(0);
  const { open, setOpen, search, setSearch, containerRef, searchRef } = useDropdownOpenState(() => setHlIdx(0));

  const filtered = useMemo(() => filter(search), [filter, search]);

  const listRef = useRef<HTMLUListElement>(null);

  // Keep the highlighted row scrolled into view during keyboard navigation.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.children[hlIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [hlIdx, open]);

  const select = (item: T) => {
    onSelect(item);
    setOpen(false);
    setSearch('');
    setHlIdx(0);
  };

  const toggle = () => {
    if (!open) {
      const idx = findOpenIndex();
      setHlIdx(idx >= 0 ? idx : 0);
    }
    setOpen((o) => !o);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        setHlIdx((i) => Math.min(i + 1, filtered.length - 1));
        e.preventDefault();
        break;
      case 'ArrowUp':
        setHlIdx((i) => Math.max(i - 1, 0));
        e.preventDefault();
        break;
      case 'Enter':
        if (filtered[hlIdx]) select(filtered[hlIdx]);
        e.preventDefault();
        break;
      case 'Escape':
        setOpen(false);
        setSearch('');
        setHlIdx(0);
        e.preventDefault();
        break;
    }
  };

  const onSearchChange = (v: string) => {
    setSearch(v);
    setHlIdx(0);
  };

  return {
    open,
    search,
    hlIdx,
    filtered,
    containerRef,
    searchRef,
    listRef,
    setHlIdx,
    select,
    toggle,
    handleKeyDown,
    onSearchChange,
  };
}
