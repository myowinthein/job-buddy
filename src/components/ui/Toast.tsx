import { useState, useCallback, useRef, useEffect } from 'react';
import { ToastContext } from './useToast';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ToastMessage {
  id:       string;
  type:     'success' | 'error' | 'warning';
  message:  string;
  duration: number;
}

// ── Per-type defaults ─────────────────────────────────────────────────────────

const DEFAULT_DURATION: Record<ToastMessage['type'], number> = {
  success: 2000,
  warning: 2000,
  error:   3500,
};

const TYPE_STYLE = {
  success: {
    bg:      'bg-green-50 dark:bg-green-950/60',
    border:  'border-l-green-500',
    icon:    '✓',
    iconCls: 'text-green-600 dark:text-green-400',
    textCls: 'text-green-800 dark:text-green-200',
  },
  error: {
    bg:      'bg-red-50 dark:bg-red-950/60',
    border:  'border-l-red-500',
    icon:    '✕',
    iconCls: 'text-red-600 dark:text-red-400',
    textCls: 'text-red-800 dark:text-red-200',
  },
  warning: {
    bg:      'bg-yellow-50 dark:bg-yellow-950/60',
    border:  'border-l-yellow-500',
    icon:    '⚠',
    iconCls: 'text-yellow-600 dark:text-yellow-400',
    textCls: 'text-yellow-800 dark:text-yellow-200',
  },
} as const;

// ── ToastItem ─────────────────────────────────────────────────────────────────

function ToastItem({ toast, onRemove }: { toast: ToastMessage; onRemove: () => void }) {
  const [exiting, setExiting] = useState(false);
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitedRef = useRef(false);
  // Keep onRemove fresh inside stable callbacks
  const onRemoveRef = useRef(onRemove);
  useEffect(() => { onRemoveRef.current = onRemove; });

  const dismiss = useCallback(() => {
    if (exitedRef.current) return;
    exitedRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    setExiting(true);
    setTimeout(() => onRemoveRef.current(), 200);
  }, []);

  const startTimer = useCallback(() => {
    timerRef.current = setTimeout(dismiss, toast.duration);
  }, [dismiss, toast.duration]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  useEffect(() => {
    startTimer();
    return stopTimer;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { bg, border, icon, iconCls, textCls } = TYPE_STYLE[toast.type];

  return (
    <div
      onMouseEnter={stopTimer}
      onMouseLeave={startTimer}
      style={{
        animation: exiting ? 'jb-toast-out 200ms ease-in forwards' : 'jb-toast-in 200ms ease-out',
        minWidth:  '280px',
        maxWidth:  '400px',
      }}
      className={`${bg} rounded-lg shadow-lg dark:shadow-black/40 px-4 py-3 flex items-center gap-2 border-l-4 ${border}`}
      role="alert"
      aria-live="polite"
    >
      <span className={`text-base font-bold shrink-0 w-5 text-center ${iconCls}`}>{icon}</span>
      <p className={`text-sm break-words ${textCls}`}>{toast.message}</p>
    </div>
  );
}

// ── ToastProvider ─────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback(
    (type: ToastMessage['type'], message: string, duration?: number) => {
      const id  = crypto.randomUUID();
      const dur = duration ?? DEFAULT_DURATION[type];
      // Prepend so newest toast is first in DOM → visually on top of stack
      setToasts((prev) => [{ id, type, message, duration: dur }, ...prev]);
    },
    [],
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      <style>{`
        @keyframes jb-toast-in {
          from { transform: translateX(calc(100% + 16px)); opacity: 0; }
          to   { transform: translateX(0);                 opacity: 1; }
        }
        @keyframes jb-toast-out {
          from { transform: translateX(0);                 opacity: 1; }
          to   { transform: translateX(calc(100% + 16px)); opacity: 0; }
        }
      `}</style>

      {children}

      {/* Toast stack — top-right aligned with section content area (below banner + padding) */}
      <div
        style={{ position: 'fixed', top: 96, right: 16, zIndex: 9999 }}
        className="flex flex-col gap-2 pointer-events-none"
      >
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <ToastItem toast={toast} onRemove={() => removeToast(toast.id)} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
