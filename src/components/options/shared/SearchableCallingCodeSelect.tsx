import { COUNTRIES, getFlag, findCountry } from '@/src/data/countries';
import type { Country } from '@/src/data/countries';
import { useSearchableDropdown } from './useSearchableDropdown';
import { SearchableDropdown } from './SearchableDropdown';

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

  const dropdown = useSearchableDropdown<Country>({
    filter: filterCountries,
    onSelect: (c) => onChange(c.code),
    findOpenIndex: () => COUNTRIES.findIndex((c) => c.code === value),
  });

  return (
    <SearchableDropdown
      dropdown={dropdown}
      containerClassName="relative shrink-0"
      panelClassName="w-72"
      searchPlaceholder="Search country or code…"
      emptyText="No countries found."
      getKey={(c) => c.code}
      isSelected={(c) => c.code === value}
      renderRow={(c) => (
        <>
          <span className="shrink-0 text-base">{getFlag(c.code)}</span>
          <span className="shrink-0 w-11 font-medium tabular-nums">{c.callingCode}</span>
          <span className="truncate">{c.name}</span>
        </>
      )}
      trigger={
        <button
          type="button"
          onClick={dropdown.toggle}
          className="h-full rounded-l-lg bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 px-2 py-2 text-sm cursor-pointer flex items-center gap-1 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors whitespace-nowrap focus:outline-none"
          aria-haspopup="listbox"
          aria-expanded={dropdown.open}
          aria-label="Select country calling code"
        >
          <span>{getFlag(selected.code)}</span>
          <span className="font-medium text-gray-700 dark:text-gray-300">{selected.callingCode}</span>
          <span className="text-gray-400 dark:text-gray-500 text-xs ml-0.5">▾</span>
        </button>
      }
    />
  );
}
