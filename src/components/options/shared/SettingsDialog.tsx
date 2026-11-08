import { useId, type ReactNode } from 'react';
import { ModalShell } from '@/src/components/ui/ModalShell';

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
  return (
    <ModalShell
      titleId={titleId}
      busy={busy}
      onDismiss={onDismiss}
      className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 max-h-[90dvh] overflow-y-auto outline-none"
    >
      <h3 id={titleId} className="text-base font-semibold text-gray-900 dark:text-gray-100">
        {title}
      </h3>
      {children}
    </ModalShell>
  );
}
