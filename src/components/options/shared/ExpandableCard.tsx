import { useState } from 'react';

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
    <div className="border border-gray-200 rounded-lg mb-3 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
        <button
          type="button"
          className="flex-1 text-left min-w-0 mr-3"
          onClick={() => setExpanded(!expanded)}
        >
          <p className="text-sm font-medium text-gray-900 truncate">{summary}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5 truncate">{subtitle}</p>}
        </button>
        <div className="flex items-center gap-2 shrink-0">
          {confirmDelete ? (
            <>
              <button
                type="button"
                onClick={() => { onDelete(); setConfirmDelete(false); }}
                className="text-xs px-2.5 py-1 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="text-xs px-2.5 py-1 border border-gray-300 text-gray-600 rounded-md hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="text-xs px-2.5 py-1 text-red-600 border border-red-200 rounded-md hover:bg-red-50 transition-colors"
            >
              Remove
            </button>
          )}
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-gray-400 hover:text-gray-600 transition-colors text-xs w-4 text-center"
          >
            {expanded ? '▲' : '▼'}
          </button>
        </div>
      </div>
      {expanded && <div className="p-4 border-t border-gray-200">{children}</div>}
    </div>
  );
}
