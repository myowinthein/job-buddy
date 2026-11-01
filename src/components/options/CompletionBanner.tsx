import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { CompletionGroup } from '@/src/utils/profileCompletion';

interface CompletionBannerProps {
  percentage: number;
  isCoreComplete: boolean;
  optionalFieldsRemaining: number;
  optionalGroups: CompletionGroup[];
  missingGroups: CompletionGroup[];
  onNavigate: (sectionId: string) => void;
  onFocusField: (sectionId: string, fieldLabel: string) => void;
}

export function CompletionBanner({
  percentage,
  isCoreComplete,
  optionalFieldsRemaining,
  optionalGroups,
  missingGroups,
  onNavigate,
  onFocusField,
}: CompletionBannerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const [hasMoreBelow, setHasMoreBelow] = useState(false);
  const measureScroll = useCallback(() => {
    const list = listRef.current;
    setHasMoreBelow(!!list && list.scrollHeight - list.clientHeight - list.scrollTop > 1);
  }, []);
  const count = isCoreComplete
    ? optionalFieldsRemaining
    : missingGroups.reduce((sum, g) => sum + g.fields.length, 0);
  const groups = isCoreComplete ? optionalGroups : missingGroups;
  const heading = isCoreComplete ? 'More details' : 'Missing details';

  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Native overlay scrollbars can stay hidden on macOS. Keep a visible cue
    // until the user reaches the end, including after the viewport changes.
    measureScroll();
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measureScroll);
    if (listRef.current) observer?.observe(listRef.current);
    window.addEventListener('resize', measureScroll);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measureScroll);
    };
  }, [open, groups, measureScroll]);

  return (
    <div
      ref={rootRef}
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node))
          setOpen(false);
      }}
      className="relative bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 sm:px-6 min-h-16 py-3 flex flex-wrap items-center gap-2 sm:gap-4 shrink-0"
    >
      <div className="flex items-center gap-2" title="Based on saved required details">
        <span
          className={`text-sm font-bold ${isCoreComplete ? 'text-green-700 dark:text-green-400' : 'text-blue-700 dark:text-blue-400'}`}
        >
          {percentage}%
        </span>
        <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
          {isCoreComplete ? 'Required details complete' : 'Required profile'}
        </span>
        <span className="sr-only">Based on saved data</span>
      </div>
      <div
        role="progressbar"
        aria-label="Saved required profile details"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percentage}
        className="flex-1 min-w-20 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden"
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ${isCoreComplete ? 'bg-green-500' : 'bg-blue-500'}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {count > 0 && (
        <div className="sm:relative shrink-0">
          <button
            ref={triggerRef}
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={
              isCoreComplete ? `More details (${count} available)` : `${count} required remaining`
            }
            onClick={() => setOpen((value) => !value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setOpen(true);
                requestAnimationFrame(() => panelRef.current?.querySelector('button')?.focus());
              }
            }}
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-900/30"
          >
            {isCoreComplete ? 'More details' : `${count} remaining`}
            <ChevronDown
              aria-hidden="true"
              className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </button>
          {open && (
            <div
              ref={panelRef}
              id={panelId}
              role="region"
              aria-label={heading}
              className="absolute left-4 right-4 sm:left-auto sm:right-0 top-full mt-2 w-auto sm:w-72 max-w-[calc(100vw-6rem)] bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 z-50 overflow-hidden"
            >
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 px-3 py-2.5 border-b border-gray-100 dark:border-gray-700">
                {heading}
              </p>
              <div className="relative mb-2">
                <ul
                  ref={listRef}
                  onScroll={measureScroll}
                  aria-label="Profile details by section"
                  className="completion-details-scroll max-h-[min(20rem,calc(100dvh-10rem))] overflow-y-auto overscroll-contain [scrollbar-gutter:stable]"
                >
                  {groups.map((group) => (
                    <li key={group.sectionId} className="py-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          onNavigate(group.sectionId);
                          setOpen(false);
                        }}
                        className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs font-semibold text-gray-900 hover:text-blue-700 dark:text-gray-100 dark:hover:text-blue-300"
                      >
                        {group.sectionLabel}
                        <ChevronRight aria-hidden="true" className="h-3 w-3" />
                      </button>
                      <ul className="ml-4 mr-2 border-l border-gray-200 pl-2 dark:border-gray-600">
                        {group.fields.map((field) => (
                          <li key={field}>
                            <button
                              type="button"
                              onClick={() => {
                                onFocusField(group.sectionId, field);
                                setOpen(false);
                              }}
                              className="w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-600 hover:bg-blue-50 hover:text-blue-700 dark:text-gray-300 dark:hover:bg-blue-900/30 dark:hover:text-blue-300"
                            >
                              {field}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
                {hasMoreBelow && (
                  <div
                    aria-hidden="true"
                    data-scroll-cue
                    className="pointer-events-none absolute inset-x-0 bottom-0 flex h-10 items-end justify-center gap-1 bg-gradient-to-t from-white via-white/90 pb-1 dark:from-gray-800 dark:via-gray-800/90"
                  >
                    <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300">
                      Scroll for more
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
