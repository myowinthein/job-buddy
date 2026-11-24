import { feedback, fillModeLabels } from '@/src/ui/feedback';
import { DevBadge } from '@/src/components/ui/DevBadge';
import { VersionLink } from '@/src/components/ui/VersionLink';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Check, LoaderCircle, Sparkles } from 'lucide-react';
import { PopupNotice } from '@/src/components/popup/PopupNotice';
import type { PopupNoticeTone } from '@/src/components/popup/PopupNotice';
import { getProfile, getGeminiApiKey } from '@/src/utils/storage';
import { LOGO_ICON_SRC } from '@/src/utils/branding';
import { sessionSet } from '@/src/utils/sessionStorage';
import { calculateCompletion } from '@/src/utils/profileCompletion';
import { openFillLog } from '@/src/fill-log/client';
import { sendToAllFrames } from '@/src/autofill/frameMessaging';
import { AUTOFILL_ERROR } from '@/src/autofill/errorCodes';
import {
  mergeAutofillResults,
  type MergedAutofillResult as AutofillResult,
} from '@/src/autofill/fillResult';
import { requestAutofillRun, requestAutofillBlocked, requestAutofillUndo, type AutofillRun } from '@/src/autofill/runCoordinator';
import { FIELD_DEFS } from '@/src/resume-ai/parser';

interface CompletionState {
  percentage: number;
  isCoreComplete: boolean;
}

// 'confirming' is shown when the scan found pre-filled fields and we need
// the user to choose merge vs overwrite before proceeding.
type AutofillState = 'idle' | 'scanning' | 'loading' | 'confirming' | 'success' | 'error';

/** True or false when the saved key is readable, null when storage fails. */
const readKeyState = () =>
  getGeminiApiKey().then(
    (key) => !!key,
    () => null,
  );

function App() {
  const [completion, setCompletion] = useState<CompletionState>({
    percentage: 0,
    isCoreComplete: false,
  });
  const [hasProfileData, setHasProfileData] = useState(false);
  const [missingAutofillFields, setMissingAutofillFields] = useState(['first name', 'email']);
  const [profileLoadFailed, setProfileLoadFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [autofillState, setAutofillState] = useState<AutofillState>('idle');
  const [autofillResult, setAutofillResult] = useState<AutofillResult | null>(null);
  const resultRef = useRef<AutofillResult | null>(null);
  const setResult = useCallback((result: AutofillResult | null) => {
    resultRef.current = result;
    setAutofillResult(result);
  }, []);
  const [sourceResolved, setSourceResolved] = useState(false);
  const [fillMode, setFillMode] = useState<'merge' | 'overwrite'>('merge');
  const [keyLoading, setKeyLoading] = useState(true);
  const [keyReadFailed, setKeyReadFailed] = useState(false);
  const [hasGeminiKey, setHasGeminiKey] = useState<boolean | null>(null);
  const sourceTabId = useRef<number | null>(null);
  const activeRunId = useRef<string | undefined>(undefined);
  const actionRevision = useRef(0);
  const [logOpenFailed, setLogOpenFailed] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [undoFailed, setUndoFailed] = useState(false);
  const [otherVersionBusy, setOtherVersionBusy] = useState(false);
  const fillButtonRef = useRef<HTMLButtonElement>(null);
  const keyRevision = useRef(0);

  const applyKeyState = useCallback((state: boolean | null) => {
    setHasGeminiKey(state);
    setKeyReadFailed(state === null);
    setKeyLoading(false);
  }, []);

  const refreshKeyState = useCallback(async () => {
    const revision = ++keyRevision.current;
    const state = await readKeyState();
    if (revision === keyRevision.current) applyKeyState(state);
  }, [applyKeyState]);

  const retryAISettings = async () => {
    setKeyLoading(true);
    await refreshKeyState();
  };

  useEffect(() => {
    let active = true;
    let revision = 0;
    const refresh = () => {
      const request = ++revision;
      void getProfile({ rejectOnError: true })
        .then((p) => {
          if (!active || request !== revision) return;
          const r = calculateCompletion(p ?? {});
          setCompletion({
            percentage: r.percentage,
            isCoreComplete: r.isCoreComplete,
          });
          setHasProfileData(!!p && FIELD_DEFS.some((field) => !field.isEmpty(field.getValue(p))));
          setProfileLoadFailed(false);
          // Reuse required-profile validation without making every completion check a fill gate.
          setMissingAutofillFields(
            r.missingFields
              .filter((field) => field === 'First Name' || field === 'Email')
              .map((field) => field.toLowerCase()),
          );
        })
        .catch((err) => {
          if (!active || request !== revision) return;
          console.error('[Job Buddy] Failed to load profile:', err);
          setProfileLoadFailed(true);
        })
        .finally(() => {
          if (active && request === revision) setLoading(false);
        });
    };
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && ('profile' in changes || 'devProfileDisabled' in changes)) refresh();
    };
    chrome.storage.onChanged?.addListener(changed);
    refresh();
    return () => {
      active = false;
      chrome.storage.onChanged?.removeListener(changed);
    };
  }, []);

  useEffect(() => {
    const reads = keyRevision;
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && ['geminiApiKey', 'geminiModel', 'geminiSettingsMeta'].some(key => key in changes))
        void refreshKeyState();
    };
    chrome.storage.onChanged?.addListener(changed);
    void refreshKeyState();
    return () => {
      reads.current++;
      chrome.storage.onChanged?.removeListener(changed);
    };
  }, [refreshKeyState]);

  const sendToActiveTab = useCallback(async (message: object): Promise<unknown[]> => {
    const [tab] = await chrome.tabs
      .query({ active: true, currentWindow: true })
      .finally(() => setSourceResolved(true));
    if (!tab?.id) throw new Error('No active tab found');
    sourceTabId.current = tab.id;
    return sendToAllFrames(tab.id, message);
  }, []);

  const applySetupError = useCallback((responses: unknown[]) => {
    const errors = responses.map((r) => (r as { error?: string } | null)?.error);
    if (errors.includes(AUTOFILL_ERROR.aiSettingsUnavailable)) {
      setKeyReadFailed(true);
      setHasGeminiKey(null);
      return true;
    }
    if (errors.includes(AUTOFILL_ERROR.aiSetupRequired)) {
      setKeyReadFailed(false);
      setHasGeminiKey(false);
      return true;
    }
    return false;
  }, []);

  const applyRun = useCallback(
    (run: AutofillRun | null) => {
      if (!run) return;
      if (run.error === AUTOFILL_ERROR.otherVersionBusy) {
        setOtherVersionBusy(true);
        setAutofillState(resultRef.current ? 'success' : 'idle');
        return;
      }
      if (activeRunId.current !== run.runId) setFillMode('merge');
      activeRunId.current = run.runId;
      if (run.stage === 'scanning' || run.stage === 'filling') {
        setAutofillState(run.stage === 'scanning' ? 'scanning' : 'loading');
      } else if (run.stage === 'confirming') {
        setAutofillState('confirming');
      } else if (run.stage === 'completed') {
        const setupError = applySetupError(run.error ? [{ error: run.error }] : []);
        const merged = mergeAutofillResults(run.results ?? [], run.runId);
        if (merged) {
          setResult(setupError ? { ...merged, aiStatus: 'unavailable' } : merged);
          setAutofillState('success');
        } else setAutofillState('error');
      } else {
        const setupError = applySetupError([{ error: run.error }]);
        setAutofillState(setupError ? (resultRef.current ? 'success' : 'idle') : 'error');
      }
    },
    [applySetupError, setResult],
  );

  // Reopening a popup observes the existing run; it never starts another one.
  useEffect(() => {
    if (!sourceResolved) return;
    let active = true;
    let reading = false;
    const check = async () => {
      if (reading || sourceTabId.current === null) return;
      reading = true;
      try {
        const blocked = await requestAutofillBlocked(sourceTabId.current);
        if (active) setOtherVersionBusy(blocked);
      } catch { /* Restricted pages keep their existing connection feedback. */ }
      finally { reading = false; }
    };
    void check();
    const timer = setInterval(() => { void check(); }, 500);
    return () => { active = false; clearInterval(timer); };
  }, [sourceResolved]);

  useEffect(() => {
    if (autofillState !== 'scanning' && autofillState !== 'loading') return;
    let cancelled = false;
    const revision = actionRevision.current;
    let polling = false;
    const timer = setInterval(async () => {
      if (polling || sourceTabId.current === null) return;
      polling = true;
      try {
        const run = await requestAutofillRun('STATUS', sourceTabId.current);
        if (!cancelled && revision === actionRevision.current) applyRun(run);
      } catch {
        /* The start request still supplies its final response. */
      } finally {
        polling = false;
      }
    }, 300);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [autofillState, applyRun]);

  const openLog = async () => {
    setLogOpenFailed(false);
    try {
      if (sourceTabId.current === null) throw new Error('No source tab');
      await openFillLog(sourceTabId.current);
    } catch {
      setLogOpenFailed(true);
    }
  };

  // On mount: restore the last fill.
  useEffect(() => {
    let cancelled = false;
    const revision = actionRevision.current;
    (async () => {
      try {
        const responses = await sendToActiveTab({ action: 'GET_STATUS' });
        const merged = mergeAutofillResults(responses);
        if (!cancelled && revision === actionRevision.current && merged) {
          setResult(merged);
          setAutofillState('success');
        }
        if (sourceTabId.current !== null) {
          const run = await requestAutofillRun('STATUS', sourceTabId.current);
          if (!cancelled && revision === actionRevision.current && run && run.stage !== 'completed')
            applyRun(run);
        }
      } catch {
        // Content script not loaded on this page — stay in idle state.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sendToActiveTab, applyRun, setResult]);

  const openOptions = () => chrome.runtime.openOptionsPage();

  // Open Settings → AI Features and focus the Gemini API key input.
  // Same end-state as ResumeImportSection's "Go to Settings →" link, but
  // crosses the popup→options-page context boundary via chrome.storage.session.
  const goToSettingsKey = async () => {
    await sessionSet({ 'jb:focusOnLoad': 'gemini-api-key' });
    await chrome.runtime.openOptionsPage();
  };

  const handleAutofill = async () => {
    if (otherVersionBusy) return;
    setUndoFailed(false);
    const revision = ++actionRevision.current;
    setLogOpenFailed(false);
    setAutofillState('scanning');
    try {
      if (sourceTabId.current === null) throw new Error('No source tab');
      // Hand off before awaiting settings, scanning, or any other popup work.
      const run = await requestAutofillRun('START', sourceTabId.current);
      if (!run) throw new Error('Could not start autofill');
      if (revision === actionRevision.current) applyRun(run);
    } catch {
      if (revision === actionRevision.current) setAutofillState('error');
    }
  };

  const handleConfirmFill = async () => {
    if (otherVersionBusy) return;
    const revision = ++actionRevision.current;
    setAutofillState('loading');
    try {
      if (sourceTabId.current === null || !activeRunId.current) throw new Error('No pending run');
      const run = await requestAutofillRun('CONFIRM', sourceTabId.current, {
        runId: activeRunId.current,
        mode: fillMode,
      });
      if (!run) throw new Error('The pending run changed');
      if (revision === actionRevision.current) applyRun(run);
    } catch {
      if (revision === actionRevision.current) setAutofillState('error');
    }
  };

  const handleCancelFill = () => {
    actionRevision.current++;
    if (sourceTabId.current !== null)
      void requestAutofillRun('CANCEL', sourceTabId.current, { runId: activeRunId.current }).catch(
        () => {},
      );
    setLogOpenFailed(false);
    setAutofillState('idle');
    setResult(null);
  };

  const handleUndo = async () => {
    if (undoing || otherVersionBusy) return;
    actionRevision.current++;
    setLogOpenFailed(false);
    setUndoFailed(false);
    setUndoing(true);
    try {
      if (sourceTabId.current === null || !(await requestAutofillUndo(sourceTabId.current)))
        throw new Error('Undo incomplete');
      setAutofillState('idle');
      setResult(null);
    } catch {
      const blocked = sourceTabId.current !== null &&
        await requestAutofillBlocked(sourceTabId.current).catch(() => false);
      setOtherVersionBusy(blocked);
      setUndoFailed(!blocked);
      // Retain the result and Undo action for widgets that could not restore.
      try {
        const statuses = await sendToActiveTab({ action: 'GET_STATUS' });
        const remaining = mergeAutofillResults(statuses);
        if (remaining) setResult(remaining);
      } catch {
        /* Keep the previous result if a frame is unavailable. */
      }
    } finally {
      setUndoing(false);
    }
  };

  const { percentage, isCoreComplete } = completion;
  const filling = autofillState === 'scanning' || autofillState === 'loading';
  const busy = filling || undoing;
  const result = autofillState === 'success' ? autofillResult : null;
  const { filled, unfilled } = result ? resultCounts(result) : { filled: 0, unfilled: 0 };
  const aiUnavailable = !!result && result.totalScanned > 0 && result.aiStatus === 'unavailable';
  const profileSetup = !loading && !profileLoadFailed && missingAutofillFields.length > 0;
  const aiSetup = !loading && !profileLoadFailed && !profileSetup && !keyLoading && !hasGeminiKey;
  const waitingForKey = !loading && !profileLoadFailed && !profileSetup && keyLoading;
  const confirming = autofillState === 'confirming' && !profileSetup && !aiSetup && !keyReadFailed;
  const primaryDisabled = loading || waitingForKey || busy || !sourceResolved ||
    (otherVersionBusy && !profileLoadFailed && !profileSetup && !keyReadFailed && !aiSetup);

  // Setup actions occupy the same place as Fill Form. Restore focus only when
  // the action becomes available, leaving the confirmation radios in control.
  useEffect(() => {
    if (!primaryDisabled && !confirming) fillButtonRef.current?.focus({ preventScroll: true });
  }, [
    primaryDisabled,
    confirming,
    autofillState,
    profileLoadFailed,
    profileSetup,
    aiSetup,
    keyReadFailed,
  ]);

  let message: string | null = null;
  let tone: PopupNoticeTone = 'neutral';
  if (undoFailed) {
    tone = 'error';
    message = feedback.quickFillUndoFailed;
  } else if (loading) {
    tone = 'working';
    message = 'Loading profile…';
  } else if (profileLoadFailed) {
    tone = 'error';
    message = 'Open Profile to retry loading your saved details.';
  } else if (profileSetup) {
    tone = 'info';
    message = hasProfileData
      ? `Add your ${missingAutofillFields.join(' and ')} to enable autofill.`
      : 'Add your profile details to start using autofill.';
  } else if (waitingForKey) {
    tone = 'working';
    message = 'Loading AI settings…';
  } else if (keyReadFailed) {
    tone = 'error';
    message = 'Your saved AI settings could not be loaded.';
  } else if (aiSetup) {
    tone = 'info';
    message = feedback.autofillKeyRequired;
  } else if (autofillState === 'error') {
    tone = 'error';
    message = feedback.autofillFailed;
  } else if (logOpenFailed && result) {
    tone = 'error';
    message = feedback.fillDetailsOpenFailed;
  } else if (result)
    tone =
      aiUnavailable || result.needReview > 0 || unfilled > 0
        ? 'review'
        : filled > 0
          ? 'success'
          : 'neutral';

  const primaryKind = profileLoadFailed
    ? 'profileFailed'
    : profileSetup
      ? 'profileSetup'
      : keyReadFailed
        ? 'retryAI'
        : aiSetup
          ? 'setupAI'
          : 'fill';
  const primaryLabel = PRIMARY_LABELS[primaryKind];
  const primaryText =
    autofillState === 'scanning' ? feedback.autofillScanning : filling ? 'Filling…' : primaryLabel;
  const primaryAction = {
    profileFailed: openOptions,
    profileSetup: openOptions,
    retryAI: retryAISettings,
    setupAI: goToSettingsKey,
    fill: confirming ? handleConfirmFill : handleAutofill,
  }[primaryKind];
  const primaryIsAI = primaryKind !== 'profileFailed' && primaryKind !== 'profileSetup';
  const showFeedback = !confirming && (!!message || !!result);
  const aiWarning = aiUnavailable ? 'AI was unavailable, but basic autofill still ran.' : null;
  const noticeMessage = message ?? aiWarning;

  return (
    <div className="flex max-h-[var(--popup-max-height,600px)] w-[380px] flex-col overflow-y-auto bg-white font-sans text-gray-900 dark:bg-gray-900 dark:text-gray-100">
      <header className="flex shrink-0 flex-wrap items-center gap-2.5 px-5 pb-3 pt-5">
        <img src={LOGO_ICON_SRC} alt="Job Buddy" className="h-8 w-8 shrink-0" />
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h1 className="text-base font-bold">Job Buddy</h1>
          <DevBadge />
        </div>
        <VersionLink />
      </header>

      <div className="shrink-0 px-5">
        <div className="flex min-h-8 flex-wrap items-center justify-between gap-2 text-xs">
          {loading ? (
            <span className="h-3 w-28 animate-pulse rounded bg-gray-100 motion-reduce:animate-none dark:bg-gray-800" />
          ) : (
            <span className="flex items-center gap-1.5 font-medium text-gray-600 dark:text-gray-300">
              {isCoreComplete && !profileLoadFailed && (
                <Check
                  aria-hidden="true"
                  className="h-3.5 w-3.5 text-green-700 dark:text-green-400"
                />
              )}
              {isCoreComplete && !profileLoadFailed
                ? 'Required details complete'
                : 'Required profile'}
              {profileLoadFailed ? (
                <span aria-label="Unavailable">—</span>
              ) : (
                !isCoreComplete && (
                  <span className="font-semibold text-gray-700 dark:text-gray-300">
                    {percentage}%
                  </span>
                )
              )}
            </span>
          )}
          {hasProfileData && !loading && !profileLoadFailed && (
            <button
              type="button"
              onClick={openOptions}
              disabled={busy}
              className="min-h-8 shrink-0 rounded px-1 font-medium text-blue-700 text-action disabled:opacity-50 dark:text-blue-400"
            >
              {isCoreComplete ? 'Edit Profile' : 'Complete Profile'}
            </button>
          )}
        </div>
        {loading || profileLoadFailed ? (
          <div className="mt-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800" />
        ) : (
          <div
            role="progressbar"
            aria-label="Saved required profile details"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percentage}
            className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800"
          >
            <div
              className="h-full rounded-full bg-blue-500 transition-all motion-reduce:transition-none dark:bg-blue-400"
              style={{ width: `${percentage}%` }}
            />
          </div>
        )}
      </div>

      {confirming && (
        <div className="min-h-24 overflow-y-auto px-5 pt-4">
          <fieldset className="min-w-0">
            <legend className="sr-only">Choose how to fill existing answers</legend>
            <p className="text-sm font-semibold">This form already has some answers.</p>
            <div className="mt-3 space-y-1">
              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg py-2">
                <input
                  type="radio"
                  name="fillMode"
                  value="merge"
                  autoFocus
                  checked={fillMode === 'merge'}
                  onChange={() => setFillMode('merge')}
                  className="mt-0.5 accent-blue-600"
                />
                <span>
                  <span className="block text-sm font-medium">{fillModeLabels.merge}</span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">
                    Keep existing answers and fill empty fields.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg py-2">
                <input
                  type="radio"
                  name="fillMode"
                  value="overwrite"
                  checked={fillMode === 'overwrite'}
                  onChange={() => setFillMode('overwrite')}
                  className="mt-0.5 accent-blue-600"
                />
                <span>
                  <span className="block text-sm font-medium">{fillModeLabels.overwrite}</span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">
                    Fill empty fields and update existing answers.
                  </span>
                </span>
              </label>
            </div>
          </fieldset>
        </div>
      )}

      <div className="flex shrink-0 flex-wrap gap-2 px-5 pb-4 pt-4"
        title={otherVersionBusy ? feedback.autofillOtherVersionBusy : undefined}
        tabIndex={otherVersionBusy ? 0 : undefined}
        role={otherVersionBusy ? 'group' : undefined}
        aria-label={otherVersionBusy ? feedback.autofillOtherVersionBusy : undefined}>
        <button
          type="button"
          ref={fillButtonRef}
          onClick={primaryAction}
          disabled={primaryDisabled}
          aria-busy={filling}
          className={`${primaryButton} min-w-0 flex-1 basis-40`}
        >
          {filling && (
            <LoaderCircle
              aria-hidden="true"
              className="h-4 w-4 animate-spin motion-reduce:animate-none"
            />
          )}
          <span>{primaryLabel}</span>
          {!filling && primaryIsAI && <Sparkles aria-hidden="true" className="h-4 w-4" />}
        </button>
        {/* A status role inside a button leaves Chrome without a button name, so announce progress beside it. */}
        {filling && (
          <span role="status" aria-atomic="true" className="sr-only">
            {primaryText}
          </span>
        )}
        {confirming ? (
          <button type="button" onClick={handleCancelFill} className={secondaryButton}>
            Cancel
          </button>
        ) : (
          result && (
            <button type="button" onClick={handleUndo} disabled={busy || otherVersionBusy} className={secondaryButton}>
              {undoing ? 'Undoing…' : 'Undo'}
            </button>
          )
        )}
      </div>

      {showFeedback && (
        <div className="flex min-h-16 flex-col px-5 pb-5">
          <div
            role="region"
            aria-label="Autofill details"
            tabIndex={0}
            className="min-h-0 overflow-y-auto rounded-lg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500"
          >
            <PopupNotice tone={tone} urgent={aiUnavailable && !message}>
              {noticeMessage && <p>{noticeMessage}</p>}
              {result && (
                <div
                  className={
                    noticeMessage ? 'mt-3 border-t border-gray-200/70 pt-3 dark:border-gray-700' : ''
                  }
                >
                  <ResultSummary result={result} previous={!!noticeMessage} onOpenDetails={() => void openLog()} />
                  {message && aiWarning && <p className="mt-1">{aiWarning}</p>}
                </div>
              )}
            </PopupNotice>
          </div>
        </div>
      )}
    </div>
  );
}

const PRIMARY_LABELS = {
  profileFailed: 'Open Profile',
  profileSetup: 'Set Up Profile',
  retryAI: 'Retry AI Settings',
  setupAI: 'Set Up AI Autofill',
  fill: 'Fill Form',
} as const;

function resultCounts(result: AutofillResult) {
  return {
    filled: result.noReview + result.needReview,
    unfilled: result.lowConfidence + result.noData + (result.failed ?? 0),
  };
}

function ResultSummary({
  result,
  previous = false,
  onOpenDetails,
}: {
  result: AutofillResult;
  previous?: boolean;
  onOpenDetails: () => void;
}) {
  const { filled, unfilled } = resultCounts(result);
  const onlyKept = filled === 0 && unfilled === 0 && !!result.kept;
  return (
    <section aria-label="Fill results">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {previous && <p className="mb-1 text-gray-500 dark:text-gray-400">Last fill</p>}
          <p className={filled > 0 ? 'font-medium' : 'font-normal'}>
          {result.totalScanned === 0
            ? feedback.autofillNoFields
            : onlyKept
              ? `${result.kept} existing answer${result.kept === 1 ? '' : 's'} kept`
              : `${filled} field${filled === 1 ? '' : 's'} filled`}
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenDetails}
          className="shrink-0 self-start rounded-sm px-1 text-xs font-medium leading-[inherit] text-gray-600 underline text-action hover:text-gray-900 focus-visible:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:text-gray-300 dark:hover:text-white dark:focus-visible:text-white"
        >
          View details
        </button>
      </div>
      <div className="mt-1 space-y-1">
        {result.needReview > 0 && (
          <p>
            {result.needReview} filled value{result.needReview === 1 ? ' needs' : 's need'} review.
          </p>
        )}
        {unfilled > 0 && (
          <p>
            {unfilled} field{unfilled === 1 ? ' still needs' : 's still need'} your input.
          </p>
        )}
        {result.kept && !onlyKept ? (
          <p>
            {result.kept} existing answer{result.kept === 1 ? '' : 's'} kept.
          </p>
        ) : null}
      </div>
    </section>
  );
}

const primaryButton =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50';
const secondaryButton =
  'inline-flex min-h-11 items-center justify-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800';

export default App;
