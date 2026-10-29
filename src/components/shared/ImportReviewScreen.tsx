import { useId, useState, type RefObject } from 'react';
import type { FieldChange } from '@/src/resume-ai/types';
import { useEscapeToClose } from '@/src/components/ui/useEscapeToClose';
import { useDialogFocus } from '@/src/components/ui/useDialogFocus';
import { PROFILE_SECTIONS } from '@/src/components/options/shared/profileSections';
import { ImportWarnings } from './ImportWarnings';

type ReviewableChange = FieldChange & { status: 'new' | 'conflict' };
export interface ImportReviewScreenProps {
  changes: FieldChange[];
  onChangesChange?: (changes: FieldChange[]) => void;
  onSave: (finalChanges: FieldChange[]) => Promise<void>;
  onBack: () => void;
  onDismiss?: () => void;
  isSaving?: boolean;
  title?: string;
  saveLabel?: string;
  incomingLabel?: string;
  sourceLabel?: string;
  warnings?: string[];
  returnFocusRef?: RefObject<HTMLElement | null>;
}

export default function ImportReviewScreen({
  changes: initialChanges,
  onChangesChange,
  onSave,
  onBack,
  onDismiss = onBack,
  isSaving = false,
  title = 'Review Import',
  saveLabel = 'Import Selected',
  incomingLabel = 'Imported',
  sourceLabel,
  warnings,
  returnFocusRef,
}: ImportReviewScreenProps) {
  const [localChanges, setLocalChanges] = useState(initialChanges);
  const changes = onChangesChange ? initialChanges : localChanges;
  const update = (next: FieldChange[]) => {
    setLocalChanges(next);
    onChangesChange?.(next);
  };
  const select = (id: string, accepted: boolean) =>
    update(changes.map((change) => (change.id === id ? { ...change, accepted } : change)));
  const selectAll = (accepted: boolean) =>
    update(
      changes.map((change) => (change.status === 'unchanged' ? change : { ...change, accepted })),
    );
  const reviewable = changes.filter(
    (change) => change.status !== 'unchanged',
  ) as ReviewableChange[];
  const selectedCount = reviewable.filter((change) => change.accepted).length;
  const grouped = new Map<string, ReviewableChange[]>();
  for (const change of reviewable) {
    const section = change.section === 'Professional' ? 'Work History' : change.section;
    grouped.set(section, [...(grouped.get(section) ?? []), change]);
  }
  // Include unknown future sections too, so a selectable update can never be hidden.
  const sections = [
    ...new Set([
      ...PROFILE_SECTIONS.map((section) => section.label),
      'Learned Mappings',
      'Application History',
      ...grouped.keys(),
    ]),
  ];
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useDialogFocus(returnFocusRef);
  const dismiss = isSaving ? undefined : onDismiss;
  useEscapeToClose(dismiss);
  const secondaryCls =
    'px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 active:scale-95 transition-colors';
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={dismiss}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl dark:shadow-black/60 w-full max-w-2xl mx-4 flex flex-col max-h-[90vh] outline-none"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 id={titleId} className="text-base font-semibold text-gray-900 dark:text-gray-100">
                {title}
              </h3>
              <p id={descriptionId} className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Choose which details to import. Missing values stay unchanged.
              </p>
              {sourceLabel && (
                <p
                  className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400"
                  title={sourceLabel}
                >
                  {sourceLabel}
                </p>
              )}
            </div>
            <button
              type="button"
              aria-label="Close import review"
              onClick={dismiss}
              disabled={isSaving}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl disabled:opacity-50"
            >
              ×
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
            <span className="text-gray-500 dark:text-gray-400" aria-live="polite">
              {selectedCount} of {reviewable.length} selected
            </span>
            <button
              type="button"
              onClick={() => selectAll(true)}
              disabled={isSaving}
              className="text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
            >
              Select All
            </button>
            <button
              type="button"
              onClick={() => selectAll(false)}
              disabled={isSaving}
              className="text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
            >
              Clear Selection
            </button>
          </div>
          <ImportWarnings warnings={warnings} />
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-6">
          {sections.map((section) => {
            const fields = grouped.get(section);
            if (!fields?.length) return null;
            return (
              <section key={section}>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  {section}
                </h4>
                <div className="space-y-3">
                  {fields.map((change) => (
                    <FieldRow
                      key={change.id}
                      change={change}
                      isSaving={isSaving}
                      incomingLabel={incomingLabel}
                      onSelect={select}
                    />
                  ))}
                </div>
              </section>
            );
          })}
          {!reviewable.length && (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">
              No changes to review.
            </p>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 shrink-0">
          <button type="button" onClick={onBack} disabled={isSaving} className={secondaryCls}>
            Back
          </button>
          <button
            type="button"
            onClick={() => void onSave(changes)}
            disabled={isSaving || selectedCount === 0}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 active:scale-95 transition-colors"
          >
            {isSaving ? 'Saving…' : `${saveLabel} (${selectedCount})`}
          </button>
        </div>
      </div>
    </div>
  );
}

function Value({ value, muted = false }: { value: string; muted?: boolean }) {
  return (
    <p
      className={`whitespace-pre-wrap break-words text-sm ${muted ? 'text-gray-600 dark:text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}
    >
      {value || '—'}
    </p>
  );
}
function FieldRow({
  change,
  isSaving,
  incomingLabel,
  onSelect,
}: {
  change: ReviewableChange;
  isSaving: boolean;
  incomingLabel: string;
  onSelect: (id: string, accepted: boolean) => void;
}) {
  const labelId = useId();
  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg"
    >
      <div className="flex items-center gap-2 mb-2">
        <p id={labelId} className="text-sm font-medium text-gray-800 dark:text-gray-200">
          {change.label}
        </p>
        <span
          className={`text-xs ${change.status === 'new' ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'}`}
        >
          {change.status === 'new' ? 'New' : 'Changed'}
        </span>
      </div>
      {change.note && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{change.note}</p>
      )}
      {change.status === 'new' ? (
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            aria-label={`Import ${change.label}: ${change.displaySuggested}`}
            disabled={isSaving}
            checked={change.accepted}
            onChange={() => onSelect(change.id, !change.accepted)}
            className="mt-1 shrink-0 accent-blue-600"
          />
          <Value value={change.displaySuggested} />
        </label>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              name={change.id}
              disabled={isSaving}
              checked={!change.accepted}
              onChange={() => onSelect(change.id, false)}
              className="mt-1 shrink-0 accent-blue-600"
            />
            <div className="min-w-0">
              <span className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                Keep Current
              </span>
              <Value value={change.displayCurrent} muted />
            </div>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              name={change.id}
              disabled={isSaving}
              checked={change.accepted}
              onChange={() => onSelect(change.id, true)}
              className="mt-1 shrink-0 accent-blue-600"
            />
            <div className="min-w-0">
              <span className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                {incomingLabel}
              </span>
              <Value value={change.displaySuggested} />
            </div>
          </label>
        </div>
      )}
    </div>
  );
}
