import { LANGUAGES, findLanguage } from '@/src/data/languages';
import type { Language } from '@/src/data/languages';
import { getFlag } from '@/src/data/countries';
import { useSearchableDropdown } from './useSearchableDropdown';
import { SearchableDropdown } from './SearchableDropdown';

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

  const dropdown = useSearchableDropdown<Language>({
    filter: filterLanguages,
    onSelect: (l) => onChange(l.code),
    findOpenIndex: () =>
      value ? LANGUAGES.findIndex((l) => l.code === value || l.name.toLowerCase() === value.toLowerCase()) : -1,
  });

  const borderCls = error
    ? 'border-red-300 dark:border-red-500 focus:ring-red-500'
    : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500';

  return (
    <SearchableDropdown
      dropdown={dropdown}
      panelClassName="w-full min-w-[220px]"
      searchPlaceholder="Search language…"
      emptyText="No languages found."
      getKey={(l) => l.code}
      isSelected={(l) => l.code === value}
      renderRow={(l) => (
        <>
          <span className="shrink-0 text-base">{getFlag(l.country)}</span>
          <span className="flex-1 truncate">{l.name}</span>
        </>
      )}
      trigger={
        <button
          type="button"
          onClick={dropdown.toggle}
          className={`w-full px-3 py-2 border ${borderCls} rounded-lg text-sm text-left bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 flex items-center gap-2 min-h-[38px]`}
          aria-haspopup="listbox"
          aria-expanded={dropdown.open}
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
      }
    />
  );
}
