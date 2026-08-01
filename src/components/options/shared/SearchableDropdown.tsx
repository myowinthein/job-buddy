import type { ReactNode } from 'react';
import type { useSearchableDropdown } from './useSearchableDropdown';

interface Props<T> {
  // Full hook result from useSearchableDropdown<T> — owns open/search/highlight
  // state so this component only needs to render it.
  dropdown: ReturnType<typeof useSearchableDropdown<T>>;
  // Each Searchable* component supplies its own trigger button — shapes vary
  // too much (full-width bordered vs CallingCodeSelect's compact attached
  // style) to force into one template.
  trigger: ReactNode;
  containerClassName?: string;
  panelClassName?: string;
  searchPlaceholder: string;
  emptyText: string;
  getKey: (item: T) => string;
  isSelected: (item: T) => boolean;
  renderRow: (item: T) => ReactNode;
}

export function SearchableDropdown<T>({
  dropdown,
  trigger,
  containerClassName = 'relative w-full',
  panelClassName = 'w-full min-w-[240px]',
  searchPlaceholder,
  emptyText,
  getKey,
  isSelected,
  renderRow,
}: Props<T>) {
  const { open, search, hlIdx, filtered, containerRef, searchRef, listRef, setHlIdx, select, onSearchChange, handleKeyDown } = dropdown;

  return (
    <div ref={containerRef} className={containerClassName}>
      {trigger}

      {open && (
        <div className={`absolute top-full left-0 mt-1.5 ${panelClassName} bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg dark:shadow-black/40 z-50`}>
          <div className="p-2 border-b border-gray-100 dark:border-gray-700">
            <input
              ref={searchRef}
              type="text"
              className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
          <ul ref={listRef} role="listbox" className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-sm text-gray-400 dark:text-gray-500 text-center select-none">
                {emptyText}
              </li>
            ) : (
              filtered.map((item, idx) => (
                <li
                  key={getKey(item)}
                  role="option"
                  aria-selected={isSelected(item)}
                  className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer select-none ${
                    idx === hlIdx
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                  onMouseEnter={() => setHlIdx(idx)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => select(item)}
                >
                  {renderRow(item)}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
