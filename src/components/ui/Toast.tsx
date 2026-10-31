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
  warning: 6000,
  error:   8000,
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
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remainingRef = useRef(toast.duration);
  const startedRef = useRef(0);
  const hoveredRef = useRef(false);
  const focusedRef = useRef(false);
  const exitedRef = useRef(false);
  // Keep onRemove fresh inside stable callbacks
  const onRemoveRef = useRef(onRemove);
  useEffect(() => { onRemoveRef.current = onRemove; });

  const dismiss = useCallback(() => {
    if (exitedRef.current) return;
    exitedRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    setExiting(true);
    exitTimerRef.current = setTimeout(() => onRemoveRef.current(), 200);
  }, []);

  const startTimer = useCallback(() => {
    if (timerRef.current || exitedRef.current || hoveredRef.current || focusedRef.current) return;
    startedRef.current = Date.now();
    timerRef.current = setTimeout(dismiss, remainingRef.current);
  }, [dismiss]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedRef.current));
    }
  }, []);

  useEffect(() => {
    startTimer();
    return () => {
      stopTimer();
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    };
  }, [startTimer, stopTimer]);

  const { bg, border, icon, iconCls, textCls } = TYPE_STYLE[toast.type];

  return (
    <div
      onMouseEnter={() => { hoveredRef.current = true; stopTimer(); }}
      onMouseLeave={() => { hoveredRef.current = false; startTimer(); }}
      onFocus={() => { focusedRef.current = true; stopTimer(); }}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        focusedRef.current = false;
        startTimer();
      }}
      style={{
        animation: exiting ? 'jb-toast-out 200ms ease-in forwards' : 'jb-toast-in 200ms ease-out',
        minWidth: 'min(280px, calc(100vw - 32px))',
        maxWidth: 'min(400px, calc(100vw - 32px))',
      }}
      className={`${bg} rounded-lg shadow-lg dark:shadow-black/40 px-4 py-3 flex items-center gap-2 border-l-4 ${border}`}
      role="alert"
      aria-live="polite"
    >
      <span aria-hidden="true" className={`text-base font-bold shrink-0 w-5 text-center ${iconCls}`}>{icon}</span>
      <p className={`min-w-0 flex-1 text-sm break-words ${textCls}`}>{toast.message}</p>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={dismiss}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded text-lg ${textCls}`}
      >
        <span aria-hidden="true">×</span>
      </button>
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
