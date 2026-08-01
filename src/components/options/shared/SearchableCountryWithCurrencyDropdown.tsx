import { COUNTRIES, getFlag, findCountry } from '@/src/data/countries';
import { COUNTRY_TO_CURRENCY } from '@/src/data/currencies';
import type { Country } from '@/src/data/countries';
import { useSearchableDropdown } from './useSearchableDropdown';
import { SearchableDropdown } from './SearchableDropdown';

interface Props {
  value: string; // ISO 3166-1 alpha-2, or ''
  onChange: (code: string) => void;
  error?: string;
  placeholder?: string;
}

function currencyFor(code: string): string {
  return COUNTRY_TO_CURRENCY[code] ?? '—';
}

function filterCountries(search: string): Country[] {
  const q = search.trim().toLowerCase();
  if (!q) return COUNTRIES;
  return COUNTRIES.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q) ||
      currencyFor(c.code).toLowerCase().includes(q),
  );
}

export function SearchableCountryWithCurrencyDropdown({
  value,
  onChange,
  error,
  placeholder = 'Select country…',
}: Props) {
  const selected = value ? findCountry(value) : undefined;

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
      panelClassName="w-full min-w-[280px]"
      searchPlaceholder="Search country, code, or currency…"
      emptyText="No countries found."
      getKey={(c) => c.code}
      isSelected={(c) => c.code === value}
      renderRow={(c) => (
        <>
          <span className="shrink-0 text-base">{getFlag(c.code)}</span>
          <span className="flex-1 truncate">{c.name}</span>
          <span className="shrink-0 text-xs font-mono text-gray-400 dark:text-gray-500">{currencyFor(c.code)}</span>
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
              <span className="shrink-0">{getFlag(selected.code)}</span>
              <span className="flex-1 truncate text-gray-900 dark:text-gray-100">{selected.name}</span>
              <span className="shrink-0 text-xs font-mono text-gray-500 dark:text-gray-400">{currencyFor(selected.code)}</span>
            </>
          ) : (
            <span className="flex-1 text-gray-400 dark:text-gray-500">{placeholder}</span>
          )}
          <span className="text-gray-400 dark:text-gray-500 text-xs shrink-0">▾</span>
        </button>
      }
    />
  );
}
