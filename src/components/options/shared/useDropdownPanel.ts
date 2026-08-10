import { useDropdownOpenState } from './useDropdownOpenState';

interface UseDropdownPanelOptions {
  // Called when the panel is about to open, before `search` is cleared —
  // e.g. to seed which sections/subgroups start expanded from the current value.
  onOpen?: () => void;
}

// Thin wrapper around useDropdownOpenState for dropdown panels whose item
// rendering is too structurally different from the flat filtered list
// useSearchableDropdown assumes (e.g. SearchableProfileFieldSelect's grouped
// section/cluster/subgroup tree) to compose from that hook directly.
export function useDropdownPanel({ onOpen }: UseDropdownPanelOptions = {}) {
  const { open, setOpen, search, setSearch, containerRef, searchRef } = useDropdownOpenState();

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

  return { open, search, setSearch, containerRef, searchRef, toggle, close };
}
