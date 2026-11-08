import type { RefObject } from 'react';
import { MODEL_DISPLAY_NAMES } from '@/src/resume-ai/types';
import type {
  ImportErrorCode,
  ImportProgressStep,
  ResumeModelAttempt,
} from '@/src/resume-ai/types';
import { resumeUsageLimitNotice } from '@/src/ui/feedback';
import { DOCUMENT_FILE_SIZE_LABEL } from '@/src/utils/documentLimits';
import { primaryButtonCls } from '@/src/components/ui/buttonCls';

const PROGRESS_STEPS: { id: ImportProgressStep; label: string }[] = [
  { id: 'reading', label: 'Reading resume…' },
  { id: 'sending', label: 'Analyzing resume…' },
  { id: 'processing', label: 'Preparing review…' },
];

export function ResumeUploadDialog({
  apiKey,
  model,
  errorMsg,
  isDragging,
  selectedFile,
  fileInputRef,
  setIsDragging,
  handleDrop,
  handleFileSelect,
  handleExtract,
  goToSettings,
  closeSection,
}: {
  apiKey: string | null;
  model: string | null;
  errorMsg: string | null;
  isDragging: boolean;
  selectedFile: File | null;
  fileInputRef: RefObject<HTMLInputElement | null>;
  setIsDragging: (dragging: boolean) => void;
  handleDrop: (event: React.DragEvent) => void;
  handleFileSelect: (file: File) => void;
  handleExtract: () => void;
  goToSettings: () => void;
  closeSection: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={closeSection}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl dark:shadow-black/60 w-full max-w-lg mx-4 max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Import Resume
            </h3>
            <p className="text-xs text-pretty text-gray-500 dark:text-gray-400 mt-0.5">
              Use Gemini to extract your details, then review what to import.
            </p>
          </div>
          <button
            type="button"
            onClick={closeSection}
            aria-label="Close"
            className="ml-4 shrink-0 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none active:scale-95 transition-colors"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {/* No API key state ('' = confirmed no key after storage load) */}
          {apiKey !== null && (!apiKey || !model) && (
            <div className="py-6 text-center">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                {errorMsg ||
                  (apiKey
                    ? 'Choose an AI model to import your resume.'
                    : 'Add a Gemini API key to import your resume.')}
              </p>
              <button
                type="button"
                onClick={goToSettings}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline active:scale-95 font-medium"
              >
                Go to Settings →
              </button>
            </div>
          )}

          {/* API key present — show upload area */}
          {apiKey && model && (
            <>
              <div
                role="button"
                tabIndex={0}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl py-10 px-4 transition-colors cursor-pointer ${
                  isDragging
                    ? 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                }`}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
              >
                <span className="text-3xl">📄</span>
                {selectedFile ? (
                  <>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {(selectedFile.size / 1024).toFixed(0)} KB · Click to change
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Drop your resume here or{' '}
                      <span className="text-blue-600 dark:text-blue-400">browse</span>
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      PDF or DOCX · max {DOCUMENT_FILE_SIZE_LABEL}
                    </p>
                  </>
                )}
              </div>

              {errorMsg && (
                <p className="mt-2 text-sm text-red-700 dark:text-red-400">{errorMsg}</p>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) handleFileSelect(f);
                }}
              />
            </>
          )}

          {/* Still loading key — brief placeholder */}
          {apiKey === null && <div className="py-8" />}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          {apiKey && model ? (
            <>
              <button
                type="button"
                onClick={closeSection}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-95 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!selectedFile}
                onClick={handleExtract}
                className={primaryButtonCls}
              >
                Analyze Resume
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={closeSection}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-95 transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function ResumeProgressDialog({
  progressStep,
  attempt,
  showLongWait,
  errorMsg,
  errorCode,
  needsAnotherFile,
  chooseAnotherFile,
  handleRetry,
  handleCancel,
  closeSection,
}: {
  progressStep: ImportProgressStep | null;
  attempt: ResumeModelAttempt | null;
  showLongWait: boolean;
  errorMsg: string | null;
  errorCode: ImportErrorCode | null;
  needsAnotherFile: boolean;
  chooseAnotherFile: () => void;
  handleRetry: () => void;
  handleCancel: () => void;
  closeSection: () => void;
}) {
  const currentStepIdx = PROGRESS_STEPS.findIndex((step) => step.id === progressStep);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl dark:shadow-black/60 w-full max-w-sm mx-4 px-6 py-8 max-h-[90dvh] overflow-y-auto">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-6 text-center">
          Analyzing Resume
        </h3>

        <div className="space-y-4" role="status" aria-live="polite" aria-atomic="true">
          {PROGRESS_STEPS.map((step, i) => {
            const isDone = !errorMsg && currentStepIdx > i;
            const isActive = !errorMsg && step.id === progressStep;
            return (
              <div key={step.id} className="flex items-center gap-3">
                <div className="w-5 h-5 shrink-0 flex items-center justify-center">
                  {isDone ? (
                    <span className="text-green-500 dark:text-green-400 text-sm">✓</span>
                  ) : isActive ? (
                    <span
                      aria-hidden="true"
                      className="inline-block w-4 h-4 rounded-full border-2 border-blue-500 border-r-transparent animate-spin motion-reduce:animate-none"
                    />
                  ) : (
                    <span className="inline-block w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600" />
                  )}
                </div>
                <span
                  className={`text-sm ${
                    isActive
                      ? 'font-medium text-gray-900 dark:text-gray-100'
                      : isDone
                        ? 'text-gray-500 dark:text-gray-400'
                        : 'text-gray-400 dark:text-gray-600'
                  }`}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>

        {attempt?.reason && !errorMsg && (
          <div
            role="status"
            className="mt-5 text-xs text-center text-amber-700 dark:text-amber-400"
          >
            <p>
              {attempt.reason === 'timeout'
                ? 'The previous model took too long.'
                : attempt.reason === 'rate_limit'
                  ? 'The previous model reached its usage limit.'
                  : 'The previous model is unavailable.'}
            </p>
            <p>Trying {MODEL_DISPLAY_NAMES[attempt.model]}.</p>
          </div>
        )}
        {/* Long wait message */}
        {showLongWait && !attempt?.reason && !errorMsg && (
          <div className="mt-5 text-xs text-amber-700 dark:text-amber-400 text-center">
            <p>Still analyzing. You can cancel at any time.</p>
          </div>
        )}

        {/* Error state */}
        {errorMsg && (
          <div className="mt-6">
            {errorCode === 'rate_limit' ? (
              <p className="text-sm text-red-700 dark:text-red-400 mb-4">
                {resumeUsageLimitNotice.before}
                <a
                  href={resumeUsageLimitNotice.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-red-700 dark:hover:text-red-300"
                >
                  {resumeUsageLimitNotice.linkLabel}
                </a>
                {resumeUsageLimitNotice.after}
              </p>
            ) : (
              <p className="text-sm text-red-700 dark:text-red-400 mb-4">{errorMsg}</p>
            )}
            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={closeSection}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-95 transition-colors"
              >
                Close
              </button>
              <button
                type="button"
                onClick={needsAnotherFile ? chooseAnotherFile : handleRetry}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 active:scale-95 transition-colors"
              >
                {needsAnotherFile ? 'Choose Another File' : 'Try again'}
              </button>
            </div>
          </div>
        )}

        {/* Cancel button (only while in-progress, no error) */}
        {!errorMsg && (
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-95 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function ResumeDoneDialog({
  summary,
  closeSection,
}: {
  summary: { updated: number; conflicts: number; skipped: number; replaced?: boolean };
  closeSection: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl dark:shadow-black/60 w-full max-w-sm mx-4 px-6 py-8 max-h-[90dvh] overflow-y-auto">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Import Complete
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          {summary.replaced
            ? `${summary.updated + summary.conflicts} selected detail${summary.updated + summary.conflicts !== 1 ? 's' : ''} saved.`
            : `${summary.updated + summary.conflicts} detail${summary.updated + summary.conflicts !== 1 ? 's' : ''} saved${summary.skipped > 0 ? `, ${summary.skipped} left unchanged` : ''}.`}
        </p>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={closeSection}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 active:scale-95 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
