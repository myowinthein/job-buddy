import { useState } from 'react';
import type { FieldChange } from '@/src/resume-ai/types';

const SECTION_ORDER = [
  'Personal',
  'Address',
  'Salary',
  'Work Authorization',
  'Work History',
  'Education',
  'Languages',
  'Links',
  'Documents',
];

export interface ImportReviewScreenProps {
  changes:    FieldChange[];
  onSave:     (finalChanges: FieldChange[]) => Promise<void>;
  onBack:     () => void;
  isSaving?:  boolean;
  title?:     string;
  saveLabel?: string;
}

export default function ImportReviewScreen({
  changes: initialChanges,
  onSave,
  onBack,
  isSaving  = false,
  title     = 'Review Changes',
  saveLabel = 'Save Selected',
}: ImportReviewScreenProps) {
  const [changes, setChanges] = useState<FieldChange[]>(initialChanges);

  const newFields = changes.filter((c) => c.status === 'new');
  const conflicts = changes.filter((c) => c.status === 'conflict');

  const toggleAccepted = (id: string) =>
    setChanges((prev) => prev.map((c) => (c.id === id ? { ...c, accepted: !c.accepted } : c)));

  const acceptAllNew = () =>
    setChanges((prev) => prev.map((c) => (c.status === 'new' ? { ...c, accepted: true } : c)));

  const setConflictChoice = (id: string, useSuggested: boolean) =>
    setChanges((prev) => prev.map((c) => (c.id === id ? { ...c, accepted: useSuggested } : c)));

  const handleSave = () => { void onSave(changes); };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onBack}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl dark:shadow-black/60 w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
            {(newFields.length > 0 || conflicts.length > 0) && (
              <p className="text-xs mt-0.5">
                {newFields.length > 0 && (
                  <span className="text-green-600 dark:text-green-400">New {newFields.length}</span>
                )}
                {newFields.length > 0 && conflicts.length > 0 && ' · '}
                {conflicts.length > 0 && (
                  <span className="text-yellow-600 dark:text-yellow-500">Conflicts {conflicts.length}</span>
                )}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {newFields.length > 0 && (
              <button
                type="button"
                onClick={acceptAllNew}
                className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-95 transition-colors"
              >
                Accept All New Fields
              </button>
            )}
            <button
              type="button"
              onClick={onBack}
              className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none active:scale-95 transition-colors"
            >
              ×
            </button>
          </div>
        </div>

        {/* Scrollable body — fields grouped by section */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-6">
            {SECTION_ORDER.map((section) => {
              const fields = changes.filter((c) => c.section === section);
              if (fields.length === 0) return null;
              if (!fields.some((f) => f.status !== 'unchanged')) return null;
              return (
                <div key={section}>
                  <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                    {section}
                  </h4>
                  <div className="space-y-1.5">
                    {fields.filter((c) => c.status !== 'unchanged').map((change) => (
                      <FieldRow
                        key={change.id}
                        change={change}
                        onToggle={toggleAccepted}
                        onConflictChoice={setConflictChoice}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {newFields.length === 0 && conflicts.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">
              No changes to review.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 shrink-0">
          <button
            type="button"
            onClick={onBack}
            disabled={isSaving}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 active:scale-95 transition-colors"
          >
            Back
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 active:scale-95 transition-colors"
          >
            {isSaving ? 'Saving…' : saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Helper sub-components ─────────────────────────────────────────────────────

function MultilineValue({ value, className }: { value: string; className?: string }) {
  const lines = value.split('\n').filter(Boolean);
  if (lines.length <= 1) return <p className={className}>{value || '—'}</p>;
  return (
    <ul className={`list-none space-y-0.5 ${className ?? ''}`}>
      {lines.map((line, i) => (
        <li key={i} className="flex gap-1">
          <span className="shrink-0 text-gray-400">·</span>
          <span>{line}</span>
        </li>
      ))}
    </ul>
  );
}

function FieldRow({
  change,
  onToggle,
  onConflictChoice,
}: {
  change:           FieldChange;
  onToggle:         (id: string) => void;
  onConflictChoice: (id: string, useSuggested: boolean) => void;
}) {
  if (change.status === 'new') {
    return (
      <label className="flex items-start gap-3 p-2.5 bg-green-50 dark:bg-green-900/15 border border-green-200 dark:border-green-800 rounded-lg cursor-pointer">
        <input
          type="checkbox"
          checked={change.accepted}
          onChange={() => onToggle(change.id)}
          className="mt-0.5 shrink-0 accent-green-600"
        />
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5">{change.label}</p>
          <MultilineValue value={change.displaySuggested} className="text-sm text-gray-900 dark:text-gray-100" />
        </div>
      </label>
    );
  }

  if (change.status === 'conflict') {
    return (
      <div className="p-2.5 bg-yellow-50 dark:bg-yellow-900/15 border border-yellow-200 dark:border-yellow-800 rounded-lg">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">{change.label}</p>
        <label className="flex items-start gap-2 mb-2 cursor-pointer">
          <input
            type="radio"
            name={change.id}
            checked={!change.accepted}
            onChange={() => onConflictChoice(change.id, false)}
            className="mt-0.5 shrink-0"
          />
          <div className="min-w-0">
            <span className="text-xs text-gray-400 dark:text-gray-500">Keep current</span>
            <MultilineValue value={change.displayCurrent} className="text-sm text-gray-700 dark:text-gray-300" />
          </div>
        </label>
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="radio"
            name={change.id}
            checked={change.accepted}
            onChange={() => onConflictChoice(change.id, true)}
            className="mt-0.5 shrink-0"
          />
          <div className="min-w-0">
            <span className="text-xs text-gray-400 dark:text-gray-500">Use suggested</span>
            <MultilineValue value={change.displaySuggested} className="text-sm font-medium text-gray-900 dark:text-gray-100" />
          </div>
        </label>
      </div>
    );
  }

  return (
    <div className="flex items-center px-2.5 py-1">
      <span className="text-xs text-gray-400 dark:text-gray-500">{change.label}</span>
    </div>
  );
}
