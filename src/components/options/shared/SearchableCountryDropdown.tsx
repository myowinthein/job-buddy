import { feedback } from '@/src/ui/feedback';
import { COUNTRIES, getFlag, findCountryByNameOrCode } from '@/src/data/countries';
import type { Country } from '@/src/data/countries';
import { useSearchableDropdown } from './useSearchableDropdown';
import { SearchableDropdown } from './SearchableDropdown';

interface Props {
  value: string;
  onChange: (code: string) => void;
  error?: string;
  placeholder?: string;
  id?: string;
}

function filterCountries(search: string): Country[] {
  const q = search.trim().toLowerCase();
  if (!q) return COUNTRIES;
  return COUNTRIES.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q),
  );
}

export function SearchableCountryDropdown({ value, onChange, error, placeholder = 'Select country…', id }: Props) {
  const selected = value ? findCountryByNameOrCode(value) : undefined;

  const dropdown = useSearchableDropdown<Country>({
    filter: filterCountries,
    onSelect: (c) => onChange(c.code),
    findOpenIndex: () => (value ? COUNTRIES.findIndex((c) => c.code === value) : -1),
  });

  const borderCls = error
    ? 'border-red-300 dark:border-red-500 focus:ring-red-500'
    : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500';

  return (
    <SearchableDropdown
      dropdown={dropdown}
      panelClassName="w-full min-w-[min(240px,calc(100vw-6rem))]"
      searchPlaceholder={feedback.countrySearchPlaceholder}
      emptyText={feedback.noCountriesFound}
      getKey={(c) => c.code}
      isSelected={(c) => c.code === value}
      renderRow={(c) => (
        <>
          <span className="shrink-0 text-base">{getFlag(c.code)}</span>
          <span className="shrink-0 w-8 text-xs text-gray-500 dark:text-gray-400 font-mono uppercase">{c.code}</span>
          <span className="truncate">{c.name}</span>
        </>
      )}
      trigger={
        <button
          id={id}
          type="button"
          onClick={dropdown.toggle}
          className={`w-full px-3 py-2 border ${borderCls} rounded-lg text-sm text-left bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 flex items-center gap-2 min-h-[38px]`}
          aria-haspopup="listbox"
          aria-expanded={dropdown.open}
        >
          {selected ? (
            <>
              <span className="shrink-0">{getFlag(selected.code)}</span>
              <span className="flex-1 text-gray-900 dark:text-gray-100">{selected.name}</span>
            </>
          ) : (
            <span className="flex-1 text-gray-500 dark:text-gray-400">{value || placeholder}</span>
          )}
          <span className="text-gray-500 dark:text-gray-400 text-xs shrink-0">▾</span>
        </button>
      }
    />
  );
}
