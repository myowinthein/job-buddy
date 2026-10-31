import { useId } from 'react';
import type { EntryComparison } from '@/src/resume-ai/entryComparison';
import type { FieldChange } from '@/src/resume-ai/types';
import { entryIsSelectable, entryIsSelected } from '@/src/resume-ai/entrySelection';

function LinkValue({ entry, incoming }: { entry: EntryComparison; incoming: boolean }) {
  const source = incoming ? 'suggested' : 'current';
  const label = entry.fields.find((field) => field.label === 'Label')?.[source] ?? entry.label;
  const url = entry.fields.find((field) => field.label === 'URL')?.[source];
  return (
    <span className="block min-w-0">
      <span className="block break-words text-sm font-medium text-gray-800 dark:text-gray-200">
        {label}
      </span>
      <span className="mt-0.5 block break-all text-xs text-gray-500 dark:text-gray-400">{url}</span>
    </span>
  );
}

export function CustomLinkComparison({
  change,
  incomingLabel,
  isSaving,
  onSelect,
}: {
  change: FieldChange;
  incomingLabel: string;
  isSaving: boolean;
  onSelect: (index: number, accepted: boolean) => void;
}) {
  const groupId = useId();
  const replacement = change.entryMode === 'replace';
  return (
    <div className="py-3">
      <p className="mb-3 text-sm font-medium text-gray-800 dark:text-gray-200">{change.label}</p>
      <div className="space-y-4">
        {change.entries!.map((entry, index) => {
          const selected = entryIsSelected(change, entry);
          const selectable = entryIsSelectable(entry, replacement);
          const changed = entry.status === 'changed';
          const removed = entry.status === 'removed';
          const choice = changed && !replacement;
          return (
            <div key={index}>
              {choice ? (
                <div className="space-y-2" role="group" aria-label={entry.label}>
                  {[true, false].map((accepted) => (
                    <label key={String(accepted)} className="flex cursor-pointer items-start gap-2">
                      <input
                        type="radio"
                        name={`${groupId}-${index}`}
                        checked={selected === accepted}
                        aria-label={`${accepted ? incomingLabel : 'Keep Current'} for ${entry.label}`}
                        disabled={isSaving}
                        onChange={() => onSelect(index, accepted)}
                        className="mt-1 shrink-0 accent-blue-600"
                      />
                      <span className="min-w-0">
                        <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">
                          {accepted ? incomingLabel : 'Keep Current'}
                        </span>
                        <LinkValue entry={entry} incoming={accepted} />
                      </span>
                    </label>
                  ))}
                </div>
              ) : selectable ? (
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={isSaving}
                    aria-label={`${removed ? 'Remove' : 'Import'} ${entry.label}`}
                    onChange={() => onSelect(index, !selected)}
                    className="mt-1 shrink-0 accent-blue-600"
                  />
                  <span className="min-w-0">
                    {changed && replacement && (
                      <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">
                        {incomingLabel}
                      </span>
                    )}
                    <LinkValue entry={entry} incoming={!removed} />
                  </span>
                </label>
              ) : (
                <LinkValue entry={entry} incoming={!removed} />
              )}
              {changed && replacement && (
                <div className="mt-2 pl-5">
                  <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">Current</p>
                  <LinkValue entry={entry} incoming={false} />
                </div>
              )}
              {removed && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {replacement
                    ? 'Will clear'
                    : 'Not included in the imported list. Select to remove the saved link.'}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
