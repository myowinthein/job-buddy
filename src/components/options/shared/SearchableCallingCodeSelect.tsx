import { COUNTRIES, getFlag, findCountry } from '@/src/data/countries';
import type { Country } from '@/src/data/countries';
import { useSearchableDropdown } from './useSearchableDropdown';

interface Props {
  value: string;                   // ISO 3166-1 alpha-2 code
  onChange: (code: string) => void;
}

// Unlike SearchableCountryDropdown, this also matches on calling code (e.g.
// "+66") so users can find a country by dialing prefix during phone entry.
function filterCountries(search: string): Country[] {
  const q = search.trim().toLowerCase();
  if (!q) return COUNTRIES;
  const noPlus = q.replace(/^\+/, '');
  return COUNTRIES.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.callingCode.replace('+', '').includes(noPlus) ||
      c.callingCode.toLowerCase().includes(q),
  );
}

export function SearchableCallingCodeSelect({ value, onChange }: Props) {
  const selected = findCountry(value);

  const { open, search, hlIdx, filtered, containerRef, searchRef, listRef, setHlIdx, select, toggle, handleKeyDown, onSearchChange } =
    useSearchableDropdown<Country>({
      filter: filterCountries,
      onSelect: (c) => onChange(c.code),
      findOpenIndex: () => COUNTRIES.findIndex((c) => c.code === value),
    });

  return (
    <div ref={containerRef} className="relative shrink-0">
      {/* ── Trigger ─────────────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={toggle}
        className="h-full rounded-l-lg bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 px-2 py-2 text-sm cursor-pointer flex items-center gap-1 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors whitespace-nowrap focus:outline-none"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Select country calling code"
      >
        <span>{getFlag(selected.code)}</span>
        <span className="font-medium text-gray-700 dark:text-gray-300">{selected.callingCode}</span>
        <span className="text-gray-400 dark:text-gray-500 text-xs ml-0.5">▾</span>
      </button>

      {/* ── Dropdown ────────────────────────────────────────────────────────── */}
      {open && (
        <div className="absolute top-full left-0 mt-1.5 w-72 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg dark:shadow-black/40 z-50">
          {/* Search input */}
          <div className="p-2 border-b border-gray-100 dark:border-gray-700">
            <input
              ref={searchRef}
              type="text"
              className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Search country or code…"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>

          {/* Country list */}
          <ul ref={listRef} role="listbox" className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-sm text-gray-400 dark:text-gray-500 text-center select-none">
                No countries found.
              </li>
            ) : (
              filtered.map((c, idx) => (
                <li
                  key={c.code}
                  role="option"
                  aria-selected={c.code === value}
                  className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer select-none ${
                    idx === hlIdx
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                  onMouseEnter={() => setHlIdx(idx)}
                  onMouseDown={(e) => e.preventDefault()} // keep search input focused
                  onClick={() => select(c)}
                >
                  <span className="shrink-0 text-base">{getFlag(c.code)}</span>
                  <span className="shrink-0 w-11 font-medium tabular-nums">{c.callingCode}</span>
                  <span className="truncate">{c.name}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
