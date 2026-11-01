import { useState, useEffect, useCallback, useRef } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { PopupNotice } from '@/src/components/popup/PopupNotice';
import type { PopupNoticeTone } from '@/src/components/popup/PopupNotice';
import { getProfile, getGeminiApiKey } from '@/src/utils/storage';
import { LOGO_ICON_SRC } from '@/src/utils/branding';
import { sessionSet } from '@/src/utils/sessionStorage';
import { calculateCompletion } from '@/src/utils/profileCompletion';
import { openFillLog } from '@/src/fill-log/client';
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

// Actively (re-)injects the content script into every given frame before
// messaging it. Chrome's declarative content_scripts injection (matches +
// allFrames + matchAboutBlank + matchOriginAsFallback, see content.ts) does
// NOT reliably re-run for a frame whose document was populated
// asynchronously via document.write() after the frame was created — a known
// Chromium quirk. HubSpot's embedded-form iframe pattern hits this exactly:
// an empty iframe is created up front, then its form HTML is fetched and
// document.write()-ten in well after (confirmed on moroku.com/designer).
// Re-injecting here is idempotent (see content.ts's __jobBuddyInjected
// guard) so it's safe to call unconditionally rather than only retrying
// frames that failed to respond. Best-effort per frame: frames that reject
// (chrome:// pages, frames that detached, etc.) are silently skipped.
async function ensureContentScriptInjected(tabId: number, frameIds: number[]): Promise<void> {
  await Promise.all(
    frameIds.map((frameId) =>
      chrome.scripting
        .executeScript({
          target: { tabId, frameIds: [frameId] },
          files: ['content-scripts/content.js'],
        })
        .catch(() => undefined),
    ),
  );
}

// Sends `message` to every frame of the tab (content.ts runs in all frames —
// see its allFrames flag — since job forms are frequently embedded in a
// cross-origin iframe rather than living on the top-level page).
// chrome.tabs.sendMessage only reaches the top frame unless a frameId is
// given explicitly, so frames are enumerated first. Frames with no content
// script listening even after the active re-injection above (blocked
// cross-origin frames without host permissions, chrome:// pages, etc.)
// reject and are silently dropped — that's expected for most iframes on a
// page (ads, trackers, unrelated widgets), not an error condition.
async function sendToAllFrames(tabId: number, message: object): Promise<unknown[]> {
  let frameIds = [0]; // always include the top frame, even if enumeration fails
  try {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    if (frames) frameIds = [...new Set([0, ...frames.map((f) => f.frameId)])];
  } catch {
    // webNavigation unavailable or the call failed — fall back to top frame only.
  }

  await ensureContentScriptInjected(tabId, frameIds);

  const responses = await Promise.all(
    frameIds.map((frameId) =>
      chrome.tabs.sendMessage(tabId, message, { frameId }).catch(() => undefined),
    ),
  );
  return responses.filter((r) => r !== undefined);
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

interface AutofillScanResult {
  preFilledCount: number;
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
  const [fillMode, setFillMode] = useState<'merge' | 'overwrite'>('merge');
  const [keyLoading, setKeyLoading] = useState(true);
  const [keyReadFailed, setKeyReadFailed] = useState(false);
  const [hasGeminiKey, setHasGeminiKey] = useState<boolean | null>(null);
  const sourceTabId = useRef<number | null>(null);
  const activeRunId = useRef<string | undefined>(undefined);
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
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab found');
    sourceTabId.current = tab.id;
    return sendToAllFrames(tab.id, message);
  }, []);

  const applySetupError = (responses: unknown[]) => {
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
  };

  const dispatchFill = async (mode: 'merge' | 'overwrite') => {
    const responses = await sendToActiveTab({ action: 'AUTOFILL_FILL', mode });
    const setupError = applySetupError(responses);
    const merged = mergeAutofillResults(responses, activeRunId.current);
    if (merged) {
      setAutofillResult(setupError ? { ...merged, aiStatus: 'unavailable' } : merged);
      setAutofillState('success');
    } else {
      setAutofillState(setupError ? (autofillResult ? 'success' : 'idle') : 'error');
    }
  };

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
    (async () => {
      try {
        const responses = await sendToActiveTab({ action: 'GET_STATUS' });
        const merged = mergeAutofillResults(responses);
        if (!cancelled && merged) {
          setAutofillResult(merged);
          setAutofillState('success');
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
  }, [sendToActiveTab]);

  const openOptions = () => chrome.runtime.openOptionsPage();

  // Open Settings → AI Features and focus the Gemini API key input.
  // Same end-state as ResumeImportSection's "Go to Settings →" link, but
  // crosses the popup→options-page context boundary via chrome.storage.session.
  const goToSettingsKey = async () => {
    await sessionSet({ 'jb:focusOnLoad': 'gemini-api-key' });
    await chrome.runtime.openOptionsPage();
  };

  const handleAutofill = async () => {
    setLogOpenFailed(false);
    setAutofillState('loading');
    try {
      if (!(await checkApiKey())) {
        setAutofillState(autofillResult ? 'success' : 'idle');
        return;
      }
      activeRunId.current = crypto.randomUUID();
      const scanResponses = (await sendToActiveTab({
        action: 'AUTOFILL_SCAN',
        runId: activeRunId.current,
      })) as AutofillScanResult[];
      if (applySetupError(scanResponses)) {
        setAutofillState(autofillResult ? 'success' : 'idle');
        return;
      }
      if (scanResponses.some((r) => (r as { error?: string })?.error))
        throw new Error('Scan failed');
      const preFilledCount = scanResponses.reduce((sum, r) => sum + (r?.preFilledCount ?? 0), 0);
      if (preFilledCount > 0) {
        // Form already has data — ask the user how to proceed
        setFillMode('merge');
        setAutofillState('confirming');
      } else {
        await dispatchFill('overwrite');
      }
    } catch {
      setAutofillState('error');
    }
  };

  const handleConfirmFill = async () => {
    setAutofillState('loading');
    try {
      if (!(await checkApiKey())) {
        setAutofillState(autofillResult ? 'success' : 'idle');
        return;
      }
      await dispatchFill(fillMode);
    } catch {
      setAutofillState('error');
    }
  };

  const handleCancelFill = () => {
    setLogOpenFailed(false);
    setAutofillState('idle');
    setAutofillResult(null);
  };

  const handleUndo = async () => {
    setLogOpenFailed(false);
    try {
      await sendToActiveTab({ action: 'CLEAR' });
    } catch {
      /* ignore — page may have already been refreshed */
    }
    setAutofillState('idle');
    setAutofillResult(null);
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
  const primaryDisabled = loading || waitingForKey || busy;

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
    message = 'Please try opening Fill Log again.';
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
          role={result ? 'button' : undefined}
          tabIndex={result ? 0 : undefined}
          onClick={(event) => {
            if (event.shiftKey && result) void openLog();
          }}
          onKeyDown={(event) => {
            if (event.shiftKey && (event.key === 'Enter' || event.key === ' ') && result) {
              event.preventDefault();
              void openLog();
            }
          }}
        />
        <h1 className="flex-1 text-base font-bold">Job Buddy</h1>
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
                {result.totalScanned === 0 ? (
                  <p>No fillable fields found.</p>
                ) : (
                  <>
                    <ResultSummary result={result} />
                    {message && aiWarning && <p className="mt-1">{aiWarning}</p>}
                  </>
                )}
              </div>
            )}
          </PopupNotice>
          {result && (
            <div className="mt-3 text-xs">
              <button
                type="button"
                onClick={() => void openLog()}
                className="rounded-sm font-medium text-blue-700 hover:underline dark:text-blue-400"
              >
                View Fill Log →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ResultSummary({ result }: { result: AutofillResult }) {
  const filled = result.noReview + result.needReview;
  const unfilled = result.lowConfidence + result.noData + (result.failed ?? 0);
  const onlyKept = filled === 0 && unfilled === 0 && !!result.kept;
  return (
    <section aria-label="Fill results">
      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
        {onlyKept
          ? `${result.kept} existing answer${result.kept === 1 ? '' : 's'} kept`
          : `${filled} field${filled === 1 ? '' : 's'} filled`}
      </p>
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
