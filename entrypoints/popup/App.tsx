import { useState, useEffect } from 'react';
import { getProfile } from '@/src/utils/storage';
import { calculateCompletion } from '@/src/utils/profileCompletion';

function App() {
  const [percentage, setPercentage] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getProfile().then((p) => {
      setPercentage(calculateCompletion(p ?? {}).percentage);
      setLoading(false);
    });
  }, []);

  const openOptions = () => chrome.runtime.openOptionsPage();

  const color =
    percentage >= 80 ? 'green' : percentage >= 50 ? 'yellow' : 'red';

  const colorMap = {
    red: {
      bar: 'bg-red-500',
      text: 'text-red-600',
      badge: 'bg-red-50 border-red-200',
    },
    yellow: {
      bar: 'bg-yellow-500',
      text: 'text-yellow-600',
      badge: 'bg-yellow-50 border-yellow-200',
    },
    green: {
      bar: 'bg-green-500',
      text: 'text-green-600',
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

      {/* Autofill placeholder */}
      <div className="p-4 bg-gray-50 rounded-xl border border-dashed border-gray-300 text-center">
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">Autofill</p>
        <p className="text-sm text-gray-500">Waiting for job form...</p>
      </div>
    </div>
  );
}

export default App;
