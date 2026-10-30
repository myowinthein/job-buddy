import { useState } from 'react';
import type { EntryComparison as Comparison } from '@/src/resume-ai/entryComparison';

function ComparedValue({
  value,
  other,
  changed,
}: {
  value: string;
  other: string;
  changed: boolean;
}) {
  const lines = new Set(other.split('\n'));
  const content = value.split('\n').map((line, index) => (
    <span key={index} className="block min-h-[1em]">
      {changed && line && !lines.has(line) ? (
        <mark className="bg-blue-50 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100">
          {line}
        </mark>
      ) : (
        line
      )}
    </span>
  ));
  const firstChange =
    value.split('\n').find((line) => line.trim() && !lines.has(line)) ?? value.split('\n')[0];
  const preview = firstChange.length > 180 ? `${firstChange.slice(0, 180)}…` : firstChange;
  return value.length > 300 ? (
    <div>
      <p className="mb-1 line-clamp-3 text-sm">
        {changed ? (
          <mark className="bg-blue-50 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100">
            {preview}
          </mark>
        ) : (
          preview
        )}
      </p>
      <details>
        <summary className="cursor-pointer text-xs text-blue-600 dark:text-blue-400">
          Show full text
        </summary>
        <div className="mt-2 whitespace-pre-wrap break-words text-sm">{content}</div>
      </details>
    </div>
  ) : (
    <div className="whitespace-pre-wrap break-words text-sm">{content}</div>
  );
}

export function EntryComparison({
  entries,
  incomingLabel,
}: {
  entries: Comparison[];
  incomingLabel: string;
}) {
  const [index, setIndex] = useState(() =>
    Math.max(
      0,
      entries.findIndex((entry) => entry.fields.some((field) => field.changed)),
    ),
  );
  const [showUnchanged, setShowUnchanged] = useState(false);
  const safeIndex = Math.min(index, entries.length - 1);
  const entry = entries[safeIndex];
  if (!entry) return null;
  const hasUnchangedDetails =
    entry.status !== 'new' && entry.fields.some((field) => !field.changed);
  const fields = entry.fields.filter(
    (field) => showUnchanged || entry.status === 'new' || field.changed,
  );
  return (
    <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <p aria-live="polite" className="text-sm font-medium text-gray-800 dark:text-gray-200">
          {entry.label}{' '}
          <span className="text-xs font-normal text-gray-500">
            ({safeIndex + 1} of {entries.length})
          </span>
        </p>
        <div className="flex gap-3 text-xs text-blue-600 dark:text-blue-400">
          <button
            type="button"
            disabled={safeIndex === 0}
            onClick={() => setIndex(safeIndex - 1)}
            className="hover:underline disabled:opacity-40"
          >
            Previous entry
          </button>
          <button
            type="button"
            disabled={safeIndex === entries.length - 1}
            onClick={() => setIndex(safeIndex + 1)}
            className="hover:underline disabled:opacity-40"
          >
            Next entry
          </button>
        </div>
      </div>
      {entry.status === 'new' && (
        <p className="mb-3 text-xs text-green-700 dark:text-green-400">New entry</p>
      )}
      {entry.status === 'removed' && (
        <p className="mb-3 text-xs text-amber-700 dark:text-amber-400">
          Not included in the imported list
        </p>
      )}
      {hasUnchangedDetails && (
        <label className="flex items-center gap-2 mb-3 text-xs text-gray-500 dark:text-gray-400">
          <input
            type="checkbox"
            checked={showUnchanged}
            onChange={(event) => setShowUnchanged(event.target.checked)}
            className="accent-blue-600"
          />
          Show unchanged details
        </label>
      )}
      {fields.map((field) => (
        <div key={field.label} className="py-3 text-gray-700 dark:text-gray-300">
          <p className="mb-2 text-xs font-medium">{field.label}</p>
          {field.changed ? (
            <div className="space-y-3 pl-3 border-l-2 border-blue-200 dark:border-blue-800">
              {entry.status !== 'removed' && (
                <div>
                  <p className="mb-1 text-xs text-gray-500">{incomingLabel}</p>
                  <ComparedValue value={field.suggested} other={field.current} changed />
                </div>
              )}
              {entry.status !== 'new' && (
                <div>
                  <p className="mb-1 text-xs text-gray-500">Current</p>
                  <ComparedValue value={field.current} other={field.suggested} changed />
                </div>
              )}
            </div>
          ) : (
            <ComparedValue value={field.current} other={field.current} changed={false} />
          )}
        </div>
      ))}
      {!fields.length && (
        <p className="text-xs text-gray-500 dark:text-gray-400">No changes in this entry.</p>
      )}
    </div>
  );
}
