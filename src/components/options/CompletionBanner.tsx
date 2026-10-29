import { useEffect, useId, useRef, useState } from 'react';
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
  const count = isCoreComplete
    ? optionalFieldsRemaining
    : missingGroups.reduce((sum, g) => sum + g.fields.length, 0);
  const groups = isCoreComplete ? optionalGroups : missingGroups;
  const heading = isCoreComplete ? 'Optional details' : 'Required details to complete or correct';

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

  return (
    <div
      ref={rootRef}
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node))
          setOpen(false);
      }}
      className="relative bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 sm:px-6 min-h-16 py-3 flex flex-wrap items-center gap-2 sm:gap-4 shrink-0"
    >
      <div
        className="flex items-center gap-2"
        title="Based on saved profile data. Optional details do not affect this percentage."
      >
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
            onClick={() => setOpen((value) => !value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setOpen(true);
                requestAnimationFrame(() => panelRef.current?.querySelector('button')?.focus());
              }
            }}
            className="text-xs text-blue-700 dark:text-blue-300 hover:underline flex items-center gap-1"
          >
            {count} {isCoreComplete ? 'optional details' : 'required remaining'}{' '}
            <span aria-hidden="true">{open ? '▲' : '▼'}</span>
          </button>
          {open && (
            <div
              ref={panelRef}
              id={panelId}
              role="region"
              aria-label={heading}
              className="absolute left-4 right-4 sm:left-auto sm:right-0 top-full mt-2 w-auto sm:w-80 max-w-[calc(100vw-6rem)] bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50 py-2"
            >
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 px-3 pb-1.5 border-b border-gray-100 dark:border-gray-700">
                {heading}
              </p>
              <p className="px-3 py-1 text-xs text-gray-500 dark:text-gray-400">
                {isCoreComplete
                  ? 'Add only what you want to share. These do not affect your percentage.'
                  : 'Select a detail to go to its input. Progress updates after saving.'}
              </p>
              <ul className="max-h-64 overflow-y-auto py-1">
                {groups.map((group) => (
                  <li key={group.sectionId}>
                    <button
                      type="button"
                      onClick={() => {
                        onNavigate(group.sectionId);
                        setOpen(false);
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                    >
                      {group.sectionLabel} →
                    </button>
                    <ul>
                      {group.fields.map((field) => (
                        <li key={field}>
                          <button
                            type="button"
                            onClick={() => {
                              onFocusField(group.sectionId, field);
                              setOpen(false);
                            }}
                            className="w-full text-left flex items-center gap-2 px-5 py-1.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                          >
                            <span
                              aria-hidden="true"
                              className="w-1 h-1 rounded-full bg-current shrink-0"
                            />
                            {field}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
