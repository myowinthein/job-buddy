import type { FieldChange } from '@/src/resume-ai/types';
import { entryIsSelectable, entryIsSelected } from '@/src/resume-ai/entrySelection';

export function LanguageComparison({
  change,
  onSelect,
  isSaving,
  incomingLabel,
}: {
  change: FieldChange;
  onSelect: (index: number, accepted: boolean) => void;
  isSaving: boolean;
  incomingLabel: string;
}) {
  const replacement = change.entryMode === 'replace';
  return (
    <div>
      {change.entries!.map((entry, index) => {
        const field = entry.fields[0];
        const selectable = entryIsSelectable(entry, replacement);
        const selected = entryIsSelected(change, entry);
        const changed = entry.status === 'changed';
        const removed = entry.status === 'removed';
        return (
          <div key={index} className="py-3">
            <div className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
              {selectable && (!changed || replacement) && (
                <input
                  type="checkbox"
                  aria-label={`${removed ? 'Remove' : 'Import'} ${entry.label}`}
                  checked={selected}
                  disabled={isSaving}
                  onChange={() => onSelect(index, !selected)}
                  className="accent-blue-600"
                />
              )}
              <span className="flex-1 font-medium">
                {removed && !replacement ? 'Remove ' : ''}
                {entry.label}
              </span>
              {!changed && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {removed ? field.current : field.suggested}
                </span>
              )}
            </div>
            {changed && replacement ? (
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                <span>
                  {incomingLabel}: {field.suggested}
                </span>
                <span>Current: {field.current}</span>
              </div>
            ) : (
              changed && (
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-xs text-gray-600 dark:text-gray-400">
                  {[true, false].map((accepted) => (
                    <label key={String(accepted)} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`language-${index}`}
                        checked={selected === accepted}
                        disabled={isSaving}
                        onChange={() => onSelect(index, accepted)}
                        className="accent-blue-600"
                      />
                      {accepted
                        ? `${incomingLabel}: ${field.suggested}`
                        : `Keep Current: ${field.current}`}
                    </label>
                  ))}
                </div>
              )
            )}
            {removed && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {replacement ? 'Will clear' : 'Not included in the imported list.'}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
