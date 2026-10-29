import { useLayoutEffect, useRef, type RefObject } from 'react';

/** Move focus into a modal, contain keyboard navigation, and restore its opener. */
export function useDialogFocus(returnFocusRef?: RefObject<HTMLElement | null>) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previous = returnFocusRef?.current ?? document.activeElement;
    dialog.focus({ preventScroll: true });
    const trapTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const controls = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], summary, input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
        ),
      ).filter((element) => !element.hidden && getComputedStyle(element).display !== 'none');
      const first = controls[0];
      const last = controls[controls.length - 1];
      const active = document.activeElement;
      if (!first) {
        event.preventDefault();
        dialog.focus();
      } else if (event.shiftKey && (active === first || active === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || active === dialog)) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener('keydown', trapTab);
    return () => {
      dialog.removeEventListener('keydown', trapTab);
      if (previous instanceof HTMLElement && previous.isConnected) {
        const restore = () => {
          if (previous.isConnected && !document.activeElement?.closest('[role="dialog"]'))
            previous.focus({ preventScroll: true });
        };
        // A save can unmount the dialog before React re-enables its opener.
        if (previous.matches(':disabled')) queueMicrotask(restore);
        else previous.focus({ preventScroll: true });
      }
    };
  }, [returnFocusRef]);
  return ref;
}
