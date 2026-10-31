import { useState, useEffect, useCallback, useRef } from 'react';
import { Check, LoaderCircle, Sparkles } from 'lucide-react';
import { getProfile, getGeminiApiKey } from '@/src/utils/storage';
import { LOGO_ICON_SRC } from '@/src/utils/branding';
import { sessionSet } from '@/src/utils/sessionStorage';
import { calculateCompletion } from '@/src/utils/profileCompletion';
import type { DebugSession } from '@/src/autofill/debug';
import { DebugPanel } from './DebugPanel';
import { FIELD_DEFS } from '@/src/resume-ai/parser';
import type { AIAutofillStatus } from '@/src/autofill/ai';

interface AutofillResult {
  noReview: number;
  needReview: number;
  lowConfidence: number;
  noData: number;
  totalScanned: number;
  aiStatus?: AIAutofillStatus | 'unknown';
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
function mergeAutofillResults(results: unknown[]): AutofillResult | null {
  const valid = results.filter(
    (r): r is AutofillResult => !!r && typeof (r as AutofillResult).totalScanned === 'number',
  );
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
      aiStatus,
    }),
    { noReview: 0, needReview: 0, lowConfidence: 0, noData: 0, totalScanned: 0, aiStatus },
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
  const [profileLoadFailed, setProfileLoadFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [autofillState, setAutofillState] = useState<AutofillState>('idle');
  const [autofillResult, setAutofillResult] = useState<AutofillResult | null>(null);
  const [preFilledCount, setPreFilledCount] = useState(0);
  const [fillMode, setFillMode] = useState<'merge' | 'overwrite'>('merge');
  const [keyLoading, setKeyLoading] = useState(true);
  const [keyReadFailed, setKeyReadFailed] = useState(false);
  const [hasGeminiKey, setHasGeminiKey] = useState<boolean | null>(null);
  const [debugSession, setDebugSession] = useState<DebugSession | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const fillButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (autofillState !== 'loading' && autofillState !== 'confirming')
      fillButtonRef.current?.focus({ preventScroll: true });
  }, [autofillState]);

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

  useEffect(() => {
    getProfile()
      .then((p) => {
        const r = calculateCompletion(p ?? {});
        setCompletion({
          percentage: r.percentage,
          isCoreComplete: r.isCoreComplete,
        });
        setHasProfileData(!!p && FIELD_DEFS.some((field) => !field.isEmpty(field.getValue(p))));
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
    const merged = mergeAutofillResults(responses);
    if (merged) {
      setAutofillResult(setupError ? { ...merged, aiStatus: 'unavailable' } : merged);
      setAutofillState('success');
    } else {
      setAutofillState(setupError ? (autofillResult ? 'success' : 'idle') : 'error');
    }
  };

  // Lazily fetch the debug session from the content script when the user opens
  // the panel — keeps the popup's initial render cheap.
  const openDebugPanel = async () => {
    try {
      const responses = await sendToActiveTab({ action: 'GET_DEBUG_SESSION' });
      const sessions = responses.filter((s): s is DebugSession => !!s);
      // Multiple frames can each have their own session (e.g. an ATS iframe
      // plus the mostly-empty top page) — surface whichever scanned the most
      // fields, since that's the frame actually holding the form.
      if (sessions.length > 0) {
        const total = (s: DebugSession) =>
          s.summary.green + s.summary.yellow + s.summary.red + s.summary.gray;
        setDebugSession(sessions.reduce((a, b) => (total(b) > total(a) ? b : a)));
      }
    } catch {
      /* content script absent */
    }
    setDebugOpen(true);
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
    setAutofillState('loading');
    try {
      if (!(await checkApiKey())) {
        setAutofillState(autofillResult ? 'success' : 'idle');
        return;
      }
      const scanResponses = (await sendToActiveTab({
        action: 'AUTOFILL_SCAN',
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
        setPreFilledCount(preFilledCount);
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
    setAutofillState('idle');
    setAutofillResult(null);
  };

  const handleUndo = async () => {
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
  const aiWarning =
    autofillResult?.aiStatus === 'unavailable'
      ? 'AI assistance was unavailable. Review the filled details carefully.'
      : null;

  return (
    <div className="flex max-h-[600px] w-[380px] flex-col bg-white font-sans text-gray-900 dark:bg-gray-900 dark:text-gray-100">
      <header className="flex shrink-0 items-center gap-2.5 px-5 pb-3 pt-5">
        <img
          src={LOGO_ICON_SRC}
          alt="Job Buddy"
          className="h-8 w-8 shrink-0"
          role={autofillState === 'success' ? 'button' : undefined}
          tabIndex={autofillState === 'success' ? 0 : undefined}
          onClick={(e) => {
            if (e.shiftKey && autofillState === 'success') openDebugPanel();
          }}
          onKeyDown={(e) => {
            if (e.shiftKey && (e.key === 'Enter' || e.key === ' ') && autofillState === 'success') {
              e.preventDefault();
              openDebugPanel();
            }
          }}
        />
        <h1 className="flex-1 text-base font-bold">Job Buddy</h1>
        <span className="text-xs text-gray-400 dark:text-gray-500">v{EXTENSION_VERSION}</span>
      </header>

      <div className="shrink-0 px-5">
        {loading ? (
          <div className="h-10 animate-pulse rounded-lg bg-gray-100 motion-reduce:animate-none dark:bg-gray-800" />
        ) : profileLoadFailed ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            Could not load your profile. Reopen the popup or open your profile to try again.
          </p>
        ) : (
          <>
            <div className="flex min-h-8 items-center justify-between gap-2 text-xs">
              <span
                className={`flex items-center gap-1.5 font-medium ${isCoreComplete ? 'text-green-700 dark:text-green-400' : 'text-gray-600 dark:text-gray-300'}`}
              >
                {isCoreComplete && <Check aria-hidden="true" className="h-3.5 w-3.5" />}
                {isCoreComplete ? 'Required details complete' : 'Required profile'}
                {!isCoreComplete && (
                  <span className="font-semibold text-blue-700 dark:text-blue-400">
                    {percentage}%
                  </span>
                )}
              </span>
              {hasProfileData && (
                <button
                  type="button"
                  onClick={openOptions}
                  disabled={busy}
                  className="min-h-8 shrink-0 rounded px-1 font-medium text-blue-700 hover:underline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-50 dark:text-blue-400"
                >
                  {isCoreComplete ? 'Edit Profile' : 'Complete Profile'}
                </button>
              )}
            </div>
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
          </>
        )}
      </div>

      <div className="shrink-0 px-5 pb-4 pt-4">
        {loading ? (
          <div
            role="status"
            className="h-11 animate-pulse rounded-lg bg-gray-100 motion-reduce:animate-none dark:bg-gray-800"
          >
            <span className="sr-only">Loading profile…</span>
          </div>
        ) : profileLoadFailed || !hasProfileData ? (
          <>
            {!profileLoadFailed && (
              <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">
                Add your details to fill job application forms.
              </p>
            )}
            <button
              type="button"
              autoFocus
              onClick={openOptions}
              className={`${primaryButton} w-full`}
            >
              {profileLoadFailed ? 'Open Profile' : 'Set Up Profile'}
            </button>
          </>
        ) : keyLoading ? (
          <div role="status" className="h-11 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800">
            <span className="sr-only">Loading AI settings…</span>
          </div>
        ) : keyReadFailed || !hasGeminiKey ? (
          <>
            <p
              role={keyReadFailed ? 'alert' : undefined}
              className="mb-3 text-sm text-gray-600 dark:text-gray-300"
            >
              {keyReadFailed
                ? 'Could not read your AI settings. Open Settings to try again.'
                : 'Add a Gemini API key to enable AI-assisted autofill.'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                autoFocus
                onClick={goToSettingsKey}
                className={`${primaryButton} flex-1`}
              >
                {keyReadFailed ? 'Open AI Settings' : 'Set Up AI Autofill'}
                <Sparkles aria-hidden="true" className="h-4 w-4" />
              </button>
              {autofillState === 'success' && (
                <button type="button" onClick={handleUndo} className={secondaryButton}>
                  Undo
                </button>
              )}
            </div>
          </>
        ) : autofillState === 'confirming' ? (
          <div>
            <fieldset>
              <legend className="mb-1 text-sm font-semibold">
                This form already has data filled in.
              </legend>
              <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                {preFilledCount} field{preFilledCount !== 1 ? 's' : ''} already{' '}
                {preFilledCount !== 1 ? 'have' : 'has'} a value. Choose how to fill the form.
              </p>
              <div className="space-y-1">
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
                      Keep values already entered on this page.
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
                    <span className="block text-sm font-medium">Replace matched values</span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400">
                      Use your saved details for matched fields.
                    </span>
                  </span>
                </label>
              </div>
            </fieldset>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={handleCancelFill}
                className={`${secondaryButton} flex-1`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmFill}
                className={`${primaryButton} flex-1`}
              >
                Fill Form <Sparkles aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <button
                type="button"
                autoFocus
                ref={fillButtonRef}
                onClick={handleAutofill}
                disabled={busy}
                className={`${primaryButton} flex-1`}
              >
                {busy ? (
                  <>
                    <LoaderCircle
                      aria-hidden="true"
                      className="h-4 w-4 animate-spin motion-reduce:animate-none"
                    />
                    Filling…
                  </>
                ) : (
                  <>
                    Fill Form <Sparkles aria-hidden="true" className="h-4 w-4" />
                  </>
                )}
              </button>
              {autofillState === 'success' && (
                <button type="button" onClick={handleUndo} className={secondaryButton}>
                  Undo
                </button>
              )}
            </div>
            {autofillState === 'success' &&
              !!autofillResult &&
              autofillResult.noReview + autofillResult.needReview > 0 &&
              !aiWarning && (
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Review the filled details before submitting.
                </p>
              )}
          </>
        )}
        <p role="status" className="sr-only">
          {busy
            ? 'Filling form…'
            : autofillState === 'success' && autofillResult
              ? `${autofillResult.noReview + autofillResult.needReview} filled, ${autofillResult.needReview} to review, ${autofillResult.lowConfidence + autofillResult.noData} not filled.`
              : ''}
        </p>
      </div>

      {hasProfileData && !loading && (autofillState === 'success' || autofillState === 'error') && (
        <div
          role="region"
          aria-label="Autofill details"
          tabIndex={0}
          className="min-h-0 overflow-y-auto px-5 pb-5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500"
        >
          {autofillState === 'error' && (
            <p
              role="alert"
              className="rounded-lg bg-red-50 p-3 text-xs leading-relaxed text-red-600 dark:bg-red-900/20 dark:text-red-400"
            >
              Could not connect to page. Open a job application page, or refresh this page and try
              again.
            </p>
          )}
          {autofillState === 'success' &&
            autofillResult &&
            autofillResult.totalScanned > 0 &&
            aiWarning && (
              <p
                role="alert"
                className="mb-3 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-800 dark:bg-amber-900/20 dark:text-amber-300"
              >
                {aiWarning}
              </p>
            )}
          {autofillState === 'success' &&
            autofillResult &&
            (autofillResult.totalScanned === 0 ? (
              <div className="rounded-lg border border-gray-200 p-3 text-xs dark:border-gray-700">
                <p className="mb-1 font-medium">No fillable fields found on this page.</p>
                <p className="text-gray-500 dark:text-gray-400">
                  Open the application form, then try Fill Form again.
                </p>
                <a
                  href="https://github.com/myowinthein/job-buddy/issues/new"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex min-h-6 items-center font-medium text-blue-700 underline dark:text-blue-400"
                >
                  Report on GitHub
                </a>
              </div>
            ) : (
              <section
                aria-label="Fill results"
                className="rounded-lg border border-gray-200 px-3 dark:border-gray-700"
              >
                <p className="flex items-center justify-between pb-1 pt-3 text-xs font-semibold text-gray-600 dark:text-gray-300">
                  <span>Filled</span>
                  <span>({autofillResult.noReview + autofillResult.needReview})</span>
                </p>
                <ResultRow
                  symbol="✓"
                  color="text-green-700 dark:text-green-400"
                  label="High confidence"
                  count={autofillResult.noReview}
                  description="Filled with a confident match."
                />
                <ResultRow
                  symbol="⚠"
                  color="text-amber-700 dark:text-amber-400"
                  label="Review value"
                  count={autofillResult.needReview}
                  description="Check the yellow fields on the page."
                />
                <p className="flex items-center justify-between border-t border-gray-200 pb-1 pt-3 text-xs font-semibold text-gray-600 dark:border-gray-700 dark:text-gray-300">
                  <span>Not filled</span>
                  <span>({autofillResult.lowConfidence + autofillResult.noData})</span>
                </p>
                <ResultRow
                  symbol="✗"
                  color="text-red-600 dark:text-red-400"
                  label="Not matched"
                  count={autofillResult.lowConfidence}
                  description="Enter these values manually."
                />
                <ResultRow
                  symbol="○"
                  color="text-gray-500 dark:text-gray-400"
                  label="Missing profile data"
                  count={autofillResult.noData}
                  description="No saved value. Enter these manually."
                />
              </section>
            ))}
        </div>
      )}
      {debugOpen && debugSession && (
        <DebugPanel session={debugSession} onClose={() => setDebugOpen(false)} />
      )}
    </div>
  );
}

const primaryButton =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50';
const secondaryButton =
  'inline-flex min-h-11 items-center justify-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800';

function ResultRow({
  symbol,
  color,
  label,
  count,
  description,
}: {
  symbol: string;
  color: string;
  label: string;
  count: number;
  description: string;
}) {
  return (
    <div className="grid grid-cols-[16px_1fr_auto] gap-x-2 py-2 text-xs">
      <span aria-hidden="true" className={`font-semibold ${color}`}>
        {symbol}
      </span>
      <span className="font-medium">{label}</span>
      <span className="font-semibold tabular-nums">{count}</span>
      <p className="col-start-2 col-end-4 mt-1 leading-relaxed text-gray-500 dark:text-gray-400">
        {description}
      </p>
    </div>
  );
}

export default App;
