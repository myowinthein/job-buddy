import { useEffect, useRef, useState } from 'react';
import { RemoveButton } from './RemoveButton';
import { deferPointerFocus, focusOnClick } from './stableControlFocus';

interface ExpandableCardProps {
  id?: string;
  summary: string;
  badge?: React.ReactNode;
  subtitle?: string;
  onDelete?: () => void;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  invalid?: boolean;
  // Overrides the default p-4 content padding — for denser content (e.g. the
  // debug panel's field lists) where the default spacing compounds awkwardly
  // with padding the content itself already carries. Learned Mappings (the
  // original/default use case) is unaffected unless it opts in.
  contentClassName?: string;
}

export function ExpandableCard({
  id,
  summary,
  badge,
  subtitle,
  onDelete,
  children,
  defaultExpanded = false,
  invalid = false,
  contentClassName = 'p-4',
}: ExpandableCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded || invalid);
  const [previousInvalid, setPreviousInvalid] = useState(invalid);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const isExpanded = expanded || invalid;

  if (invalid !== previousInvalid) {
    setPreviousInvalid(invalid);
    if (invalid) setExpanded(true);
  }

  // Reset the armed delete-confirmation state when the user clicks anywhere
  // outside the card, so clicking the remove icon then changing their mind
  // by clicking elsewhere doesn't leave it silently armed.
  useEffect(() => {
    if (!confirmDelete) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setConfirmDelete(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [confirmDelete]);

  return (
    <div
      id={id}
      ref={cardRef}
      className="border border-gray-200 dark:border-gray-700 rounded-lg mb-3 overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800">
        <button
          type="button"
          className="flex-1 text-left min-w-0 mr-3"
          onMouseDown={deferPointerFocus}
          onClick={(event) => {
            focusOnClick(event);
            setExpanded(!expanded);
            setConfirmDelete(false);
          }}
          aria-expanded={isExpanded}
        >
          <span className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{summary}</span>
            {badge}
          </span>
          {subtitle && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{subtitle}</p>
          )}
        </button>
        <div className="flex items-center gap-2 shrink-0">
          {onDelete &&
            (confirmDelete ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onDelete();
                    setConfirmDelete(false);
                  }}
                  className="text-xs px-2.5 py-1 bg-red-600 dark:bg-red-700 text-white rounded-md hover:bg-red-700 dark:hover:bg-red-600 active:scale-95 transition-colors"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs px-2.5 py-1 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-95 transition-colors"
                >
                  Cancel
                </button>
              </>
            ) : (
              <RemoveButton onClick={() => setConfirmDelete(true)} title="Remove entry" />
            ))}
          <button
            type="button"
            onMouseDown={deferPointerFocus}
            onClick={(event) => {
              focusOnClick(event);
              setExpanded(!expanded);
              setConfirmDelete(false);
            }}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 active:scale-95 transition-colors text-xs w-4 text-center"
            aria-expanded={isExpanded}
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? '▲' : '▼'}
          </button>
        </div>
      </div>
      {isExpanded && (
        <div className={`${contentClassName} border-t border-gray-200 dark:border-gray-700`}>
          {children}
        </div>
      )}
    </div>
  );
}
