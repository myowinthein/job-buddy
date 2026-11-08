import type { ReactNode, RefObject } from 'react';
import { useDialogFocus } from './useDialogFocus';
import { useEscapeToClose } from './useEscapeToClose';

/**
 * The backdrop and dialog frame shared by modals: it moves focus into the
 * dialog, closes on Escape or a backdrop click, and ignores both while busy.
 * Callers supply the labelled content and the panel's size classes.
 */
export function ModalShell({
  titleId,
  descriptionId,
  returnFocusRef,
  busy = false,
  onDismiss,
  className,
  children,
}: {
  titleId: string;
  descriptionId?: string;
  returnFocusRef?: RefObject<HTMLElement | null>;
  busy?: boolean;
  onDismiss: () => void;
  className: string;
  children: ReactNode;
}) {
  const dialogRef = useDialogFocus(returnFocusRef);
  const dismiss = busy ? undefined : onDismiss;
  useEscapeToClose(dismiss);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={dismiss}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className={className}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
