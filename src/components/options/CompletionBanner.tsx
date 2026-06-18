import { useState } from 'react';
import type { CompletionGroup } from '@/src/utils/profileCompletion';

interface CompletionBannerProps {
  percentage: number;
  missingGroups: CompletionGroup[];
  onNavigate: (sectionId: string) => void;
  onFocusField: (sectionId: string, fieldLabel: string) => void;
}

export function CompletionBanner({
  percentage,
  missingGroups,
  onNavigate,
  onFocusField,
}: CompletionBannerProps) {
  const [showMissing, setShowMissing] = useState(false);

  const totalMissing = missingGroups.reduce((sum, g) => sum + g.fields.length, 0);
  const barColor = percentage >= 80 ? 'bg-green-500' : percentage >= 50 ? 'bg-yellow-500' : 'bg-red-500';
  const textColor = percentage >= 80 ? 'text-green-700' : percentage >= 50 ? 'text-yellow-700' : 'text-red-700';

  const close = () => setShowMissing(false);

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4 shrink-0">
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-sm font-medium text-gray-700">Profile</span>
        <span className={`text-sm font-bold ${textColor}`}>{percentage}%</span>
      </div>

      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {totalMissing > 0 && (
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setShowMissing((s) => !s)}
            className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 transition-colors"
          >
            <span className="w-4 h-4 rounded-full bg-amber-100 text-amber-700 text-xs flex items-center justify-center font-bold">
              {totalMissing}
            </span>
            missing {showMissing ? '▲' : '▼'}
          </button>

          {showMissing && (
            <div className="absolute right-0 top-full mt-1 w-72 bg-white rounded-lg shadow-lg border border-gray-200 z-50 py-2">
              <p className="text-xs font-semibold text-gray-500 px-3 pb-1.5 border-b border-gray-100">
                Missing required fields
              </p>
              <ul className="max-h-64 overflow-y-auto py-1">
                {missingGroups.map((group) => (
                  <li key={group.sectionId}>
                    <button
                      type="button"
                      onClick={() => { onNavigate(group.sectionId); close(); }}
                      className="w-full text-left px-3 py-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 hover:bg-blue-50 transition-colors"
                    >
                      {group.sectionLabel} →
                    </button>
                    <ul>
                      {group.fields.map((field) => (
                        <li key={field}>
                          <button
                            type="button"
                            onClick={() => { onFocusField(group.sectionId, field); close(); }}
                            className="w-full text-left flex items-center gap-2 px-5 py-1 text-xs text-gray-600 hover:text-blue-600 hover:bg-blue-50 transition-colors rounded"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                            {field}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {percentage === 100 && (
        <span className="text-xs text-green-600 font-medium shrink-0">✓ Complete</span>
      )}
    </div>
  );
}
