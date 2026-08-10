import { useEffect } from 'react';

// Pass the exact same handler a dialog's backdrop-click already uses —
// including `undefined` (e.g. `isSaving ? undefined : onClose`) — so Escape
// never bypasses a guard that already blocks backdrop-click dismissal while
// an in-progress operation can't be safely interrupted.
export function useEscapeToClose(onClose: (() => void) | undefined): void {
  useEffect(() => {
    if (!onClose) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);
}
