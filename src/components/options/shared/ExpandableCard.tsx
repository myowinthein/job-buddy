import { useState } from 'react';
import { RemoveButton } from './RemoveButton';

interface ExpandableCardProps {
  summary: string;
  subtitle?: string;
  onDelete: () => void;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

export function ExpandableCard({
  summary,
  subtitle,
  onDelete,
  children,
  defaultExpanded = false,
}: ExpandableCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg mb-3 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800">
        <button
          type="button"
          className="flex-1 text-left min-w-0 mr-3"
          onClick={() => setExpanded(!expanded)}
        >
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{summary}</p>
          {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{subtitle}</p>}
        </button>
        <div className="flex items-center gap-2 shrink-0">
          {confirmDelete ? (
            <>
              <button
                type="button"
                onClick={() => { onDelete(); setConfirmDelete(false); }}
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
          )}
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 active:scale-95 transition-colors text-xs w-4 text-center"
          >
            {expanded ? '▲' : '▼'}
          </button>
        </div>
      </div>
      {expanded && <div className="p-4 border-t border-gray-200 dark:border-gray-700">{children}</div>}
    </div>
  );
}
