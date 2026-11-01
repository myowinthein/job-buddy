import type { ReactNode } from 'react';
import { Check, CircleAlert, Info, LoaderCircle } from 'lucide-react';

export type PopupNoticeTone = 'info' | 'working' | 'success' | 'review' | 'error' | 'neutral';

const tones = {
  info: 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-950/30',
  working: 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-950/30',
  success: 'border-green-500 bg-green-50 dark:border-green-400 dark:bg-green-950/25',
  review: 'border-amber-500 bg-amber-50 dark:border-amber-400 dark:bg-amber-950/25',
  error: 'border-red-500 bg-red-50 dark:border-red-400 dark:bg-red-950/25',
  neutral: 'border-gray-300 bg-gray-50 dark:border-gray-600 dark:bg-gray-800/60',
};
const iconColors = {
  info: 'text-blue-700 dark:text-blue-400',
  working: 'text-blue-700 dark:text-blue-400',
  success: 'text-green-700 dark:text-green-400',
  review: 'text-amber-700 dark:text-amber-400',
  error: 'text-red-700 dark:text-red-400',
  neutral: 'text-gray-500 dark:text-gray-400',
};

/** One message surface for setup, progress, results, and recoverable failures. */
export function PopupNotice({
  tone,
  children,
  urgent = false,
}: {
  tone: PopupNoticeTone;
  children: ReactNode;
  urgent?: boolean;
}) {
  const Icon =
    tone === 'working'
      ? LoaderCircle
      : tone === 'success'
        ? Check
        : tone === 'error' || tone === 'review'
          ? CircleAlert
          : Info;
  return (
    <div
      role={tone === 'error' || urgent ? 'alert' : 'status'}
      aria-atomic="true"
      className={`flex items-start gap-2.5 rounded-lg border-l-2 p-3 ${tones[tone]}`}
    >
      <Icon
        aria-hidden="true"
        className={`mt-0.5 h-4 w-4 shrink-0 ${iconColors[tone]} ${tone === 'working' ? 'animate-spin motion-reduce:animate-none' : ''}`}
      />
      <div className="min-w-0 flex-1 text-xs leading-relaxed text-gray-700 dark:text-gray-200">
        {children}
      </div>
    </div>
  );
}
