import { useState, useEffect, useRef } from 'react';
import { CURRENCIES, findCurrency } from '@/src/data/currencies';
import { getFlag } from '@/src/data/countries';
import type { Currency } from '@/src/data/currencies';

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
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [hlIdx, setHlIdx] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = value ? findCurrency(value) : undefined;
  const filtered = filterCurrencies(search);

  useEffect(() => {
    if (open) {
      searchRef.current?.focus();
      const idx = value ? CURRENCIES.findIndex((c) => c.code === value) : -1;
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

  const select = (c: Currency) => {
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
    ? 'border-red-300 dark:border-red-500 focus:ring-red-500'
    : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500';

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        id={id}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full px-3 py-2 border ${borderCls} rounded-lg text-sm text-left bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 flex items-center gap-2 min-h-[38px]`}
        aria-haspopup="listbox"
        aria-expanded={open}
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

      {open && (
        <div className="absolute top-full left-0 mt-1.5 w-full min-w-[280px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg dark:shadow-black/40 z-50">
          <div className="p-2 border-b border-gray-100 dark:border-gray-700">
            <input
              ref={searchRef}
              type="text"
              className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Search by code or name…"
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
              <li className="px-3 py-3 text-sm text-gray-400 dark:text-gray-500 text-center select-none">
                No currencies found.
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
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => select(c)}
                >
                  <span className="shrink-0 text-base">{getFlag(c.countryCode)}</span>
                  <span className="shrink-0 w-11 font-medium tabular-nums">{c.code}</span>
                  <span className="truncate text-gray-500 dark:text-gray-400">{c.name}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
