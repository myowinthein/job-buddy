import { reviewCounts } from '@/src/resume-ai/entrySelection';
import { useState, useEffect, useRef, useCallback } from 'react';
import type { Profile } from '@/src/types/profile';
import { getGeminiApiKey, getGeminiModel } from '@/src/utils/storage';
import { extractFromResume } from '@/src/resume-ai/gemini';
import { extractLinks } from '@/src/resume-ai/extractLinks';
import { acceptAllChanges } from '@/src/utils/backupImport';
import { resumeChanges, resumeFileChange, applyReviewedResumeChanges, ResumeReviewChangedError, RESUME_FILE_CHANGE_ID, type ProfileUpdate } from '@/src/resume-ai/resumeImport';
import type { FieldChange, ImportProgressStep, ImportErrorCode, ResumeModelAttempt } from '@/src/resume-ai/types';
import { MODEL_DISPLAY_NAMES, toGeminiModel } from '@/src/resume-ai/types';
import { DOCUMENT_FILE_SIZE_LABEL, documentFileSizeError } from '@/src/utils/documentLimits';
import { ReportedSaveError } from './shared/saveSection';
import { useToast } from '@/src/components/ui/useToast';
import { useEscapeToClose } from '@/src/components/ui/useEscapeToClose';
import ImportSummaryDialog from '@/src/components/shared/ImportSummaryDialog';
import ImportReviewScreen from '@/src/components/shared/ImportReviewScreen';
import { ImportModeChoice } from '@/src/components/shared/ImportModeChoice';
import {
  assertImportCurrent,
  initialImportMode,
  possibleDifferentPerson,
  replacementChanges,
  ImportProfileChangedError,
  type ImportMode,
} from '@/src/utils/importPolicy';

// ── Constants ─────────────────────────────────────────────────────────────────

const LONG_WAIT_MS   = 8_000;
const FILE_CHANGE_ID = RESUME_FILE_CHANGE_ID;

const PROGRESS_STEPS: { id: ImportProgressStep; label: string }[] = [
  { id: 'reading',    label: 'Reading resume…' },
  { id: 'sending',    label: 'Analyzing resume…' },
  { id: 'processing', label: 'Preparing review…' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getMimeType(file: File): string {
  if (file.type === 'application/pdf' || file.name.endsWith('.pdf'))
    return 'application/pdf';
  if (
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    file.name.endsWith('.docx')
  )
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  throw new Error('Unsupported file type');
}

function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  profile:      Partial<Profile>;
  onSave:       (updates: ProfileUpdate) => Promise<void>;
  onReplace:    (base: Partial<Profile>, changes: FieldChange[]) => Promise<void>;
  onGoToApiKey: () => void;
  onClose:      () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

type Screen = 'dialog' | 'progress' | 'summary' | 'review' | 'done';

export function ResumeImportSection({ profile, onSave, onReplace, onGoToApiKey, onClose }: Props) {
  const { showToast }  = useToast();
  const [screen,       setScreen]       = useState<Screen>('dialog');
  const [apiKey,       setApiKey]       = useState<string | null>(null);
  const [model,        setModel]        = useState<string | null>(null);
  const [attempt, setAttempt] = useState<ResumeModelAttempt | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileDataUri,  setFileDataUri]  = useState<string | null>(null);
  const [isDragging,   setIsDragging]   = useState(false);
  const [progressStep, setProgressStep] = useState<ImportProgressStep | null>(null);
  const [showLongWait, setShowLongWait] = useState(false);
  const [errorMsg,     setErrorMsg]     = useState<string | null>(null);
  const [errorCode,    setErrorCode]    = useState<ImportErrorCode | null>(null);
  const [changes,      setChanges]      = useState<FieldChange[]>([]);
  const [saving,       setSaving]       = useState(false);
  const [summary,      setSummary]      = useState<{ updated: number; conflicts: number; skipped: number; replaced?: boolean } | null>(null);
  const [extractedLinks, setExtractedLinks] = useState<string[]>([]);
  const [reviewBase, setReviewBase] = useState(profile);
  const [incomingProfile, setIncomingProfile] = useState<Partial<Profile>>({});
  const [importMode, setImportMode] = useState<ImportMode | null>('update');
  const buildChanges = (base: Partial<Profile>, incoming: Partial<Profile>, mode: ImportMode | null) => {
    if (mode === 'replace') return replacementChanges(base, incoming);
    const extracted = { ...incoming };
    delete extracted.documents;
    return [
      resumeFileChange(incoming.documents!.cv.file!, base.documents?.cv?.file),
      ...resumeChanges(base, extracted),
    ];
  };
  const chooseMode = (mode: ImportMode) => {
    setImportMode(mode);
    setChanges(buildChanges(reviewBase, incomingProfile, mode));
  };

  const fileInputRef       = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const longWaitTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load API key on mount
  useEffect(() => {
    let active = true;
    Promise.all([getGeminiApiKey(), getGeminiModel()])
      .then(([key, mdl]) => {
        if (!active) return;
        setApiKey(key ?? '');
        setModel(mdl);
      })
      .catch(() => {
        if (!active) return;
        setApiKey('');
        setErrorMsg('Could not load AI settings. Open Settings and try again.');
      });
    return () => {
      active = false;
      abortControllerRef.current?.abort();
      if (longWaitTimerRef.current) clearTimeout(longWaitTimerRef.current);
    };
  }, []);

  // Escape key cancels in-progress analysis
  const handleCancel = useCallback(() => {
    abortControllerRef.current?.abort();
    if (longWaitTimerRef.current) clearTimeout(longWaitTimerRef.current);
    abortControllerRef.current = null;
    setShowLongWait(false);
    setProgressStep(null);
    setErrorMsg(null);
    setErrorCode(null);
    setScreen('dialog');
  }, []);

  useEffect(() => {
    if (screen !== 'progress') return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleCancel(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [screen, handleCancel]);

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const closeSection = useCallback(() => {
    abortControllerRef.current?.abort();
    if (longWaitTimerRef.current) clearTimeout(longWaitTimerRef.current);
    onClose();
  }, [onClose]);

  // 'progress' has its own Esc handling above (cancels the in-flight
  // request); shared summary/review dialogs own their dismissal handlers.
  // 'dialog' and 'done' reuse the same closeSection
  // their backdrop click / Done button already use.
  useEscapeToClose(screen === 'dialog' || screen === 'done' ? closeSection : undefined);

  const goToSettings = useCallback(() => {
    abortControllerRef.current?.abort();
    if (longWaitTimerRef.current) clearTimeout(longWaitTimerRef.current);
    onGoToApiKey();
  }, [onGoToApiKey]);

  const handleFileSelect = (file: File) => {
    try { getMimeType(file); } catch {
      setSelectedFile(null);
      setErrorMsg('Only PDF and DOCX files are supported.');
      return;
    }
    const sizeError = documentFileSizeError(file.size);
    if (sizeError) {
      setSelectedFile(null);
      setErrorMsg(sizeError);
      return;
    }
    setErrorMsg(null);
    setSelectedFile(file);
    setFileDataUri(null);
    setExtractedLinks([]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  // ── Extract core (shared between handleExtract and handleRetry) ──────────────

  const isCurrent = (controller: AbortController) =>
    abortControllerRef.current === controller && !controller.signal.aborted;

  const runExtractCore = async (dataUri: string, file: File, controller: AbortController, links: string[]) => {
    if (!isCurrent(controller)) return;
    setProgressStep('sending');
    const extracted = await extractFromResume(
      apiKey!, toGeminiModel(model), dataUri.split(',')[1] ?? '', getMimeType(file),
      profile, controller.signal, links,
      next => { if (isCurrent(controller)) { setAttempt(next); setShowLongWait(false); } },
    );
    if (!isCurrent(controller)) return;
    setProgressStep('processing');
    const incoming = {
      ...extracted,
      documents: { cv: { file: { name: file.name, size: file.size, base64: dataUri } } },
    };
    const mode = initialImportMode(reviewBase, incoming);
    setIncomingProfile(incoming);
    setImportMode(mode);
    setChanges(buildChanges(reviewBase, incoming, mode));
    setScreen('summary');
  };

  const analyze = async (reuseFile: boolean) => {
    if (!selectedFile || !apiKey || !model) return;
    abortControllerRef.current?.abort();
    if (longWaitTimerRef.current) clearTimeout(longWaitTimerRef.current);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setErrorMsg(null);
    setErrorCode(null);
    setAttempt(null);
    setShowLongWait(false);
    setScreen('progress');
    longWaitTimerRef.current = setTimeout(() => { if (isCurrent(controller)) setShowLongWait(true); }, LONG_WAIT_MS);
    try {
      setProgressStep('reading');
      const dataUri = reuseFile && fileDataUri ? fileDataUri : await fileToDataUri(selectedFile);
      if (!isCurrent(controller)) return;
      setFileDataUri(dataUri);
      const links = reuseFile && fileDataUri ? extractedLinks : await extractLinks(selectedFile);
      if (!isCurrent(controller)) return;
      setExtractedLinks(links);
      await runExtractCore(dataUri, selectedFile, controller, links);
    } catch (error) {
      if (!isCurrent(controller) || (error as { name?: string })?.name === 'AbortError') return;
      const failure = error as { message?: string; code?: ImportErrorCode };
      setErrorCode(failure.code ?? null);
      setErrorMsg(failure.message ?? 'Something went wrong. Try again.');
    } finally {
      if (isCurrent(controller)) {
        if (longWaitTimerRef.current) clearTimeout(longWaitTimerRef.current);
        setShowLongWait(false);
        setProgressStep(null);
      }
    }
  };
  const handleExtract = () => analyze(false);
  const handleRetry = () => analyze(true);

  // ── Save ──────────────────────────────────────────────────────────────────────

  const performSave = async (finalChanges: FieldChange[]): Promise<void> => {
    if (!importMode) return;
    const fileChange   = finalChanges.find((c) => c.id === FILE_CHANGE_ID || c.id === 'documents.cv.file');
    const counted = importMode === 'replace' ? finalChanges.filter(c => c.hasIncomingValue !== false) : finalChanges;
    const newAccepted      = counted.filter(c => c.status === 'new').reduce((sum, c) => sum + reviewCounts(c).selected, 0);
    const conflictAccepted = counted.filter(c => c.status === 'conflict').reduce((sum, c) => sum + reviewCounts(c).selected, 0);
    const skipped          = counted.reduce((sum, c) => { const count = reviewCounts(c); return sum + count.total - count.selected; }, 0);
    if (fileChange?.accepted && selectedFile) {
      const sizeError = documentFileSizeError(selectedFile.size);
      if (sizeError) { showToast('error', sizeError); return; }
    }

    setSaving(true);
    try {
      if (importMode === 'replace') await onReplace(reviewBase, finalChanges);
      else await onSave(latest => {
        assertImportCurrent(reviewBase, latest, finalChanges);
        return applyReviewedResumeChanges(latest, finalChanges);
      });
      setSummary({ updated: newAccepted, conflicts: conflictAccepted, skipped, replaced: importMode === 'replace' });
      setScreen('done');
    } catch (error) {
      if (error instanceof ImportProfileChangedError) {
        const mode = initialImportMode(error.current, incomingProfile);
        setReviewBase(error.current);
        setImportMode(mode);
        setChanges(buildChanges(error.current, incomingProfile, mode));
        setScreen('summary');
        showToast('warning', error.message);
      } else if (error instanceof ResumeReviewChangedError) {
        setChanges(error.changes);
        setScreen('review');
        showToast('warning', error.message);
      } else if (!(error instanceof ReportedSaveError)) showToast('error', 'Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  const currentStepIdx = PROGRESS_STEPS.findIndex((s) => s.id === progressStep);

  return (
    <div>
      {/* ════════════════════════════════════════════════════════════════════════
          Upload dialog
          ════════════════════════════════════════════════════════════════════ */}
      {screen === 'dialog' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={closeSection}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl dark:shadow-black/60 w-full max-w-lg mx-4"
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
                    {errorMsg || (apiKey ? 'Choose an AI model in Settings to import your resume.' : 'Add a Gemini API key in Settings to import your resume.')}
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
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl py-10 px-4 transition-colors cursor-pointer ${
                      isDragging
                        ? 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                    }`}
                    onClick={() => fileInputRef.current?.click()}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
                  >
                    <span className="text-3xl">📄</span>
                    {selectedFile ? (
                      <>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedFile.name}</p>
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
                        <p className="text-xs text-gray-500 dark:text-gray-400">PDF or DOCX · max {DOCUMENT_FILE_SIZE_LABEL}</p>
                      </>
                    )}
                  </div>

                  {errorMsg && (
                    <p className="mt-2 text-sm text-red-500 dark:text-red-400">{errorMsg}</p>
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
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
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
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 active:scale-95 transition-colors"
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
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          Progress
          ════════════════════════════════════════════════════════════════════ */}
      {screen === 'progress' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl dark:shadow-black/60 w-full max-w-sm mx-4 px-6 py-8">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-6 text-center">
              Analyzing Resume
            </h3>

            <div className="space-y-4" role="status" aria-live="polite" aria-atomic="true">
              {PROGRESS_STEPS.map((step, i) => {
                const isDone     = !errorMsg && currentStepIdx > i;
                const isActive   = !errorMsg && step.id === progressStep;
                return (
                  <div key={step.id} className="flex items-center gap-3">
                    <div className="w-5 h-5 shrink-0 flex items-center justify-center">
                      {isDone ? (
                        <span className="text-green-500 dark:text-green-400 text-sm">✓</span>
                      ) : isActive ? (
                        <span aria-hidden="true" className="inline-block w-4 h-4 rounded-full border-2 border-blue-500 border-r-transparent animate-spin motion-reduce:animate-none" />
                      ) : (
                        <span className="inline-block w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600" />
                      )}
                    </div>
                    <span className={`text-sm ${
                      isActive  ? 'font-medium text-gray-900 dark:text-gray-100'
                      : isDone  ? 'text-gray-500 dark:text-gray-400'
                                : 'text-gray-400 dark:text-gray-600'
                    }`}>
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {attempt?.reason && !errorMsg && (
              <p role="status" className="mt-4 text-xs text-center text-gray-500 dark:text-gray-400">
                {attempt.reason === 'timeout' ? 'The previous model took too long. '
                  : attempt.reason === 'rate_limit' ? 'The previous model reached its usage limit. '
                  : attempt.reason === 'unavailable' ? 'The previous model is unavailable. ' : ''}
                Trying {MODEL_DISPLAY_NAMES[attempt.model]}.
              </p>
            )}
            {/* Long wait message */}
            {showLongWait && !errorMsg && (
              <div className="mt-5 text-xs text-amber-500 dark:text-amber-400 text-center">
                <p>Still analyzing. You can cancel at any time.</p>
              </div>
            )}

            {/* Error state */}
            {errorMsg && (
              <div className="mt-6">
                {errorCode === 'rate_limit' ? (
                  <p className="text-sm text-red-500 dark:text-red-400 mb-4">
                    The AI models reached their usage limits. Try again later or check{' '}
                    <a
                      href="https://aistudio.google.com/rate-limit"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-red-700 dark:hover:text-red-300"
                    >
                      Google AI Studio
                    </a>
                    .
                  </p>
                ) : (
                  <p className="text-sm text-red-500 dark:text-red-400 mb-4">{errorMsg}</p>
                )}
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={closeSection}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-95 transition-colors"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={handleRetry}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 active:scale-95 transition-colors"
                  >
                    Try again
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
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          Summary — counts of new / conflict / unchanged fields
          ════════════════════════════════════════════════════════════════════ */}
      {screen === 'summary' && (
        <ImportSummaryDialog
          changes={changes}
          title="Review Resume"
          importControls={possibleDifferentPerson(reviewBase, incomingProfile) && <ImportModeChoice current={reviewBase} incoming={incomingProfile} mode={importMode} onChange={chooseMode} busy={saving} />}
          replacement={importMode === 'replace'}
          canProceed={importMode !== null && (importMode !== 'replace' || changes.some(c => c.hasIncomingValue === true))}
          forceDecision={importMode !== 'update'}
          acceptLabel={importMode === 'replace' ? 'Replace Profile' : 'Import All'}
          onAcceptAll={() => void performSave(acceptAllChanges(changes))}
          onRejectAll={closeSection}
          onDismiss={closeSection}
          onReview={() => setScreen('review')}
          isProcessing={saving}
        />
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          Review — per-field accept / reject
          ════════════════════════════════════════════════════════════════════ */}
      {screen === 'review' && (
        <ImportReviewScreen
          changes={changes}
          onChangesChange={setChanges}
          onDismiss={closeSection}
          incomingLabel="From Resume"
          onSave={performSave}
          onBack={() => setScreen('summary')}
          isSaving={saving}
          title="Review Resume"
          replacement={importMode === 'replace'}
          saveLabel={importMode === 'replace' ? 'Replace Profile' : 'Import Selected'}
        />
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          Done — summary
          ════════════════════════════════════════════════════════════════════ */}
      {screen === 'done' && summary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl dark:shadow-black/60 w-full max-w-sm mx-4 px-6 py-8">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">
              Import Complete
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              {summary.replaced
                ? `Profile replaced with ${summary.updated + summary.conflicts} selected details.`
                : `Imported ${summary.updated + summary.conflicts} change${summary.updated + summary.conflicts !== 1 ? 's' : ''}${summary.skipped > 0 ? ` and kept ${summary.skipped}` : ''}.`}
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
      )}
    </div>
  );
}
