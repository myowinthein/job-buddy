import {
  hasEntryChoices,
  reviewCounts,
  selectChange,
  selectEntry,
} from '@/src/resume-ai/entrySelection';
import { LanguageComparison } from './LanguageComparison';
import { useId, useState, type RefObject } from 'react';
import type { FieldChange } from '@/src/resume-ai/types';
import { useEscapeToClose } from '@/src/components/ui/useEscapeToClose';
import { useDialogFocus } from '@/src/components/ui/useDialogFocus';
import { PROFILE_SECTIONS } from '@/src/components/options/shared/profileSections';
import { EntryComparison } from './EntryComparison';
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
  warnings?: string[];
  warningsSummary?: string;
  replacement?: boolean;
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
  warnings,
  warningsSummary,
  replacement = false,
  returnFocusRef,
}: ImportReviewScreenProps) {
  const [localChanges, setLocalChanges] = useState(initialChanges);
  const changes = onChangesChange ? initialChanges : localChanges;
  const update = (next: FieldChange[]) => {
    setLocalChanges(next);
    onChangesChange?.(next);
  };
  const select = (id: string, accepted: boolean) =>
    update(changes.map((change) => (change.id === id ? selectChange(change, accepted) : change)));
  const selectItem = (id: string, index: number, accepted: boolean) =>
    update(
      changes.map((change) => (change.id === id ? selectEntry(change, index, accepted) : change)),
    );
  const selectAll = (accepted: boolean) =>
    update(
      changes.map((change) =>
        change.status === 'unchanged' ? change : selectChange(change, accepted),
      ),
    );
  const reviewable = changes.filter(
    (change) => change.status !== 'unchanged',
  ) as ReviewableChange[];
  const selectable = reviewable.filter(
    (change) => !replacement || change.hasIncomingValue !== false,
  );
  const selectedCount = selectable.reduce((sum, change) => sum + reviewCounts(change).selected, 0);
  const selectableCount = selectable.reduce((sum, change) => sum + reviewCounts(change).total, 0);
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
  ].filter((section) => grouped.has(section));
  const [expandedSection, setExpandedSection] = useState<string | null>(sections[0] ?? null);
  const sectionId = useId();
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
                {replacement
                  ? 'Choose incoming details. Current details not imported will be cleared.'
                  : 'Choose which details to add or replace.'}
              </p>
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
              {selectedCount} of {selectableCount} selected
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
          <ImportWarnings warnings={warnings} summary={warningsSummary} />
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-3">
          {sections.map((section, index) => {
            const fields = grouped.get(section)!;
            const expanded = expandedSection === section;
            const total = fields.reduce((sum, c) => sum + reviewCounts(c).total, 0);
            const selected = fields.reduce((sum, c) => sum + reviewCounts(c).selected, 0);
            const cleared = fields.reduce((sum, c) => sum + reviewCounts(c).cleared, 0);
            const headingId = `${sectionId}-heading-${index}`;
            const panelId = `${sectionId}-panel-${index}`;
            return (
              <section
                key={section}
                className="border border-gray-200 dark:border-gray-700 rounded-lg"
              >
                <h4>
                  <button
                    type="button"
                    id={headingId}
                    aria-label={section}
                    aria-describedby={`${headingId}-count`}
                    aria-expanded={expanded}
                    aria-controls={expanded ? panelId : undefined}
                    disabled={isSaving}
                    onClick={() => setExpandedSection(expanded ? null : section)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/40 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-50"
                  >
                    <span className="min-w-0 flex-1 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                      <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                        {section}
                      </span>
                      <span
                        id={`${headingId}-count`}
                        className="text-xs text-gray-500 dark:text-gray-400"
                      >
                        {replacement ? (
                          <>
                            {selected} selected · {cleared} cleared
                          </>
                        ) : (
                          <>
                            {total} {total === 1 ? 'update' : 'updates'} · {selected} selected
                          </>
                        )}
                      </span>
                    </span>
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 16 16"
                      fill="none"
                      className={`w-4 h-4 shrink-0 text-gray-400 ${expanded ? 'rotate-180' : ''}`}
                    >
                      <path
                        d="m4 6 4 4 4-4"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </h4>
                {expanded && (
                  <div
                    id={panelId}
                    role="region"
                    aria-labelledby={headingId}
                    className="px-4 pb-2 divide-y divide-gray-200 dark:divide-gray-700"
                  >
                    {fields.map((change) => (
                      <FieldRow
                        key={change.id}
                        change={change}
                        isSaving={isSaving}
                        incomingLabel={incomingLabel}
                        replacement={replacement}
                        onSelect={select}
                        onEntrySelect={selectItem}
                      />
                    ))}
                  </div>
                )}
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
            className={`px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50 active:scale-95 transition-colors ${replacement ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
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
  replacement,
  onSelect,
  onEntrySelect,
}: {
  change: ReviewableChange;
  isSaving: boolean;
  incomingLabel: string;
  replacement: boolean;
  onSelect: (id: string, accepted: boolean) => void;
  onEntrySelect: (id: string, index: number, accepted: boolean) => void;
}) {
  const labelId = useId();
  const listSummary = (value: unknown) => {
    const count = Array.isArray(value) ? value.length : 0;
    return `${count} ${count === 1 ? 'entry' : 'entries'}`;
  };
  if (hasEntryChoices(change))
    return (
      <div role="group" aria-label={change.label} className="py-1">
        {change.id === 'languages' ? (
          <LanguageComparison
            change={change}
            incomingLabel={incomingLabel}
            isSaving={isSaving}
            onSelect={(index, accepted) => onEntrySelect(change.id, index, accepted)}
          />
        ) : (
          <EntryComparison
            entries={change.entries!}
            incomingLabel={incomingLabel}
            selection={{
              change,
              isSaving,
              replacement,
              onSelect: (index, accepted) => onEntrySelect(change.id, index, accepted),
            }}
          />
        )}
      </div>
    );
  return (
    <div role="group" aria-labelledby={labelId} className="py-4">
      <div className="flex items-center gap-2 mb-2">
        <p id={labelId} className="text-sm font-medium text-gray-800 dark:text-gray-200">
          {change.label}
        </p>
        <span
          className={`text-xs ${replacement ? (change.hasIncomingValue === false ? 'text-gray-500 dark:text-gray-400' : 'text-blue-600 dark:text-blue-400') : change.status === 'new' ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'}`}
        >
          {replacement
            ? change.hasIncomingValue === false
              ? 'Will clear'
              : 'Incoming'
            : change.status === 'new'
              ? 'New'
              : 'Changed'}
        </span>
      </div>
      {change.note && !(replacement && change.hasIncomingValue === false) && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{change.note}</p>
      )}
      {replacement && change.hasIncomingValue === false ? (
        <Value
          value={change.entries ? listSummary(change.currentValue) : change.displayCurrent}
          muted
        />
      ) : change.status === 'new' || replacement ? (
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            aria-label={`Import ${change.label}: ${change.entries ? listSummary(change.suggestedValue) : change.displaySuggested}`}
            disabled={isSaving}
            checked={change.accepted}
            onChange={() => onSelect(change.id, !change.accepted)}
            className="mt-1 shrink-0 accent-blue-600"
          />
          <Value
            value={change.entries ? listSummary(change.suggestedValue) : change.displaySuggested}
          />
        </label>
      ) : (
        <div className="space-y-2">
          <label className="flex items-start gap-2 cursor-pointer py-2">
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
              <Value
                value={
                  change.entries ? listSummary(change.suggestedValue) : change.displaySuggested
                }
              />
            </div>
          </label>
          <label className="flex items-start gap-2 cursor-pointer py-2">
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
              <Value
                value={change.entries ? listSummary(change.currentValue) : change.displayCurrent}
                muted
              />
            </div>
          </label>
        </div>
      )}
      {change.entries && <EntryComparison entries={change.entries} incomingLabel={incomingLabel} />}
    </div>
  );
}
