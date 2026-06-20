import { useState, useEffect } from 'react';
import { getProfile } from '@/src/utils/storage';
import { calculateCompletion } from '@/src/utils/profileCompletion';

interface AutofillResult {
  filled:       number;
  review:       number;
  unmatched:    number;
  totalScanned: number;
}

interface AutofillScanResult {
  preFilledCount: number;
  totalMatched:   number;
}

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

  const openOptions = () => chrome.runtime.openOptionsPage();

  const sendToActiveTab = async (message: object) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab found');
    return chrome.tabs.sendMessage(tab.id, message);
  };

  const handleAutofill = async () => {
    setAutofillState('loading');
    setAutofillResult(null);
    try {
      const scan = await sendToActiveTab({ action: 'AUTOFILL_SCAN' }) as AutofillScanResult;

      if (scan?.preFilledCount > 0) {
        // Form already has data — ask the user how to proceed
        setPreFilledCount(scan.preFilledCount);
        setFillMode('merge');
        setAutofillState('confirming');
      } else {
        // Nothing pre-filled: fill immediately
        const result = await sendToActiveTab({ action: 'AUTOFILL_FILL', mode: 'overwrite' }) as AutofillResult;
        if (result && typeof result.filled === 'number') {
          setAutofillResult(result);
          setAutofillState('success');
        } else {
          setAutofillState('error');
        }
      }
    } catch {
      setAutofillState('error');
    }
  };

  const handleConfirmFill = async () => {
    setAutofillState('loading');
    try {
      const result = await sendToActiveTab({ action: 'AUTOFILL_FILL', mode: fillMode }) as AutofillResult;
      if (result && typeof result.filled === 'number') {
        setAutofillResult(result);
        setAutofillState('success');
      } else {
        setAutofillState('error');
      }
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
  const colorMap = {
    red:    { bar: 'bg-red-500',    text: 'text-red-600',    badge: 'bg-red-50 border-red-200'       },
    yellow: { bar: 'bg-yellow-500', text: 'text-yellow-600', badge: 'bg-yellow-50 border-yellow-200' },
    green:  { bar: 'bg-green-500',  text: 'text-green-600',  badge: 'bg-green-50 border-green-200'   },
  }[color];

  return (
    <div className="w-[380px] p-5 font-sans bg-white">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
          <span className="text-white text-xs font-bold">JB</span>
        </div>
        <h1 className="text-base font-bold text-gray-900">Job Buddy</h1>
      </div>

      {/* Completion indicator */}
      {loading ? (
        <div className="h-20 bg-gray-100 rounded-xl animate-pulse mb-4" />
      ) : isCoreComplete ? (
        <div className="p-4 rounded-xl border mb-4 bg-green-50 border-green-200">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg font-bold text-green-700">✓ Ready to Apply</span>
          </div>
          {optionalFieldsRemaining > 0 && (
            <p className="text-xs text-gray-500">
              {optionalFieldsRemaining} optional field{optionalFieldsRemaining !== 1 ? 's' : ''} available for richer autofill coverage
            </p>
          )}
        </div>
      ) : (
        <div className={`p-4 rounded-xl border mb-4 ${colorMap.badge}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Profile Completion</span>
            <span className={`text-xl font-bold ${colorMap.text}`}>{percentage}%</span>
          </div>
          <div className="w-full bg-white bg-opacity-60 rounded-full h-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${colorMap.bar}`}
              style={{ width: `${percentage}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {percentage < 50
              ? 'Complete your profile to start auto-filling job forms'
              : 'Almost there — finish the remaining sections'}
          </p>
        </div>
      )}

      {/* CTA button */}
      <button
        onClick={openOptions}
        className="w-full py-2.5 px-4 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors mb-4"
      >
        {isCoreComplete ? 'Edit Profile' : 'Complete Your Profile'}
      </button>

      {/* Autofill panel */}
      <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
        <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-3">Autofill</p>

        {/* Loading skeleton */}
        {loading ? (
          <div className="h-9 bg-gray-200 rounded-lg animate-pulse" />

        ) : !hasProfileData ? (
          /* ── State 1: no profile data ── */
          <p className="text-sm text-gray-600 leading-snug">
            Add your profile info first to start auto-filling forms.
          </p>

        ) : autofillState === 'confirming' ? (
          /* ── State 2a: merge / overwrite confirmation dialog ── */
          <div>
            <p className="text-sm font-medium text-gray-800 mb-1">
              This form already has data filled in.
            </p>
            <p className="text-xs text-gray-500 mb-3">
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
                  <span className="text-sm font-medium text-gray-800">Merge</span>
                  <p className="text-xs text-gray-500 leading-snug">Only fill empty fields — keep existing values</p>
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
                  <span className="text-sm font-medium text-gray-800">Overwrite</span>
                  <p className="text-xs text-gray-500 leading-snug">Replace all matched fields with profile data</p>
                </div>
              </label>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleCancelFill}
                className="flex-1 py-2 px-3 border border-gray-300 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmFill}
                className="flex-1 py-2 px-3 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
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
              className="w-full py-2.5 px-4 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors mb-2"
            >
              {autofillState === 'loading' ? 'Filling…' : 'Auto Fill'}
            </button>

            {/* Undo — only visible after a fill has run in this session */}
            {autofillState === 'success' && (
              <button
                onClick={handleUndo}
                className="w-full py-2 px-4 border border-gray-300 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-100 transition-colors"
              >
                Undo Auto-fill
              </button>
            )}

            {/* Result summary — no fields found */}
            {autofillState === 'success' && autofillResult && autofillResult.totalScanned === 0 && (
              <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200 text-xs text-gray-700 leading-relaxed">
                <p className="font-medium mb-1">No fillable fields found on this page.</p>
                <p className="text-gray-500 mb-2.5">
                  This page might use a custom form (iframe or non-standard inputs) we don't support yet.
                </p>
                <p className="text-gray-500 mb-1">Found a bug? Let us know:</p>
                <a
                  href="https://github.com/myowinthein/job-buddy/issues/new"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 underline font-medium"
                >
                  Report on GitHub
                </a>
              </div>
            )}

            {/* Result summary — normal */}
            {autofillState === 'success' && autofillResult && autofillResult.totalScanned > 0 && (
              <div className="mt-3 flex items-center justify-around text-xs font-semibold rounded-lg border border-gray-200 bg-white py-2 px-3">
                <span className="text-green-600">✓ Filled {autofillResult.filled}</span>
                <span className="text-yellow-600">⚠ Review {autofillResult.review}</span>
                <span className="text-red-500">✗ Unmatched {autofillResult.unmatched}</span>
              </div>
            )}

            {/* Error state */}
            {autofillState === 'error' && (
              <p className="mt-3 text-xs text-red-500 text-center leading-snug">
                Could not connect to page.
                <br />
                Try refreshing and clicking Auto Fill again.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default App;
