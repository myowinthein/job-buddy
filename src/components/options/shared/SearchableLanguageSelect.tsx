import { LANGUAGES, findLanguage } from '@/src/data/languages';
import type { Language } from '@/src/data/languages';
import { getFlag } from '@/src/data/countries';
import { useSearchableDropdown } from './useSearchableDropdown';

interface Props {
  value: string;                   // ISO 639-1 code, e.g. "en"
  onChange: (code: string) => void;
  error?: string;
  placeholder?: string;
}

function filterLanguages(search: string): Language[] {
  const q = search.trim().toLowerCase();
  if (!q) return LANGUAGES;
  return LANGUAGES.filter((l) => l.name.toLowerCase().includes(q));
}

export function SearchableLanguageSelect({ value, onChange, error, placeholder = 'Select language…' }: Props) {
  const selected = value ? findLanguage(value) : undefined;
  // Display the name from the list, or the raw value if it's a legacy free-text entry
  const displayName = selected?.name ?? (value || '');

  const { open, search, hlIdx, filtered, containerRef, searchRef, listRef, setHlIdx, select, toggle, handleKeyDown, onSearchChange } =
    useSearchableDropdown<Language>({
      filter: filterLanguages,
      onSelect: (l) => onChange(l.code),
      findOpenIndex: () =>
        value ? LANGUAGES.findIndex((l) => l.code === value || l.name.toLowerCase() === value.toLowerCase()) : -1,
    });

  const borderCls = error
    ? 'border-red-300 dark:border-red-500 focus:ring-red-500'
    : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500';

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        onClick={toggle}
        className={`w-full px-3 py-2 border ${borderCls} rounded-lg text-sm text-left bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 flex items-center gap-2 min-h-[38px]`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selected ? (
          <>
            <span className="shrink-0">{getFlag(selected.country)}</span>
            <span className="flex-1 text-gray-900 dark:text-gray-100">{selected.name}</span>
          </>
        ) : displayName ? (
          <span className="flex-1 text-gray-900 dark:text-gray-100">{displayName}</span>
        ) : (
          <span className="flex-1 text-gray-400 dark:text-gray-500">{placeholder}</span>
        )}
        <span className="text-gray-400 dark:text-gray-500 text-xs shrink-0">▾</span>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 w-full min-w-[220px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg dark:shadow-black/40 z-50">
          <div className="p-2 border-b border-gray-100 dark:border-gray-700">
            <input
              ref={searchRef}
              type="text"
              className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Search language…"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
          <ul ref={listRef} role="listbox" className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-sm text-gray-400 dark:text-gray-500 text-center select-none">
                No languages found.
              </li>
            ) : (
              filtered.map((l, idx) => (
                <li
                  key={l.code}
                  role="option"
                  aria-selected={l.code === value}
                  className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer select-none ${
                    idx === hlIdx
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                  onMouseEnter={() => setHlIdx(idx)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => select(l)}
                >
                  <span className="shrink-0 text-base">{getFlag(l.country)}</span>
                  <span className="flex-1 truncate">{l.name}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
