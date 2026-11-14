import { useId, useState } from 'react';
import { ConfirmRemoveButton } from './ConfirmRemoveButton';
import { deferPointerFocus, focusOnClick } from './stableControlFocus';

interface ExpandableCardProps {
  id?: string;
  entryId?: string;
  summary: React.ReactNode;
  badge?: React.ReactNode;
  subtitle?: string;
  onDelete?: () => void;
  confirmDelete?: boolean;
  deleteLabel?: 'Delete' | 'Clear';
  children: React.ReactNode;
  defaultExpanded?: boolean;
  expandRequest?: number;
  invalid?: boolean;
}

export function ExpandableCard({
  id,
  entryId,
  summary,
  badge,
  subtitle,
  onDelete,
  confirmDelete = true,
  deleteLabel = 'Delete',
  children,
  defaultExpanded = false,
  expandRequest = 0,
  invalid = false,
}: ExpandableCardProps) {
  const panelId = useId();
  const [expanded, setExpanded] = useState(defaultExpanded || invalid || expandRequest > 0);
  const [previousExpandRequest, setPreviousExpandRequest] = useState(expandRequest);
  const [previousInvalid, setPreviousInvalid] = useState(invalid);
  const isExpanded = expanded || invalid;

  if (invalid !== previousInvalid) {
    setPreviousInvalid(invalid);
    if (invalid) setExpanded(true);
  }
  if (expandRequest !== previousExpandRequest) {
    setPreviousExpandRequest(expandRequest);
    if (expandRequest > 0) setExpanded(true);
  }

  return (
    <div
      id={id}
      data-entry-id={entryId}
      className="@container/entry-card border border-gray-200 dark:border-gray-700 rounded-lg mb-3 overflow-hidden"
    >
      <div
        data-entry-header=""
        className={`grid grid-cols-[minmax(0,1fr)_auto_1rem] items-center gap-x-2 gap-y-2 px-4 py-3 bg-gray-50 dark:bg-gray-800 ${isExpanded ? 'rounded-t-lg' : 'rounded-lg'}`}
      >
        <button
          type="button"
          data-entry-toggle=""
          className="col-span-3 col-start-1 row-span-2 row-start-1 grid min-w-0 grid-cols-subgrid grid-rows-subgrid items-center text-left focus-visible:outline-none @min-[26rem]/entry-card:row-span-1 @min-[26rem]/entry-card:row-start-1"
          onMouseDown={deferPointerFocus}
          onClick={(event) => {
            focusOnClick(event);
            setExpanded(!expanded);
          }}
          aria-expanded={isExpanded}
          aria-controls={panelId}
        >
          <span className="col-span-3 min-w-0 @min-[26rem]/entry-card:col-span-1">
            <span className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                {summary}
              </span>
              {badge}
            </span>
            {subtitle && (
              <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{subtitle}</span>
            )}
          </span>
          <span
            data-entry-expand=""
            aria-hidden="true"
            className="col-start-3 row-start-2 flex min-h-6 items-center justify-center text-xs text-gray-500 dark:text-gray-400 @min-[26rem]/entry-card:row-start-1"
          >
            {isExpanded ? '▲' : '▼'}
          </span>
        </button>
        {onDelete && (
          <div className="relative col-start-2 row-start-2 flex items-center @min-[26rem]/entry-card:row-start-1">
            <ConfirmRemoveButton
              onConfirm={onDelete}
              confirm={confirmDelete}
              action={deleteLabel}
            />
          </div>
        )}
      </div>
      <div id={panelId} hidden={!isExpanded} className="p-4 border-t border-gray-200 dark:border-gray-700">
        {isExpanded && children}
      </div>
    </div>
  );
}
