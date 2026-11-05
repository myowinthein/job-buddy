import { useEffect, useId, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { useDropdownPanel } from './shared/useDropdownPanel';
import { fieldCls } from './shared/fieldCls';

export function MappingReviewSites({
  sites,
  selected,
  disabled,
  onChange,
}: {
  sites: string[];
  selected: Set<string> | null;
  disabled: boolean;
  onChange: (selected: Set<string> | null) => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const allCheckbox = useRef<HTMLInputElement>(null);
  const { open, search, setSearch, containerRef, searchRef, toggle, close } = useDropdownPanel();
  const count =
    selected === null ? sites.length : sites.filter((site) => selected.has(site)).length;
  const all = count === sites.length;
  const filtered = sites.filter((site) => site.toLowerCase().includes(search.trim().toLowerCase()));

  useEffect(() => {
    if (allCheckbox.current) allCheckbox.current.indeterminate = count > 0 && !all;
  }, [open, count, all]);

  const summary = all
    ? `All sites (${sites.length})`
    : count === 0
      ? 'Select sites'
      : count === 1
        ? sites.find((site) => selected?.has(site))
        : `${count} sites selected`;

  return (
    <div
      ref={containerRef}
      className="min-w-0 flex-1"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation();
          close();
          trigger.current?.focus();
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) close();
      }}
    >
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-200">
        Sites to review
      </label>
      <button
        ref={trigger}
        id={id}
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-sites`}
        disabled={disabled}
        className={`${fieldCls()} mt-1 flex items-center justify-between gap-2 text-left`}
        onClick={toggle}
      >
        <span className="truncate">{summary}</span>
        <ChevronDown size={16} aria-hidden="true" className="shrink-0" />
      </button>
      {open && !disabled && (
        <div
          id={`${id}-sites`}
          role="group"
          aria-label="Site selection"
          className="mt-2 rounded-lg border border-gray-300 dark:border-gray-600"
        >
          <div className="p-2">
            <input
              ref={searchRef}
              type="search"
              aria-label="Search sites"
              placeholder="Search sites"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className={fieldCls()}
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200">
            <input
              ref={allCheckbox}
              type="checkbox"
              checked={all}
              onChange={(event) => onChange(event.target.checked ? null : new Set())}
              className="h-4 w-4 shrink-0 accent-blue-600"
            />
            All sites ({sites.length})
          </label>
          <div className="max-h-48 overflow-y-auto pb-1">
            {filtered.map((site) => (
              <label
                key={site}
                className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <input
                  type="checkbox"
                  checked={selected === null || selected.has(site)}
                  onChange={(event) => {
                    const next = new Set(selected ?? sites);
                    if (event.target.checked) next.add(site);
                    else next.delete(site);
                    onChange(next.size === sites.length ? null : next);
                  }}
                  className="h-4 w-4 shrink-0 accent-blue-600"
                />
                <span className="break-all">{site}</span>
              </label>
            ))}
            {!filtered.length && (
              <p className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">No sites found.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
