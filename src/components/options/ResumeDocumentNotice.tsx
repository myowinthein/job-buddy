import { useId } from 'react';
import { useDialogFocus } from '@/src/components/ui/useDialogFocus';

export function ResumeDocumentNotice({
  onContinue,
  onChooseFile,
  onDismiss,
}: {
  onContinue: () => void;
  onChooseFile: () => void;
  onDismiss: () => void;
}) {
  const title = useId();
  const description = useId();
  const dialogRef = useDialogFocus();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onDismiss}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-labelledby={title}
        aria-describedby={description}
        onClick={(event) => event.stopPropagation()}
        className="mx-4 max-h-[90dvh] overflow-y-auto w-full max-w-md rounded-xl bg-white p-6 shadow-2xl outline-none dark:bg-gray-800"
      >
        <h3 id={title} className="text-base font-semibold text-gray-900 dark:text-gray-100">
          Check Document
        </h3>
        <p id={description} className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          We couldn’t confirm this is a resume. You can review the extracted details or choose
          another file.
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onChooseFile}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Choose Another File
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Continue to Review
          </button>
        </div>
      </div>
    </div>
  );
}
