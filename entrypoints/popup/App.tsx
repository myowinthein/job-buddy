import { DevBadge } from '@/src/components/ui/DevBadge';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { PopupNotice } from '@/src/components/popup/PopupNotice';
import type { PopupNoticeTone } from '@/src/components/popup/PopupNotice';
import { getProfile, getGeminiApiKey } from '@/src/utils/storage';
import { LOGO_ICON_SRC } from '@/src/utils/branding';
import { sessionSet } from '@/src/utils/sessionStorage';
import { calculateCompletion } from '@/src/utils/profileCompletion';
import { openFillLog } from '@/src/fill-log/client';
import { sendToAllFrames } from '@/src/autofill/frameMessaging';
import { requestAutofillRun, type AutofillRun } from '@/src/autofill/runCoordinator';
import { latestFillRunId } from '@/src/autofill/fillLog';
import { FIELD_DEFS } from '@/src/resume-ai/parser';
import type { AIAutofillStatus } from '@/src/autofill/ai';

interface AutofillResult {
  noReview: number;
  needReview: number;
  lowConfidence: number;
  noData: number;
  totalScanned: number;
  aiStatus?: AIAutofillStatus | 'unknown';
  kept?: number;
  excluded?: number;
  failed?: number;
  runId?: string;
  startedAt?: number;
}

// Aggregate every frame; one failed AI pass must remain visible even when
// another frame completed successfully. Legacy results cannot prove AI success.
function mergeAutofillResults(results: unknown[], requestedRunId?: string): AutofillResult | null {
  const available = results.filter(
    (r): r is AutofillResult => !!r && typeof (r as AutofillResult).totalScanned === 'number',
  );
  if (!available.length) return null;
  const runs = available.flatMap((r) =>
    r.runId && typeof r.startedAt === 'number'
      ? [{ ...r, runId: r.runId, startedAt: r.startedAt }]
      : [],
  );
  const runId = requestedRunId ?? latestFillRunId(runs);
  // Older content scripts cannot report run IDs. Preserve their actual fill
  // replies, and do not let an empty upgraded iframe hide their saved result.
  const includeLegacy = !!requestedRunId || !runs.some((r) => r.totalScanned > 0);
  const valid = runId
    ? available.filter((r) => r.runId === runId || (includeLegacy && !r.runId))
    : available;
  if (!valid.length) return null;
  const statuses = valid
    .filter((r) => r.totalScanned > 0)
    .map((r) =>
      ['unavailable', 'succeeded', 'not_needed'].includes(r.aiStatus ?? '')
        ? r.aiStatus!
        : 'unknown',
    );
  const aiStatus = statuses.includes('unavailable')
    ? 'unavailable'
    : statuses.includes('unknown')
      ? 'unknown'
      : statuses.includes('succeeded')
        ? 'succeeded'
        : 'not_needed';
  return valid.reduce(
    (acc, r) => ({
      noReview: acc.noReview + r.noReview,
      needReview: acc.needReview + r.needReview,
      lowConfidence: acc.lowConfidence + r.lowConfidence,
      noData: acc.noData + r.noData,
      totalScanned: acc.totalScanned + r.totalScanned,
      kept: (acc.kept ?? 0) + (r.kept ?? 0),
      excluded: (acc.excluded ?? 0) + (r.excluded ?? 0),
      failed: (acc.failed ?? 0) + (r.failed ?? 0),
      aiStatus,
    }),
    {
      noReview: 0,
      needReview: 0,
      lowConfidence: 0,
      noData: 0,
      totalScanned: 0,
      aiStatus,
      kept: 0,
      excluded: 0,
      failed: 0,
    },
  );
}

// Read once from the manifest rather than hardcoded, so it can never drift
// out of sync with what's actually installed.
const EXTENSION_VERSION = chrome.runtime.getManifest().version;

interface CompletionState {
  percentage: number;
  isCoreComplete: boolean;
}

// 'confirming' is shown when the scan found pre-filled fields and we need
// the user to choose merge vs overwrite before proceeding.
type AutofillState = 'idle' | 'loading' | 'confirming' | 'success' | 'error';

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
  const fillButtonRef = useRef<HTMLButtonElement>(null);

  const checkApiKey = async () => {
    try {
      const key = await getGeminiApiKey();
      setHasGeminiKey(!!key);
      setKeyReadFailed(false);
      return !!key;
    } catch {
      setHasGeminiKey(null);
      setKeyReadFailed(true);
      return false;
    } finally {
      setKeyLoading(false);
    }
  };

  const retryAISettings = async () => {
    setKeyLoading(true);
    await checkApiKey();
  };

  useEffect(() => {
    getProfile()
      .then((p) => {
        const r = calculateCompletion(p ?? {});
        setCompletion({
          percentage: r.percentage,
          isCoreComplete: r.isCoreComplete,
        });
        setHasProfileData(!!p && FIELD_DEFS.some((field) => !field.isEmpty(field.getValue(p))));
        // Reuse required-profile validation without making every completion check a fill gate.
        setMissingAutofillFields(
          r.missingFields
            .filter((field) => field === 'First Name' || field === 'Email')
            .map((field) => field.toLowerCase()),
        );
      })
      .catch((err) => {
        console.error('[Job Buddy] Failed to load profile:', err);
        setProfileLoadFailed(true);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const sendToActiveTab = useCallback(async (message: object): Promise<unknown[]> => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).finally(() => setSourceResolved(true));
    if (!tab?.id) throw new Error('No active tab found');
    sourceTabId.current = tab.id;
    return sendToAllFrames(tab.id, message);
  }, []);

  const applySetupError = useCallback((responses: unknown[]) => {
    const errors = responses.map((r) => (r as { error?: string } | null)?.error);
    if (errors.includes('ai_settings_unavailable')) {
      setKeyReadFailed(true);
      setHasGeminiKey(null);
      return true;
    }
    if (errors.includes('ai_setup_required')) {
      setKeyReadFailed(false);
      setHasGeminiKey(false);
      return true;
    }
    return false;
  }, []);

  const applyRun = useCallback((run: AutofillRun | null) => {
    if (!run) return;
    if (activeRunId.current !== run.runId) setFillMode('merge');
    activeRunId.current = run.runId;
    if (run.stage === 'scanning' || run.stage === 'filling') {
      setAutofillState('loading');
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
  }, [applySetupError, setResult]);

  // Reopening a popup observes the existing run; it never starts another one.
  useEffect(() => {
    if (autofillState !== 'loading') return;
    let cancelled = false;
    const revision = actionRevision.current;
    let polling = false;
    const timer = setInterval(async () => {
      if (polling || sourceTabId.current === null) return;
      polling = true;
      try {
        const run = await requestAutofillRun('STATUS', sourceTabId.current);
        if (!cancelled && revision === actionRevision.current) applyRun(run);
      } catch { /* The start request still supplies its final response. */ }
      finally { polling = false; }
    }, 300);
    return () => { cancelled = true; clearInterval(timer); };
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

  // On mount: restore the last fill and load the AI setup state.
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
          if (!cancelled && revision === actionRevision.current && run && run.stage !== 'completed') applyRun(run);
        }
      } catch {
        // Content script not loaded on this page — stay in idle state.
      }
    })();
    getGeminiApiKey()
      .then((key) => {
        if (!cancelled) {
          setHasGeminiKey(!!key);
          setKeyReadFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHasGeminiKey(null);
          setKeyReadFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setKeyLoading(false);
      });
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
    const revision = ++actionRevision.current;
    setLogOpenFailed(false);
    setAutofillState('loading');
    try {
      if (sourceTabId.current === null) throw new Error('No source tab');
      // Hand off before awaiting settings, scanning, or any other popup work.
      const run = await requestAutofillRun('START', sourceTabId.current);
      if (!run) throw new Error('Could not start autofill');
      if (revision === actionRevision.current) applyRun(run);
    } catch { if (revision === actionRevision.current) setAutofillState('error'); }
  };

  const handleConfirmFill = async () => {
    const revision = ++actionRevision.current;
    setAutofillState('loading');
    try {
      if (sourceTabId.current === null || !activeRunId.current) throw new Error('No pending run');
      const run = await requestAutofillRun('CONFIRM', sourceTabId.current, {
        runId: activeRunId.current, mode: fillMode,
      });
      if (!run) throw new Error('The pending run changed');
      if (revision === actionRevision.current) applyRun(run);
    } catch { if (revision === actionRevision.current) setAutofillState('error'); }
  };

  const handleCancelFill = () => {
    actionRevision.current++;
    if (sourceTabId.current !== null)
      void requestAutofillRun('CANCEL', sourceTabId.current, { runId: activeRunId.current }).catch(() => {});
    setLogOpenFailed(false);
    setAutofillState('idle');
    setResult(null);
  };

  const handleUndo = async () => {
    actionRevision.current++;
    setLogOpenFailed(false);
    try {
      if (sourceTabId.current !== null)
        await requestAutofillRun('CANCEL', sourceTabId.current).catch(() => null);
      await sendToActiveTab({ action: 'CLEAR' });
    } catch {
      /* ignore — page may have already been refreshed */
    }
    setAutofillState('idle');
    setResult(null);
  };

  const { percentage, isCoreComplete } = completion;
  const busy = autofillState === 'loading';
  const result = autofillState === 'success' ? autofillResult : null;
  const filled = result ? result.noReview + result.needReview : 0;
  const unfilled = result ? result.lowConfidence + result.noData + (result.failed ?? 0) : 0;
  const aiUnavailable = !!result && result.totalScanned > 0 && result.aiStatus === 'unavailable';
  const profileSetup = !loading && !profileLoadFailed && missingAutofillFields.length > 0;
  const aiSetup = !loading && !profileLoadFailed && !profileSetup && !keyLoading && !hasGeminiKey;
  const waitingForKey = !loading && !profileLoadFailed && !profileSetup && keyLoading;
  const confirming = autofillState === 'confirming' && !profileSetup && !aiSetup && !keyReadFailed;
  const primaryDisabled = loading || waitingForKey || busy || !sourceResolved;

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
  if (loading) {
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
    message = 'Add a Gemini API key to enable autofill.';
  } else if (busy) {
    tone = 'working';
    message = 'Filling…';
  } else if (autofillState === 'error') {
    tone = 'error';
    message = 'Refresh the page to retry after an autofill error.';
  } else if (logOpenFailed && result) {
    tone = 'error';
    message = 'Please try opening Fill Details again.';
  } else if (result)
    tone =
      aiUnavailable || result.needReview > 0 || unfilled > 0
        ? 'review'
        : filled > 0
          ? 'success'
          : 'neutral';

  const primaryLabel = profileLoadFailed
    ? 'Open Profile'
    : profileSetup
      ? 'Set Up Profile'
      : keyReadFailed
        ? 'Retry AI Settings'
        : aiSetup
          ? 'Set Up AI Autofill'
          : 'Fill Form';
  const primaryAction =
    profileLoadFailed || profileSetup
      ? openOptions
      : keyReadFailed
        ? retryAISettings
        : aiSetup
          ? goToSettingsKey
          : confirming
            ? handleConfirmFill
            : handleAutofill;
  const primaryIsAI = !profileLoadFailed && !profileSetup;
  const showFeedback = !confirming && (!!message || !!result);
  const aiWarning = aiUnavailable ? 'AI was unavailable, but basic autofill still ran.' : null;
  const noticeMessage = message ?? aiWarning;

  return (
    <div className="flex max-h-[600px] w-[380px] flex-col bg-white font-sans text-gray-900 dark:bg-gray-900 dark:text-gray-100">
      <header className="flex shrink-0 items-center gap-2.5 px-5 pb-3 pt-5">
        <img
          src={LOGO_ICON_SRC}
          alt="Job Buddy"
          className="h-8 w-8 shrink-0"
        />
        <div className="flex flex-1 items-center gap-2">
          <h1 className="text-base font-bold">Job Buddy</h1>
          <DevBadge />
        </div>
        <span className="text-xs text-gray-400 dark:text-gray-500">v{EXTENSION_VERSION}</span>
      </header>

      <div className="shrink-0 px-5">
        <div className="flex min-h-8 items-center justify-between gap-2 text-xs">
          {loading ? (
            <span className="h-3 w-28 animate-pulse rounded bg-gray-100 motion-reduce:animate-none dark:bg-gray-800" />
          ) : (
            <span
              className={`flex items-center gap-1.5 font-medium ${isCoreComplete && !profileLoadFailed ? 'text-green-700 dark:text-green-400' : 'text-gray-600 dark:text-gray-300'}`}
            >
              {isCoreComplete && !profileLoadFailed && (
                <Check aria-hidden="true" className="h-3.5 w-3.5" />
              )}
              {isCoreComplete && !profileLoadFailed
                ? 'Required details complete'
                : 'Required profile'}
              {profileLoadFailed ? (
                <span aria-label="Unavailable">—</span>
              ) : (
                !isCoreComplete && (
                  <span className="font-semibold text-blue-700 dark:text-blue-400">
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
              className="min-h-8 shrink-0 rounded px-1 font-medium text-blue-700 hover:underline disabled:opacity-50 dark:text-blue-400"
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
              className={`h-full rounded-full transition-all motion-reduce:transition-none ${isCoreComplete ? 'bg-green-500' : 'bg-blue-500'}`}
              style={{ width: `${percentage}%` }}
            />
          </div>
        )}
      </div>

      {confirming && (
        <fieldset className="min-h-0 overflow-y-auto px-5 pt-4">
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
                <span className="block text-sm font-medium">Fill empty fields</span>
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
                <span className="block text-sm font-medium">Fill all matched fields</span>
                <span className="block text-xs text-gray-500 dark:text-gray-400">
                  Fill empty fields and update existing answers.
                </span>
              </span>
            </label>
          </div>
        </fieldset>
      )}

      <div className="flex shrink-0 gap-2 px-5 pb-4 pt-4">
        <button
          type="button"
          ref={fillButtonRef}
          onClick={primaryAction}
          disabled={primaryDisabled}
          className={`${primaryButton} flex-1`}
        >
          {primaryLabel}
          {primaryIsAI && <Sparkles aria-hidden="true" className="h-4 w-4" />}
        </button>
        {confirming ? (
          <button type="button" onClick={handleCancelFill} className={secondaryButton}>
            Cancel
          </button>
        ) : (
          result && (
            <button type="button" onClick={handleUndo} disabled={busy} className={secondaryButton}>
              Undo
            </button>
          )
        )}
      </div>

      {showFeedback && (
        <div
          role="region"
          aria-label="Autofill details"
          tabIndex={0}
          className="min-h-0 overflow-y-auto px-5 pb-5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500"
        >
          <PopupNotice tone={tone} urgent={aiUnavailable && !message}>
            {noticeMessage && <p>{noticeMessage}</p>}
            {result && (
              <div
                className={
                  noticeMessage ? 'mt-3 border-t border-gray-200/70 pt-3 dark:border-gray-700' : ''
                }
              >
                {noticeMessage && (
                  <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">Last fill</p>
                )}
                <ResultSummary result={result} onOpenDetails={() => void openLog()} />
                {message && aiWarning && <p className="mt-1">{aiWarning}</p>}
              </div>
            )}
          </PopupNotice>
        </div>
      )}
    </div>
  );
}

function ResultSummary({
  result,
  onOpenDetails,
}: {
  result: AutofillResult;
  onOpenDetails: () => void;
}) {
  const filled = result.noReview + result.needReview;
  const unfilled = result.lowConfidence + result.noData + (result.failed ?? 0);
  const onlyKept = filled === 0 && unfilled === 0 && !!result.kept;
  return (
    <section aria-label="Fill results">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-sm font-semibold text-gray-900 dark:text-gray-100">
          {result.totalScanned === 0
            ? 'No fillable fields found.'
            : onlyKept
              ? `${result.kept} existing answer${result.kept === 1 ? '' : 's'} kept`
              : `${filled} field${filled === 1 ? '' : 's'} filled`}
        </p>
        <button
          type="button"
          onClick={onOpenDetails}
          className="-my-1 min-h-7 shrink-0 rounded-sm px-1 text-xs font-medium text-gray-600 hover:text-gray-900 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:text-gray-300 dark:hover:text-white"
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
  'inline-flex min-h-11 items-center justify-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800';

export default App;
