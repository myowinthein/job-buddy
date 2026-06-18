import { useState, useEffect, useRef } from 'react';
import { COUNTRIES, getFlag } from '@/src/data/countries';
import { COUNTRY_TO_CURRENCY } from '@/src/data/currencies';
import type { Country } from '@/src/data/countries';

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
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [hlIdx, setHlIdx] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = value ? COUNTRIES.find((c) => c.code === value) : undefined;
  const filtered = filterCountries(search);

  useEffect(() => {
    if (open) {
      searchRef.current?.focus();
      const idx = value ? COUNTRIES.findIndex((c) => c.code === value) : -1;
      setHlIdx(idx >= 0 ? idx : 0);
    } else {
      setSearch('');
      setHlIdx(0);
    }
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.children[hlIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [hlIdx, open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const select = (c: Country) => {
    onChange(c.code);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        setHlIdx((i) => Math.min(i + 1, filtered.length - 1));
        e.preventDefault();
        break;
      case 'ArrowUp':
        setHlIdx((i) => Math.max(i - 1, 0));
        e.preventDefault();
        break;
      case 'Enter':
        if (filtered[hlIdx]) select(filtered[hlIdx]);
        e.preventDefault();
        break;
      case 'Escape':
        setOpen(false);
        e.preventDefault();
        break;
    }
  };

  const borderCls = error
    ? 'border-red-300 focus:ring-red-500'
    : 'border-gray-300 focus:ring-blue-500';

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full px-3 py-2 border ${borderCls} rounded-lg text-sm text-left bg-white focus:outline-none focus:ring-2 flex items-center gap-2 min-h-[38px]`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selected ? (
          <>
            <span className="shrink-0">{getFlag(selected.code)}</span>
            <span className="flex-1 truncate text-gray-900">{selected.name}</span>
            <span className="shrink-0 text-xs font-mono text-gray-500">{currencyFor(selected.code)}</span>
          </>
        ) : (
          <span className="flex-1 text-gray-400">{placeholder}</span>
        )}
        <span className="text-gray-400 text-xs shrink-0">▾</span>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 w-full min-w-[280px] bg-white border border-gray-200 rounded-lg shadow-lg z-50">
          <div className="p-2 border-b border-gray-100">
            <input
              ref={searchRef}
              type="text"
              className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Search country, code, or currency…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setHlIdx(0);
              }}
              onKeyDown={handleKeyDown}
            />
          </div>
          <ul ref={listRef} role="listbox" className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-sm text-gray-400 text-center select-none">
                No countries found.
              </li>
            ) : (
              filtered.map((c, idx) => (
                <li
                  key={c.code}
                  role="option"
                  aria-selected={c.code === value}
                  className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer select-none ${
                    idx === hlIdx ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                  onMouseEnter={() => setHlIdx(idx)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => select(c)}
                >
                  <span className="shrink-0 text-base">{getFlag(c.code)}</span>
                  <span className="flex-1 truncate">{c.name}</span>
                  <span className="shrink-0 text-xs font-mono text-gray-400">{currencyFor(c.code)}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
