import { useState, useEffect } from 'react';
import { getProfile } from '@/src/utils/storage';
import { calculateCompletion } from '@/src/utils/profileCompletion';

interface AutofillResult {
  filled:    number;
  review:    number;
  unmatched: number;
}

type AutofillState = 'idle' | 'loading' | 'success' | 'error';

function App() {
  const [percentage, setPercentage]       = useState(0);
  const [loading, setLoading]             = useState(true);
  const [autofillState, setAutofillState] = useState<AutofillState>('idle');
  const [autofillResult, setAutofillResult] = useState<AutofillResult | null>(null);

  useEffect(() => {
    getProfile()
      .then((p) => {
        setPercentage(calculateCompletion(p ?? {}).percentage);
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
      const result = await sendToActiveTab({ action: 'AUTOFILL' }) as AutofillResult;
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

  const handleClear = async () => {
    try {
      await sendToActiveTab({ action: 'CLEAR' });
    } catch { /* ignore — page may have already been refreshed */ }
    setAutofillState('idle');
    setAutofillResult(null);
  };

  const color =
    percentage >= 80 ? 'green' : percentage >= 50 ? 'yellow' : 'red';

  const colorMap = {
    red: {
      bar:   'bg-red-500',
      text:  'text-red-600',
      badge: 'bg-red-50 border-red-200',
    },
    yellow: {
      bar:   'bg-yellow-500',
      text:  'text-yellow-600',
      badge: 'bg-yellow-50 border-yellow-200',
    },
    green: {
      bar:   'bg-green-500',
      text:  'text-green-600',
      badge: 'bg-green-50 border-green-200',
    },
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
          {percentage < 100 && (
            <p className="text-xs text-gray-500 mt-2">
              {percentage < 50
                ? 'Complete your profile to start auto-filling job forms'
                : 'Almost there — finish the remaining sections'}
            </p>
          )}
        </div>
      )}

      {/* CTA button */}
      <button
        onClick={openOptions}
        className="w-full py-2.5 px-4 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors mb-4"
      >
        Complete Your Profile
      </button>

      {/* Autofill panel */}
      <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
        <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-3">Autofill</p>

        {/* Auto Fill button */}
        <button
          onClick={handleAutofill}
          disabled={autofillState === 'loading'}
          className="w-full py-2.5 px-4 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors mb-2"
        >
          {autofillState === 'loading' ? 'Filling…' : 'Auto Fill'}
        </button>

        {/* Clear Highlights button */}
        <button
          onClick={handleClear}
          className="w-full py-2 px-4 border border-gray-300 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-100 transition-colors"
        >
          Clear Highlights
        </button>

        {/* Result summary */}
        {autofillState === 'success' && autofillResult && (
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
      </div>
    </div>
  );
}

export default App;
