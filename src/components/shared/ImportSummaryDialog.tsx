import type { FieldChange } from '@/src/resume-ai/types';

export interface ImportSummaryDialogProps {
  changes:      FieldChange[];
  title?:       string;
  onAcceptAll:  () => void;
  onRejectAll:  () => void;
  onReview:     () => void;
  isProcessing?: boolean;
}

export default function ImportSummaryDialog({
  changes,
  title        = 'Review Changes',
  onAcceptAll,
  onRejectAll,
  onReview,
  isProcessing = false,
}: ImportSummaryDialogProps) {
  const newCount       = changes.filter((c) => c.status === 'new').length;
  const conflictCount  = changes.filter((c) => c.status === 'conflict').length;
  const unchangedCount = changes.filter((c) => c.status === 'unchanged').length;
  const hasActionable  = newCount > 0 || conflictCount > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl dark:shadow-black/60 w-full max-w-sm mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
        </div>

        <div className="px-6 py-5 space-y-2">
          {newCount > 0 && (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                {newCount} new
              </span>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {newCount === 1 ? 'field to add' : 'fields to add'}
              </span>
            </div>
          )}
          {conflictCount > 0 && (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-500">
                {conflictCount} {conflictCount === 1 ? 'conflict' : 'conflicts'}
              </span>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {conflictCount === 1 ? 'different value' : 'different values'}
              </span>
            </div>
          )}
          {unchangedCount > 0 && (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                {unchangedCount} match
              </span>
              <span className="text-sm text-gray-600 dark:text-gray-400">no changes</span>
            </div>
          )}
          {!hasActionable && unchangedCount === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400">No changes found.</p>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex-wrap">
          <button
            type="button"
            onClick={onRejectAll}
            disabled={isProcessing}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 active:scale-95 transition-colors"
          >
            Keep Current
          </button>
          {hasActionable && (
            <>
              <button
                type="button"
                onClick={onReview}
                disabled={isProcessing}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 active:scale-95 transition-colors"
              >
                Review →
              </button>
              <button
                type="button"
                onClick={onAcceptAll}
                disabled={isProcessing}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 active:scale-95 transition-colors"
              >
                {isProcessing ? 'Saving…' : 'Accept All'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
