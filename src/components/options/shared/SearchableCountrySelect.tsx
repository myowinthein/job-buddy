import { useState, useEffect, useRef } from 'react';
import { COUNTRIES, getFlag, findCountry } from '@/src/data/countries';
import type { Country } from '@/src/data/countries';

interface Props {
  value: string;                   // ISO 3166-1 alpha-2 code
  onChange: (code: string) => void;
}

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

export function SearchableCountrySelect({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [hlIdx, setHlIdx] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = findCountry(value);
  const filtered = filterCountries(search);

  // On open: focus search + pre-highlight the current selection.
  // On close: reset search text.
  useEffect(() => {
    if (open) {
      searchRef.current?.focus();
      const idx = COUNTRIES.findIndex((c) => c.code === value);
      setHlIdx(idx >= 0 ? idx : 0);
    } else {
      setSearch('');
      setHlIdx(0);
    }
  }, [open, value]);

  // Keep the highlighted row scrolled into view during keyboard navigation.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.children[hlIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [hlIdx, open]);

  // Close when the user clicks outside the component.
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

  return (
    <div ref={containerRef} className="relative shrink-0">
      {/* ── Trigger ─────────────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="h-full rounded-l-lg bg-gray-50 border-r border-gray-200 px-2 py-2 text-sm cursor-pointer flex items-center gap-1 hover:bg-gray-100 transition-colors whitespace-nowrap focus:outline-none"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Select country calling code"
      >
        <span>{getFlag(selected.code)}</span>
        <span className="font-medium text-gray-700">{selected.callingCode}</span>
        <span className="text-gray-400 text-xs ml-0.5">▾</span>
      </button>

      {/* ── Dropdown ────────────────────────────────────────────────────────── */}
      {open && (
        <div className="absolute top-full left-0 mt-1.5 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
          {/* Search input */}
          <div className="p-2 border-b border-gray-100">
            <input
              ref={searchRef}
              type="text"
              className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Search country or code…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setHlIdx(0);
              }}
              onKeyDown={handleKeyDown}
            />
          </div>

          {/* Country list */}
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
                    idx === hlIdx
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-50'
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
