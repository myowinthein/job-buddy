import { useId, type ReactNode } from 'react';
import { useDialogFocus } from '@/src/components/ui/useDialogFocus';
import { useEscapeToClose } from '@/src/components/ui/useEscapeToClose';

export function SettingsDialog({
  title,
  busy = false,
  onDismiss,
  children,
}: {
  title: string;
  busy?: boolean;
  onDismiss: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const dialogRef = useDialogFocus();
  const dismiss = busy ? undefined : onDismiss;
  useEscapeToClose(dismiss);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={dismiss}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 max-h-[90dvh] overflow-y-auto outline-none"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id={titleId} className="text-base font-semibold text-gray-900 dark:text-gray-100">
          {title}
        </h3>
        {children}
      </div>
    </div>
  );
}
