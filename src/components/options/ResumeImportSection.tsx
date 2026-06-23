import { useState, useEffect, useRef } from 'react';
import type { Profile } from '@/src/types/profile';
import { getGeminiApiKey, getGeminiModel } from '@/src/utils/storage';
import { extractFromResume } from '@/src/resume-ai/gemini';
import { generateDiff, applyChanges } from '@/src/resume-ai/parser';
import { MODEL_DISPLAY_NAMES } from '@/src/resume-ai/types';
import type { FieldChange, ImportProgressStep } from '@/src/resume-ai/types';

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

const ACCEPTED_TYPES = new Set(['application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document']);

const PROGRESS_STEPS: { id: ImportProgressStep; label: string }[] = [
  { id: 'reading',    label: 'Reading file…' },
  { id: 'sending',    label: 'Sending to Gemini…' },
  { id: 'processing', label: 'Processing response…' },
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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => {
      const result = reader.result as string;
      // result is "data:<mime>;base64,<data>" — strip the prefix
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  profile: Partial<Profile>;
  onSave: (updates: Partial<Profile>) => Promise<void>;
  onGoToApiKey: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

type Screen = 'idle' | 'dialog' | 'progress' | 'review' | 'done';

export function ResumeImportSection({ profile, onSave, onGoToApiKey }: Props) {
  const [screen,       setScreen]       = useState<Screen>('idle');
  const [apiKey,       setApiKey]       = useState<string | null>(null);
  const [model,        setModel]        = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging,   setIsDragging]   = useState(false);
  const [progressStep, setProgressStep] = useState<ImportProgressStep | null>(null);
  const [errorMsg,     setErrorMsg]     = useState<string | null>(null);
  const [changes,      setChanges]      = useState<FieldChange[]>([]);
  const [summary,      setSummary]      = useState<{ updated: number; conflicts: number; skipped: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([getGeminiApiKey(), getGeminiModel()]).then(([key, mdl]) => {
      setApiKey(key);
      setModel(mdl);
    });
  }, []);

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const resetDialog = () => {
    setScreen('idle');
    setSelectedFile(null);
    setIsDragging(false);
    setProgressStep(null);
    setErrorMsg(null);
    setChanges([]);
  };

  const handleFileSelect = (file: File) => {
    try {
      getMimeType(file); // validates type
    } catch {
      setErrorMsg('Only PDF and DOCX files are supported.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setErrorMsg('CV file is too large to process. Maximum size is 10 MB.');
      return;
    }
    setErrorMsg(null);
    setSelectedFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleExtract = async () => {
    if (!selectedFile || !apiKey || !model) return;

    setScreen('progress');
    setErrorMsg(null);

    try {
      // Step 1: read file
      setProgressStep('reading');
      const mimeType  = getMimeType(selectedFile);
      const base64    = await fileToBase64(selectedFile);

      // Step 2: send to Gemini
      setProgressStep('sending');
      const extracted = await extractFromResume(apiKey, model, base64, mimeType, profile);

      // Step 3: compute diff
      setProgressStep('processing');
      const diff = generateDiff(profile, extracted);
      setChanges(diff);

      setScreen('review');
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? 'Something went wrong. Try again.';
      setErrorMsg(msg);
      // stay on progress screen to show error; user can close
    } finally {
      setProgressStep(null);
    }
  };

  const toggleAccepted = (id: string) => {
    setChanges((prev) =>
      prev.map((c) => (c.id === id ? { ...c, accepted: !c.accepted } : c)),
    );
  };

  const acceptAllNew = () => {
    setChanges((prev) =>
      prev.map((c) => (c.status === 'new' ? { ...c, accepted: true } : c)),
    );
  };

  const setConflictChoice = (id: string, usesSuggested: boolean) => {
    setChanges((prev) =>
      prev.map((c) => (c.id === id ? { ...c, accepted: usesSuggested } : c)),
    );
  };

  const handleSave = async () => {
    const newAccepted      = changes.filter((c) => c.status === 'new'      && c.accepted).length;
    const conflictAccepted = changes.filter((c) => c.status === 'conflict'  && c.accepted).length;
    const skipped          = changes.filter((c) => c.status !== 'unchanged' && !c.accepted).length;

    const updated = applyChanges(profile, changes);
    await onSave(updated);

    setSummary({ updated: newAccepted, conflicts: conflictAccepted, skipped });
    setScreen('done');
  };

  const newFields  = changes.filter((c) => c.status === 'new');
  const conflicts  = changes.filter((c) => c.status === 'conflict');
  const unchanged  = changes.filter((c) => c.status === 'unchanged');

  // ── Render ───────────────────────────────────────────────────────────────────

  const modelLabel = model
    ? (MODEL_DISPLAY_NAMES[model as keyof typeof MODEL_DISPLAY_NAMES] ?? model)
    : null;

  return (
    <div>
      {/* ── Section header ────────────────────────────────────────────────────── */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          ✨ Auto-fill from Resume
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Upload your resume and let Gemini extract your profile data automatically.
        </p>
      </div>

      {/* ── AI model indicator ────────────────────────────────────────────────── */}
      {apiKey && modelLabel && (
        <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
          Using {modelLabel}
        </p>
      )}

      {/* ── Import button (with disabled wrapper if no key) ───────────────────── */}
      {apiKey ? (
        <button
          type="button"
          onClick={() => { setSummary(null); setScreen('dialog'); }}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          ✨ Import Resume
        </button>
      ) : (
        <div
          className="inline-block cursor-pointer"
          title="Add a Gemini API key in Settings to use this."
          onClick={onGoToApiKey}
        >
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 text-sm font-medium rounded-lg pointer-events-none"
          >
            ✨ Import Resume
          </button>
        </div>
      )}

      {!apiKey && (
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Add a Gemini API key in{' '}
          <button
            type="button"
            onClick={onGoToApiKey}
            className="text-blue-600 dark:text-blue-400 underline"
          >
            Settings
          </button>{' '}
          to enable this feature.
        </p>
      )}

      {/* ── Post-save summary ─────────────────────────────────────────────────── */}
      {screen === 'done' && summary && (
        <div className="mt-5 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg max-w-md">
          <p className="text-sm font-medium text-green-800 dark:text-green-200">Import complete</p>
          <p className="mt-1 text-sm text-green-700 dark:text-green-300">
            {summary.updated} field{summary.updated !== 1 ? 's' : ''} updated
            {summary.conflicts > 0 ? `, ${summary.conflicts} conflict${summary.conflicts !== 1 ? 's' : ''} resolved` : ''}
            {summary.skipped  > 0 ? `, ${summary.skipped} skipped` : ''}.
          </p>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          Dialog — file selection
          ════════════════════════════════════════════════════════════════════ */}
      {screen === 'dialog' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={resetDialog}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl dark:shadow-black/60 w-full max-w-lg mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                ✨ Import Resume
              </h3>
              <button
                type="button"
                onClick={resetDialog}
                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none transition-colors"
              >
                ×
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5">
              {/* Drag & drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl py-10 px-4 transition-colors cursor-pointer ${
                  isDragging
                    ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                }`}
                onClick={() => fileInputRef.current?.click()}
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
                    <p className="text-xs text-gray-500 dark:text-gray-400">PDF or DOCX · max 10 MB</p>
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
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={resetDialog}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!selectedFile}
                onClick={handleExtract}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                Extract from Resume
              </button>
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
              ✨ Extracting resume data…
            </h3>

            <div className="space-y-4">
              {PROGRESS_STEPS.map((step, i) => {
                const currentIdx = PROGRESS_STEPS.findIndex((s) => s.id === progressStep);
                const isDone     = errorMsg ? false : currentIdx > i;
                const isActive   = !errorMsg && step.id === progressStep;

                return (
                  <div key={step.id} className="flex items-center gap-3">
                    <div className="w-5 h-5 shrink-0 flex items-center justify-center">
                      {isDone ? (
                        <span className="text-green-500 dark:text-green-400 text-sm">✓</span>
                      ) : isActive ? (
                        <span className="inline-block w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
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

            {errorMsg && (
              <div className="mt-6">
                <p className="text-sm text-red-500 dark:text-red-400 mb-4">{errorMsg}</p>
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={resetDialog}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => { setErrorMsg(null); setScreen('dialog'); }}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Try again
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          Review UI
          ════════════════════════════════════════════════════════════════════ */}
      {screen === 'review' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={resetDialog}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl dark:shadow-black/60 w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  Review Extracted Data
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {newFields.length} new · {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''} · {unchanged.length} unchanged
                </p>
              </div>
              <button
                type="button"
                onClick={resetDialog}
                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none transition-colors"
              >
                ×
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-8">

              {/* ── New fields ───────────────────────────────────────────── */}
              {newFields.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-green-700 dark:text-green-400">
                      ✨ New Fields ({newFields.length})
                    </h4>
                    <button
                      type="button"
                      onClick={acceptAllNew}
                      className="text-xs text-blue-600 dark:text-blue-400 underline hover:no-underline"
                    >
                      Accept all new fields
                    </button>
                  </div>
                  <div className="space-y-2">
                    {newFields.map((change) => (
                      <label
                        key={change.id}
                        className="flex items-start gap-3 p-3 bg-green-50 dark:bg-green-900/15 rounded-lg border border-green-200 dark:border-green-800 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={change.accepted}
                          onChange={() => toggleAccepted(change.id)}
                          className="mt-0.5 shrink-0 accent-green-600"
                        />
                        <div className="min-w-0">
                          <span className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                            {change.section} · {change.label}
                          </span>
                          <MultilineValue value={change.displaySuggested} className="mt-0.5 text-sm text-gray-900 dark:text-gray-100" />
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Conflicts ────────────────────────────────────────────── */}
              {conflicts.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-yellow-700 dark:text-yellow-400 mb-3">
                    ⚠ Conflicts ({conflicts.length})
                  </h4>
                  <div className="space-y-3">
                    {conflicts.map((change) => (
                      <div
                        key={change.id}
                        className="p-3 bg-yellow-50 dark:bg-yellow-900/15 rounded-lg border border-yellow-200 dark:border-yellow-800"
                      >
                        <p className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">
                          {change.section} · {change.label}
                        </p>
                        <label className="flex items-start gap-2 mb-2 cursor-pointer">
                          <input
                            type="radio"
                            name={change.id}
                            checked={!change.accepted}
                            onChange={() => setConflictChoice(change.id, false)}
                            className="mt-0.5 shrink-0"
                          />
                          <div className="min-w-0">
                            <span className="text-xs text-gray-500 dark:text-gray-400">Keep current</span>
                            <MultilineValue value={change.displayCurrent} className="text-sm text-gray-700 dark:text-gray-300" />
                          </div>
                        </label>
                        <label className="flex items-start gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name={change.id}
                            checked={change.accepted}
                            onChange={() => setConflictChoice(change.id, true)}
                            className="mt-0.5 shrink-0"
                          />
                          <div className="min-w-0">
                            <span className="text-xs text-gray-500 dark:text-gray-400">Use suggested</span>
                            <MultilineValue value={change.displaySuggested} className="text-sm font-medium text-gray-900 dark:text-gray-100" />
                          </div>
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Unchanged / not found ─────────────────────────────────── */}
              {unchanged.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-400 dark:text-gray-500 mb-2">
                    — Unchanged / Not Found ({unchanged.length}) —
                  </h4>
                  <div className="space-y-1">
                    {unchanged.map((change) => (
                      <div key={change.id} className="flex gap-2 text-xs text-gray-400 dark:text-gray-600 py-0.5">
                        <span className="shrink-0">{change.section} · {change.label}:</span>
                        <span className="italic">
                          {change.displaySuggested
                            ? 'same as current'
                            : 'not found in resume'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {newFields.length === 0 && conflicts.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">
                  No new data was found in the resume. Your profile is already up to date.
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 shrink-0">
              <button
                type="button"
                onClick={resetDialog}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                Save selected
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helper sub-component ──────────────────────────────────────────────────────

function MultilineValue({ value, className }: { value: string; className?: string }) {
  const lines = value.split('\n').filter(Boolean);
  if (lines.length <= 1) {
    return <p className={className}>{value || '—'}</p>;
  }
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
