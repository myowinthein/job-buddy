import { useState, useEffect, useCallback } from 'react';
import { CheckCircle } from 'lucide-react';
import { getProfile, getGeminiApiKey } from '@/src/utils/storage';
import { sessionGet, sessionSet } from '@/src/utils/sessionStorage';
import { calculateCompletion } from '@/src/utils/profileCompletion';
import type { DebugSession } from '@/src/autofill/debug';
import { DebugPanel } from './DebugPanel';
import { InfoTooltip } from '@/src/components/ui/InfoTooltip';
import { AiSparkIcon } from '@/src/components/ui/AiSparkIcon';


interface AutofillResult {
  noReview:      number;
  needReview:    number;
  lowConfidence: number;
  noData:        number;
  totalScanned:  number;
  aiAvailable?:  boolean;
}

// Static — none of its contents depend on props/state — so it's hoisted to
// module scope rather than rebuilt on every render.
const COLOR_MAP = {
  red:    { bar: 'bg-red-500',    text: 'text-red-600 dark:text-red-400',       badge: 'bg-red-50 border-red-200 dark:bg-red-900/30 dark:border-red-800'             },
  yellow: { bar: 'bg-yellow-500', text: 'text-yellow-600 dark:text-yellow-400', badge: 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/30 dark:border-yellow-800' },
  green:  { bar: 'bg-green-500',  text: 'text-green-600 dark:text-green-400',   badge: 'bg-green-50 border-green-200 dark:bg-green-900/30 dark:border-green-800'     },
};

// Sends `message` to every frame of the tab (content.ts runs in all frames —
// see its allFrames flag — since job forms are frequently embedded in a
// cross-origin iframe rather than living on the top-level page).
// chrome.tabs.sendMessage only reaches the top frame unless a frameId is
// given explicitly, so frames are enumerated first. Frames with no content
// script listening (blocked cross-origin frames, about:blank, etc.) reject
// and are silently dropped — that's expected for most iframes on a page
// (ads, trackers, unrelated widgets), not an error condition.
async function sendToAllFrames(tabId: number, message: object): Promise<unknown[]> {
  let frameIds = [0]; // always include the top frame, even if enumeration fails
  try {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    if (frames) frameIds = [...new Set([0, ...frames.map((f) => f.frameId)])];
  } catch {
    // webNavigation unavailable or the call failed — fall back to top frame only.
  }

  const responses = await Promise.all(
    frameIds.map((frameId) => chrome.tabs.sendMessage(tabId, message, { frameId }).catch(() => undefined)),
  );
  return responses.filter((r) => r !== undefined);
}

// Sums AutofillResult counts across frames — a job form split across an iframe
// (the application widget) and the top page (rare, but possible) should read
// as one combined outcome in the popup, not one frame's numbers silently
// overwriting another's. aiAvailable is true if any frame's AI layer ran.
function mergeAutofillResults(results: unknown[]): AutofillResult | null {
  const valid = results.filter(
    (r): r is AutofillResult => !!r && typeof (r as AutofillResult).totalScanned === 'number',
  );
  if (valid.length === 0) return null;
  return valid.reduce((acc, r) => ({
    noReview:      acc.noReview      + r.noReview,
    needReview:    acc.needReview    + r.needReview,
    lowConfidence: acc.lowConfidence + r.lowConfidence,
    noData:        acc.noData        + r.noData,
    totalScanned:  acc.totalScanned  + r.totalScanned,
    aiAvailable:   acc.aiAvailable || !!r.aiAvailable,
  }), { noReview: 0, needReview: 0, lowConfidence: 0, noData: 0, totalScanned: 0, aiAvailable: false });
}

interface AutofillScanResult {
  preFilledCount: number;
}

// Read once from the manifest rather than hardcoded, so it can never drift
// out of sync with what's actually installed.
const EXTENSION_VERSION = chrome.runtime.getManifest().version;

interface CompletionState {
  percentage:              number;
  isCoreComplete:          boolean;
  optionalFieldsRemaining: number;
}

// 'confirming' is shown when the scan found pre-filled fields and we need
// the user to choose merge vs overwrite before proceeding.
type AutofillState = 'idle' | 'loading' | 'confirming' | 'success' | 'error';

function App() {
  const [completion, setCompletion] = useState<CompletionState>({
    percentage: 0,
    isCoreComplete: false,
    optionalFieldsRemaining: 0,
  });
  const [loading, setLoading]               = useState(true);
  const [autofillState, setAutofillState]   = useState<AutofillState>('idle');
  const [autofillResult, setAutofillResult] = useState<AutofillResult | null>(null);
  const [preFilledCount, setPreFilledCount] = useState(0);
  const [fillMode, setFillMode]             = useState<'merge' | 'overwrite'>('merge');
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [hasGeminiKey,   setHasGeminiKey]   = useState<boolean | null>(null);
  const [debugSession,   setDebugSession]   = useState<DebugSession | null>(null);
  const [debugOpen,      setDebugOpen]      = useState(false);

  useEffect(() => {
    getProfile()
      .then((p) => {
        const r = calculateCompletion(p ?? {});
        setCompletion({
          percentage:              r.percentage,
          isCoreComplete:          r.isCoreComplete,
          optionalFieldsRemaining: r.optionalFieldsRemaining,
        });
      })
      .catch((err) => {
        console.error('[Job Buddy] Failed to load profile:', err);
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

  const dispatchFill = useCallback(async (mode: 'merge' | 'overwrite') => {
    const responses = await sendToActiveTab({ action: 'AUTOFILL_FILL', mode });
    const merged = mergeAutofillResults(responses);
    if (merged) {
      setAutofillResult(merged);
      setAutofillState('success');
    } else {
      setAutofillState('error');
    }
  }, [sendToActiveTab]);

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
        const total = (s: DebugSession) => s.summary.green + s.summary.yellow + s.summary.red + s.summary.gray;
        setDebugSession(sessions.reduce((a, b) => (total(b) > total(a) ? b : a)));
      }
    } catch { /* content script absent */ }
    setDebugOpen(true);
  };

  // On mount: restore fill state, check AI nudge dismissal, check Gemini key.
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
    sessionGet('jb:ai:nudge:dismissed').then((r) => {
      if (!cancelled && r?.['jb:ai:nudge:dismissed']) setNudgeDismissed(true);
    });
    getGeminiApiKey().then((key) => { if (!cancelled) setHasGeminiKey(!!key); }).catch(() => { if (!cancelled) setHasGeminiKey(false); });
    return () => { cancelled = true; };
  }, [sendToActiveTab]);

  const dismissNudge = () => {
    setNudgeDismissed(true);
    void sessionSet({ 'jb:ai:nudge:dismissed': true });
  };

  const openOptions = () => chrome.runtime.openOptionsPage();

  // Open Settings → AI Features and focus the Gemini API key input.
  // Same end-state as ResumeImportSection's "Go to Settings →" link, but
  // crosses the popup→options-page context boundary via chrome.storage.session.
  const goToSettingsKey = () => {
    dismissNudge();
    void sessionSet({ 'jb:focusOnLoad': 'gemini-api-key' });
    chrome.runtime.openOptionsPage();
  };

  const handleAutofill = async () => {
    setAutofillState('loading');
    setAutofillResult(null);
    try {
      const scanResponses = await sendToActiveTab({ action: 'AUTOFILL_SCAN' }) as AutofillScanResult[];
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
    } catch { /* ignore — page may have already been refreshed */ }
    setAutofillState('idle');
    setAutofillResult(null);
  };

  const { percentage, isCoreComplete, optionalFieldsRemaining } = completion;

  // True once loading is done and at least one profile field has been filled.
  const hasProfileData = !loading && percentage > 0;

  const color = percentage >= 80 ? 'green' : percentage >= 50 ? 'yellow' : 'red';
  const colorMap = COLOR_MAP[color];

  return (
    <div className="w-[380px] p-5 font-sans bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-5">
        <img
          src="/icon.svg"
          alt="Job Buddy"
          className="w-8 h-8 shrink-0"
          role={autofillState === 'success' ? 'button' : undefined}
          tabIndex={autofillState === 'success' ? 0 : undefined}
          onClick={(e) => { if (e.shiftKey && autofillState === 'success') openDebugPanel(); }}
          onKeyDown={(e) => {
            if (e.shiftKey && (e.key === 'Enter' || e.key === ' ') && autofillState === 'success') {
              e.preventDefault();
              openDebugPanel();
            }
          }}
        />
        <div className="flex items-center gap-1 flex-1">
          <h1 className="text-base font-bold text-gray-900 dark:text-gray-100">Job Buddy</h1>
          <div className="relative group">
            <AiSparkIcon active={hasGeminiKey === true} onClick={goToSettingsKey} />
            {hasGeminiKey !== null && (
              <div className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 z-50 mt-1.5 whitespace-nowrap rounded-md bg-gray-800 dark:bg-gray-700 px-2 py-1.5 text-[11px] leading-snug text-white shadow-md opacity-0 group-hover:opacity-100 transition-opacity">
                {hasGeminiKey ? 'AI-assisted autofill is on' : 'Add an AI key in Settings for smarter fills'}
              </div>
            )}
          </div>
        </div>
        <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">v{EXTENSION_VERSION}</span>
      </div>

      {/* Completion indicator */}
      {loading ? (
        <div className="h-20 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse mb-4" />
      ) : isCoreComplete ? (
        <div className="p-4 rounded-xl border mb-4 bg-green-50 border-green-200 dark:bg-green-900/30 dark:border-green-800 flex flex-col items-center text-center">
          <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400 mb-2" />
          <span className="text-base font-bold text-green-700 dark:text-green-400">You're ready to apply!</span>
          {optionalFieldsRemaining > 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {optionalFieldsRemaining} optional field{optionalFieldsRemaining !== 1 ? 's' : ''} available for richer autofill coverage
            </p>
          )}
        </div>
      ) : (
        <div className={`p-4 rounded-xl border mb-4 ${colorMap.badge}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Profile Completion</span>
            <span className={`text-xl font-bold ${colorMap.text}`}>{percentage}%</span>
          </div>
          <div className="w-full bg-white dark:bg-gray-800 bg-opacity-60 rounded-full h-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${colorMap.bar}`}
              style={{ width: `${percentage}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            {percentage < 50
              ? 'Complete your profile to start auto-filling job forms'
              : 'Almost there: finish the remaining sections'}
          </p>
        </div>
      )}

      {/* CTA button — stays primary (bold blue) only while it's the sole
          actionable button; once profile data exists, Fill Form becomes the
          primary action below and this steps back to an outline style.
          Skeleton avoids a blue-then-outline flash while profile is loading. */}
      {loading ? (
        <div className="h-9 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse mb-4" />
      ) : (
        <button
          onClick={openOptions}
          className={
            hasProfileData
              ? 'w-full py-2.5 px-4 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-95 transition-colors mb-4'
              : 'w-full py-2.5 px-4 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors mb-4'
          }
        >
          {isCoreComplete ? 'Edit Profile' : 'Complete Your Profile'}
        </button>
      )}

      {/* Autofill panel */}
      <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-1.5 mb-3">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wide">Autofill</p>
        </div>

        {/* Loading skeleton */}
        {loading ? (
          <div className="h-9 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />

        ) : !hasProfileData ? (
          /* ── State 1: no profile data ── */
          <p className="text-sm text-gray-600 dark:text-gray-300 leading-snug">
            Set up your profile to start autofilling.
          </p>

        ) : autofillState === 'confirming' ? (
          /* ── State 2a: merge / overwrite confirmation dialog ── */
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">
              This form already has data filled in.
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              {preFilledCount} field{preFilledCount !== 1 ? 's' : ''} already {preFilledCount !== 1 ? 'have' : 'has'} a value. How would you like to proceed?
            </p>

            <div className="space-y-2 mb-4">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name="fillMode"
                  value="merge"
                  checked={fillMode === 'merge'}
                  onChange={() => setFillMode('merge')}
                  className="mt-0.5 shrink-0"
                />
                <div>
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Merge</span>
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-snug">Only fill empty fields: keep existing values</p>
                </div>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name="fillMode"
                  value="overwrite"
                  checked={fillMode === 'overwrite'}
                  onChange={() => setFillMode('overwrite')}
                  className="mt-0.5 shrink-0"
                />
                <div>
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Overwrite</span>
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-snug">Replace all matched fields with profile data</p>
                </div>
              </label>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleCancelFill}
                className="flex-1 py-2 px-3 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-95 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmFill}
                className="flex-1 py-2 px-3 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 active:scale-95 transition-colors"
              >
                Continue
              </button>
            </div>
          </div>

        ) : (
          /* ── State 2b: normal autofill controls ── */
          <>
            {/* Auto Fill button */}
            <button
              onClick={handleAutofill}
              disabled={autofillState === 'loading'}
              className="w-full py-2.5 px-4 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 active:scale-95 transition-colors mb-2"
            >
              {autofillState === 'loading' ? 'Filling…' : 'Fill Form ✨'}
            </button>

            {/* Undo — only visible after a fill has run in this session */}
            {autofillState === 'success' && (
              <button
                onClick={handleUndo}
                className="w-full py-2 px-4 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-95 transition-colors"
              >
                Undo
              </button>
            )}

            {autofillState === 'success' && autofillResult?.aiAvailable === false && !nudgeDismissed && (
              <div className="mt-2 flex items-start gap-2 px-3 py-2.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <span className="flex-1 text-xs text-blue-700 dark:text-blue-300 leading-snug">
                  Add an AI key in{' '}
                  <button
                    type="button"
                    onClick={goToSettingsKey}
                    className="underline font-medium hover:text-blue-900 dark:hover:text-blue-200 active:scale-95"
                  >
                    Settings
                  </button>
                  {' '}to improve autofill accuracy.
                </span>
                <button
                  type="button"
                  onClick={dismissNudge}
                  className="shrink-0 text-blue-400 hover:text-blue-600 dark:text-blue-500 dark:hover:text-blue-300 text-base leading-none active:scale-95"
                >
                  ×
                </button>
              </div>
            )}

            {/* Result summary — no fields found */}
            {autofillState === 'success' && autofillResult && autofillResult.totalScanned === 0 && (
              <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
                <p className="font-medium mb-1">No fillable fields found on this page.</p>
                <p className="text-gray-500 dark:text-gray-400 mb-2.5">
                  This page might use a custom form (iframe or non-standard inputs) we don't support yet.
                </p>
                <a
                  href="https://github.com/myowinthein/job-buddy/issues/new"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline font-medium"
                >
                  Report on GitHub
                </a>
              </div>
            )}

            {/* Result summary — normal */}
            {autofillState === 'success' && autofillResult && autofillResult.totalScanned > 0 && (
              <div className="mt-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs">

                {/* ── Filled header ── */}
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 dark:bg-gray-800 rounded-t-lg">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Filled</span>
                  <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300">({autofillResult.noReview + autofillResult.needReview})</span>
                </div>

                {/* No Review + Review — side by side */}
                <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100 dark:border-gray-700">
                  <span className="flex items-center gap-1 text-gray-600 dark:text-gray-300">
                    <span className="text-green-600 dark:text-green-400 font-semibold">✓</span>
                    No Review
                    <span className="font-medium text-gray-600 dark:text-gray-300">{autofillResult.noReview}</span>
                    <InfoTooltip text="This field is filled and looks correct." />
                  </span>
                  <span className="flex items-center gap-1 text-gray-600 dark:text-gray-300">
                    <span className="text-yellow-600 dark:text-yellow-400 font-semibold">⚠</span>
                    Review
                    <span className="font-medium text-gray-600 dark:text-gray-300">{autofillResult.needReview}</span>
                    <InfoTooltip text="Filled automatically, but not fully confident. Click to review or change it." align="right" />
                  </span>
                </div>

                {/* ── Not Filled header ── */}
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Not Filled</span>
                  <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300">({autofillResult.lowConfidence + autofillResult.noData})</span>
                </div>

                {/* No Match + No Data — side by side */}
                <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100 dark:border-gray-700">
                  <span className="flex items-center gap-1 text-gray-600 dark:text-gray-300">
                    <span className="text-red-500 dark:text-red-400 font-semibold">✗</span>
                    No Match
                    <span className="font-medium text-gray-600 dark:text-gray-300">{autofillResult.lowConfidence}</span>
                    <InfoTooltip text="We couldn't confidently identify this field. Click it to choose a value." />
                  </span>
                  <span className="flex items-center gap-1 text-gray-600 dark:text-gray-300">
                    <span className="text-gray-400 dark:text-gray-500">○</span>
                    No Data
                    <span className="font-medium text-gray-600 dark:text-gray-300">{autofillResult.noData}</span>
                    <InfoTooltip text="This field isn't in your profile yet. Click to choose a value." align="right" />
                  </span>
                </div>

              </div>
            )}

            {/* Error state */}
            {autofillState === 'error' && (
              <p className="mt-3 text-xs text-red-500 dark:text-red-400 text-center leading-snug">
                Could not connect to page.
                <br />
                Try refreshing and clicking Fill Form again.
              </p>
            )}
          </>
        )}
      </div>

      {debugOpen && debugSession && (
        <DebugPanel
          session={debugSession}
          onClose={() => setDebugOpen(false)}
        />
      )}
    </div>
  );
}

export default App;
