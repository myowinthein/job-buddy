import { feedback } from '@/src/ui/feedback';
import { reviewCounts } from '@/src/resume-ai/entrySelection';
import { useState, useEffect, useRef, useCallback } from 'react';
import type { Profile } from '@/src/types/profile';
import { getGeminiApiKey, getGeminiModel } from '@/src/utils/storage';
import { extractFromResume } from '@/src/resume-ai/gemini';
import { extractLinks } from '@/src/resume-ai/extractLinks';
import { acceptAllChanges } from '@/src/utils/backupImport';
import { resumeChanges, resumeFileChange, applyReviewedResumeChanges, ResumeReviewChangedError, RESUME_FILE_CHANGE_ID, type ProfileUpdate } from '@/src/resume-ai/resumeImport';
import type { FieldChange, ImportProgressStep, ImportErrorCode, ResumeModelAttempt } from '@/src/resume-ai/types';
import { toGeminiModel } from '@/src/resume-ai/types';
import { documentFileSizeError } from '@/src/utils/documentLimits';
import { ReportedSaveError } from './shared/saveSection';
import { useToast } from '@/src/components/ui/useToast';
import { useEscapeToClose } from '@/src/components/ui/useEscapeToClose';
import ImportSummaryDialog from '@/src/components/shared/ImportSummaryDialog';
import ImportReviewScreen from '@/src/components/shared/ImportReviewScreen';
import { ImportModeChoice } from '@/src/components/shared/ImportModeChoice';
import { resumeMimeType as getMimeType, validateResumeFile } from '@/src/resume-ai/validateResumeFile';
import type { ResumeDocumentType } from '@/src/resume-ai/types';
import { ResumeDocumentNotice } from './ResumeDocumentNotice';
import {
  assertImportCurrent,
  initialImportMode,
  possibleDifferentPerson,
  replacementChanges,
  ImportProfileChangedError,
  type ImportMode,
} from '@/src/utils/importPolicy';
import { ResumeDoneDialog, ResumeProgressDialog, ResumeUploadDialog } from './ResumeImportDialogs';

// ── Constants ─────────────────────────────────────────────────────────────────

const LONG_WAIT_MS   = 8_000;
const FILE_CHANGE_ID = RESUME_FILE_CHANGE_ID;


// ── Helpers ───────────────────────────────────────────────────────────────────

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

type Screen = 'dialog' | 'progress' | 'uncertain' | 'summary' | 'review' | 'done';

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

  // Keep setup current when credentials change while this dialog is open.
  useEffect(() => {
    let active = true;
    let sequence = 0;
    const loadSettings = () => {
      const request = ++sequence;
      return Promise.all([getGeminiApiKey(), getGeminiModel()])
        .then(([key, mdl]) => {
          if (!active || request !== sequence) return;
          setApiKey(key ?? '');
          setModel(mdl);
        })
        .catch(() => {
          if (!active || request !== sequence) return;
          setApiKey('');
          setErrorMsg(feedback.resumeSetupLoadFailed);
        });
    };
    void loadSettings();
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (
        area === 'local' &&
        ['geminiApiKey', 'geminiModel', 'geminiSettingsMeta'].some((key) => key in changes)
      )
        void loadSettings();
    };
    const events = typeof chrome !== 'undefined' ? chrome.storage?.onChanged : undefined;
    events?.addListener(changed);
    return () => {
      active = false;
      events?.removeListener(changed);
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

  const chooseAnotherFile = useCallback(() => {
    abortControllerRef.current?.abort();
    setSelectedFile(null);
    setFileDataUri(null);
    setExtractedLinks([]);
    setIncomingProfile({});
    setChanges([]);
    setErrorMsg(null);
    setErrorCode(null);
    setScreen('dialog');
  }, []);

  // Progress cancels its request; the upload, document notice, and completion
  // screens close the import. Shared summary/review dialogs handle dismissal.
  useEscapeToClose(screen === 'dialog' || screen === 'done' || screen === 'uncertain' ? closeSection : undefined);

  const goToSettings = useCallback(() => {
    abortControllerRef.current?.abort();
    if (longWaitTimerRef.current) clearTimeout(longWaitTimerRef.current);
    onGoToApiKey();
  }, [onGoToApiKey]);

  const handleFileSelect = (file: File) => {
    try { getMimeType(file); } catch {
      setSelectedFile(null);
      setErrorMsg(feedback.resumeUnsupportedFile);
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

  const prepareReview = (incoming: Partial<Profile>) => {
    const mode = initialImportMode(reviewBase, incoming);
    setIncomingProfile(incoming);
    setImportMode(mode);
    setChanges(buildChanges(reviewBase, incoming, mode));
    setScreen('summary');
  };

  const runExtractCore = async (dataUri: string, file: File, controller: AbortController, links: string[]) => {
    if (!isCurrent(controller)) return;
    setProgressStep('sending');
    const assessment: { type: ResumeDocumentType } = { type: 'resume' };
    const extracted = await extractFromResume(
      apiKey!, toGeminiModel(model), dataUri.split(',')[1] ?? '', getMimeType(file),
      profile, controller.signal, links,
      next => { if (isCurrent(controller)) { setAttempt(next); setShowLongWait(false); } },
      type => { assessment.type = type; },
    );
    if (!isCurrent(controller)) return;
    setProgressStep('processing');
    const incoming = {
      ...extracted,
      documents: { cv: { file: { name: file.name, size: file.size, base64: dataUri } } },
    };
    if (assessment.type === 'uncertain') {
      setIncomingProfile(incoming);
      setScreen('uncertain');
    } else prepareReview(incoming);
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
      if (!(reuseFile && fileDataUri)) {
        const bytes = Uint8Array.from(atob(dataUri.split(',')[1] ?? ''), char => char.charCodeAt(0));
        await validateResumeFile(selectedFile, bytes, controller.signal);
        if (!isCurrent(controller)) return;
      }
      const links = reuseFile && fileDataUri ? extractedLinks : await extractLinks(selectedFile);
      if (!isCurrent(controller)) return;
      setFileDataUri(dataUri);
      setExtractedLinks(links);
      await runExtractCore(dataUri, selectedFile, controller, links);
    } catch (error) {
      if (!isCurrent(controller) || (error as { name?: string })?.name === 'AbortError') return;
      const failure = error as { message?: string; code?: ImportErrorCode };
      setErrorCode(failure.code ?? null);
      setErrorMsg(failure.message ?? feedback.resumeUnexpectedFailure);
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
      } else if (!(error instanceof ReportedSaveError)) showToast('error', feedback.resumeSaveFailed);
    } finally {
      setSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  const needsAnotherFile = errorCode === 'invalid_file' || errorCode === 'not_resume';

  return (
    <div>
      {/* ════════════════════════════════════════════════════════════════════════
          Upload dialog
          ════════════════════════════════════════════════════════════════════ */}
      {screen === 'dialog' && (
        <ResumeUploadDialog
          apiKey={apiKey}
          model={model}
          errorMsg={errorMsg}
          isDragging={isDragging}
          selectedFile={selectedFile}
          fileInputRef={fileInputRef}
          setIsDragging={setIsDragging}
          handleDrop={handleDrop}
          handleFileSelect={handleFileSelect}
          handleExtract={handleExtract}
          goToSettings={goToSettings}
          closeSection={closeSection}
        />
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          Progress
          ════════════════════════════════════════════════════════════════════ */}
      {screen === 'progress' && (
        <ResumeProgressDialog
          progressStep={progressStep}
          attempt={attempt}
          showLongWait={showLongWait}
          errorMsg={errorMsg}
          errorCode={errorCode}
          needsAnotherFile={needsAnotherFile}
          chooseAnotherFile={chooseAnotherFile}
          handleRetry={handleRetry}
          handleCancel={handleCancel}
          closeSection={closeSection}
        />
      )}

      {screen === 'uncertain' && (
        <ResumeDocumentNotice onContinue={() => prepareReview(incomingProfile)} onChooseFile={chooseAnotherFile} onDismiss={closeSection} />
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          Summary — counts of new / conflict / unchanged fields
          ════════════════════════════════════════════════════════════════════ */}
      {screen === 'summary' && (
        <ImportSummaryDialog
          changes={changes}
          title="Import Resume"
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
        <ResumeDoneDialog summary={summary} closeSection={closeSection} />
      )}
    </div>
  );
}
