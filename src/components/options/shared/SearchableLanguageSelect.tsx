import { useState, useEffect, useRef } from 'react';
import { LANGUAGES, findLanguage } from '@/src/data/languages';
import type { Language } from '@/src/data/languages';

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
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [hlIdx, setHlIdx] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = value ? findLanguage(value) : undefined;
  const filtered = filterLanguages(search);

  useEffect(() => {
    if (open) {
      searchRef.current?.focus();
      const idx = value ? LANGUAGES.findIndex((l) => l.code === value || l.name.toLowerCase() === value.toLowerCase()) : -1;
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

  const select = (l: Language) => {
    onChange(l.code);
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

  // Display the name from the list, or the raw value if it's a legacy free-text entry
  const displayName = selected?.name ?? (value || '');

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full px-3 py-2 border ${borderCls} rounded-lg text-sm text-left bg-white focus:outline-none focus:ring-2 flex items-center gap-2 min-h-[38px]`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {displayName ? (
          <span className="flex-1 text-gray-900">{displayName}</span>
        ) : (
          <span className="flex-1 text-gray-400">{placeholder}</span>
        )}
        <span className="text-gray-400 text-xs shrink-0">▾</span>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 w-full min-w-[220px] bg-white border border-gray-200 rounded-lg shadow-lg z-50">
          <div className="p-2 border-b border-gray-100">
            <input
              ref={searchRef}
              type="text"
              className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Search language…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setHlIdx(0); }}
              onKeyDown={handleKeyDown}
            />
          </div>
          <ul ref={listRef} role="listbox" className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-sm text-gray-400 text-center select-none">
                No languages found.
              </li>
            ) : (
              filtered.map((l, idx) => (
                <li
                  key={l.code}
                  role="option"
                  aria-selected={l.code === value}
                  className={`px-3 py-2 text-sm cursor-pointer select-none ${
                    idx === hlIdx ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                  onMouseEnter={() => setHlIdx(idx)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => select(l)}
                >
                  {l.name}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
