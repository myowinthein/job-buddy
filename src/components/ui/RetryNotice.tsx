import type { ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';
import { Notice } from './Notice';

export function RetryNotice({
  children,
  onRetry,
  busy = false,
}: {
  children: ReactNode;
  onRetry: () => void;
  busy?: boolean;
}) {
  return (
    <Notice tone="error">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p>{children}</p>
        <button
          type="button"
          onClick={onRetry}
          disabled={busy}
          aria-busy={busy}
          className="inline-flex items-center gap-1.5 rounded-sm text-blue-600 underline text-action disabled:opacity-50 dark:text-blue-400"
        >
          {busy && (
            <LoaderCircle
              aria-hidden="true"
              className="h-3 w-3 shrink-0 animate-spin motion-reduce:animate-none"
            />
          )}
          Retry
        </button>
      </div>
    </Notice>
  );
}
