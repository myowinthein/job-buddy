import { useEffect, useRef, useState } from 'react';
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
  const allCheckbox = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const count =
    selected === null ? sites.length : sites.filter((site) => selected.has(site)).length;
  const all = sites.length > 0 && count === sites.length;
  const filtered = sites.filter((site) => site.toLowerCase().includes(search.trim().toLowerCase()));

  useEffect(() => {
    if (allCheckbox.current) allCheckbox.current.indeterminate = count > 0 && !all;
  }, [count, all]);

  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
        Sites to review
      </legend>
      <input
        type="search"
        aria-label="Search sites"
        placeholder="Search sites"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className={fieldCls(undefined, disabled)}
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
          <input
            ref={allCheckbox}
            type="checkbox"
            checked={all}
            disabled={!sites.length}
            onChange={(event) => onChange(event.target.checked ? null : new Set())}
            className="h-4 w-4 shrink-0 accent-blue-600"
          />
          All sites
        </label>
        <span role="status" aria-atomic="true" className="text-xs text-gray-500 dark:text-gray-400">
          {count} of {sites.length} selected
        </span>
      </div>
      <div className="mt-2 max-h-56 overflow-y-auto overscroll-contain">
        {filtered.map((site) => (
          <label
            key={site}
            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
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
            <span className="min-w-0 break-all">{site}</span>
          </label>
        ))}
        {!filtered.length && (
          <p className="px-2 text-sm text-gray-500 dark:text-gray-400">No sites found.</p>
        )}
      </div>
    </fieldset>
  );
}
