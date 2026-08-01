import { CURRENCIES, findCurrency } from '@/src/data/currencies';
import { getFlag } from '@/src/data/countries';
import type { Currency } from '@/src/data/currencies';
import { useSearchableDropdown } from './useSearchableDropdown';
import { SearchableDropdown } from './SearchableDropdown';

interface Props {
  value: string;
  onChange: (code: string) => void;
  error?: string;
  placeholder?: string;
  id?: string;
}

function filterCurrencies(search: string): Currency[] {
  const q = search.trim().toLowerCase();
  if (!q) return CURRENCIES;
  return CURRENCIES.filter(
    (c) =>
      c.code.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q),
  );
}

export function SearchableCurrencySelect({ value, onChange, error, placeholder = 'Select currency…', id }: Props) {
  const selected = value ? findCurrency(value) : undefined;

  const dropdown = useSearchableDropdown<Currency>({
    filter: filterCurrencies,
    onSelect: (c) => onChange(c.code),
    findOpenIndex: () => (value ? CURRENCIES.findIndex((c) => c.code === value) : -1),
  });

  const borderCls = error
    ? 'border-red-300 dark:border-red-500 focus:ring-red-500'
    : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500';

  return (
    <SearchableDropdown
      dropdown={dropdown}
      panelClassName="w-full min-w-[280px]"
      searchPlaceholder="Search by code or name…"
      emptyText="No currencies found."
      getKey={(c) => c.code}
      isSelected={(c) => c.code === value}
      renderRow={(c) => (
        <>
          <span className="shrink-0 text-base">{getFlag(c.countryCode)}</span>
          <span className="shrink-0 w-11 font-medium tabular-nums">{c.code}</span>
          <span className="truncate text-gray-500 dark:text-gray-400">{c.name}</span>
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
              <span className="shrink-0">{getFlag(selected.countryCode)}</span>
              <span className="flex-1 text-gray-900 dark:text-gray-100">{selected.code} — {selected.name}</span>
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
