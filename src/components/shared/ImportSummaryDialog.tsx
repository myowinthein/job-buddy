import { reviewCounts } from '@/src/resume-ai/entrySelection';
import { useId, type ReactNode, type RefObject } from 'react';
import type { FieldChange } from '@/src/resume-ai/types';
import { useEscapeToClose } from '@/src/components/ui/useEscapeToClose';
import { useDialogFocus } from '@/src/components/ui/useDialogFocus';
import { ImportWarnings } from './ImportWarnings';

export interface ImportSummaryDialogProps {
  changes: FieldChange[];
  title?: string;
  description?: string;
  warnings?: string[];
  warningsSummary?: string;
  returnFocusRef?: RefObject<HTMLElement | null>;
  acceptLabel?: string;
  forceDecision?: boolean;
  importControls?: ReactNode;
  canProceed?: boolean;
  rejectLabel?: string;
  replacement?: boolean;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onReview: () => void;
  onDismiss: () => void;
  isProcessing?: boolean;
}

export default function ImportSummaryDialog({
  changes,
  title = 'Import Profile',
  description = 'Import all details or review the changes first.',
  warnings,
  warningsSummary,
  returnFocusRef,
  acceptLabel = 'Import All',
  forceDecision = false,
  importControls,
  canProceed = true,
  rejectLabel = 'Keep Current',
  replacement = false,
  onAcceptAll,
  onRejectAll,
  onReview,
  onDismiss,
  isProcessing = false,
}: ImportSummaryDialogProps) {
  const counts = changes.reduce(
    (sum, change) => {
      const count = reviewCounts(change);
      return {
        new: sum.new + count.new,
        changed: sum.changed + count.changed,
        unchanged: sum.unchanged + count.unchanged,
        incoming: sum.incoming + count.incoming,
        cleared: sum.cleared + count.cleared,
      };
    },
    { new: 0, changed: 0, unchanged: 0, incoming: 0, cleared: 0 },
  );
  const hasChanges = counts.new + counts.changed > 0 || forceDecision;
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useDialogFocus(returnFocusRef);
  const dismiss = isProcessing ? undefined : onDismiss;
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
        className={`bg-white dark:bg-gray-800 rounded-xl shadow-2xl dark:shadow-black/60 w-full ${importControls ? 'max-w-lg' : hasChanges ? 'max-w-md' : 'max-w-sm'} mx-4 p-6 max-h-[90vh] overflow-y-auto outline-none`}
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id={titleId} className="text-base font-semibold text-gray-900 dark:text-gray-100">
          {hasChanges ? title : 'No Changes Found'}
        </h3>
        <p id={descriptionId} className="mt-2 text-pretty text-sm text-gray-500 dark:text-gray-400">
          {hasChanges ? description : 'Your saved details will stay as they are.'}
        </p>
        {hasChanges && replacement && (
          <p className="mt-4 text-xs text-gray-600 dark:text-gray-400">
            {counts.incoming} incoming details · {counts.cleared} cleared
          </p>
        )}
        {hasChanges && !replacement && (
          <p className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium">
            {counts.new > 0 && (
              <span className="text-green-700 dark:text-green-400">{counts.new} New</span>
            )}
            {counts.changed > 0 && (
              <span className="text-amber-700 dark:text-amber-400">{counts.changed} Changed</span>
            )}
            {counts.unchanged > 0 && (
              <span className="text-gray-500 dark:text-gray-400">{counts.unchanged} Unchanged</span>
            )}
          </p>
        )}
        <ImportWarnings warnings={warnings} summary={warningsSummary} />
        {importControls}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          {hasChanges ? (
            <>
              <button
                type="button"
                onClick={onRejectAll}
                disabled={isProcessing}
                className={secondaryCls}
              >
                {rejectLabel}
              </button>
              <button
                type="button"
                onClick={onReview}
                disabled={isProcessing || !canProceed}
                className={secondaryCls}
              >
                Review Changes
              </button>
              <button
                type="button"
                onClick={onAcceptAll}
                disabled={isProcessing || !canProceed}
                className={`px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50 active:scale-95 transition-colors ${replacement ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                {isProcessing ? 'Saving…' : acceptLabel}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onDismiss}
              disabled={isProcessing}
              className={secondaryCls}
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
