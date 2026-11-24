import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { LoaderCircle, Trash2 } from 'lucide-react';
import { RemoveButton } from './RemoveButton';

interface Props {
  onConfirm: () => void;
  title?: string;
  action?: 'Delete' | 'Clear' | 'Remove';
  confirm?: boolean;
  text?: boolean;
  compact?: boolean;
  disabled?: boolean;
  busy?: boolean;
  leadingAction?: ReactNode;
}

export function ConfirmRemoveButton({
  onConfirm,
  title = 'Remove entry',
  action = 'Delete',
  confirm = true,
  text = false,
  compact = false,
  disabled = false,
  busy = false,
  leadingAction,
}: Props) {
  const [armed, setArmed] = useState(false);
  const container = useRef<HTMLSpanElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const wasBusy = useRef(false);
  const confirming = armed || busy;
  const locked = disabled || busy;
  const buttonPadding = compact ? 'px-1.5' : 'px-2.5';
  const focusTrigger = () => {
    container.current?.querySelector<HTMLButtonElement>('[aria-hidden="false"] > button:last-child')?.focus({ preventScroll: true });
  };
  const cancel = () => {
    setArmed(false);
    requestAnimationFrame(focusTrigger);
  };
  useLayoutEffect(() => {
    if (armed) confirmButton.current?.focus({ preventScroll: true });
  }, [armed]);
  useEffect(() => {
    if (wasBusy.current && !busy) focusTrigger();
    wasBusy.current = busy;
  }, [busy]);
  useEffect(() => {
    if (!armed || busy) return;
    const dismiss = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setArmed(false);
    };
    document.addEventListener('mousedown', dismiss);
    return () => document.removeEventListener('mousedown', dismiss);
  }, [armed, busy]);
  const remove = () => {
    if (locked) return;
    setArmed(false);
    onConfirm();
  };
  const request = () => (confirm ? setArmed(true) : remove());
  return (
    <span
      ref={container}
      className={`inline-grid shrink-0 items-center align-middle whitespace-nowrap ${text ? 'justify-items-start' : 'justify-items-end'}`}
      onKeyDown={(event) => {
        if (armed && !locked && event.key === 'Escape') {
          event.stopPropagation();
          cancel();
        }
      }}
    >
      <span
        aria-hidden={!confirming}
        className={`col-start-1 row-start-1 inline-flex items-center ${compact ? 'gap-1' : 'gap-2'} ${confirming ? '' : 'invisible pointer-events-none'}`}
      >
        <button
          ref={confirmButton}
          type="button"
          onClick={remove}
          disabled={locked}
          aria-busy={busy}
          className={`inline-flex items-center gap-1.5 text-xs ${buttonPadding} py-1 bg-red-600 dark:bg-red-700 text-white rounded-md hover:bg-red-700 dark:hover:bg-red-600 active:scale-95 transition-colors`}
        >
          {busy && <LoaderCircle aria-hidden="true" className="h-3 w-3 shrink-0 animate-spin motion-reduce:animate-none" />}
          {busy ? 'Deleting…' : action}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={locked}
          className={`text-xs ${buttonPadding} py-1 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-95 transition-colors`}
        >
          Cancel
        </button>
      </span>
      <span
        aria-hidden={confirming}
        className={`col-start-1 row-start-1 inline-flex items-center gap-1 ${confirming ? 'invisible pointer-events-none' : ''}`}
      >
        {leadingAction}
        {text ? (
          <button
            type="button"
            onClick={request}
            disabled={locked}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400 text-action"
          >
            <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
            {title}
          </button>
        ) : (
          <RemoveButton title={title} onClick={request} disabled={locked} />
        )}
      </span>
    </span>
  );
}
