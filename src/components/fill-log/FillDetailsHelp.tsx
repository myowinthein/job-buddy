import { useEffect, useId, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useAnchoredPanel } from '@/src/components/options/shared/useAnchoredPanel';
import { useEscapeToClose } from '@/src/components/ui/useEscapeToClose';

export function FillDetailsHelp() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const position = useAnchoredPanel(open, root, 384, 360, true);
  const pinned = useRef(false);
  const id = useId();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  const close = () => {
    clearTimeout(closeTimer.current);
    pinned.current = false;
    setOpen(false);
  };
  const enter = () => {
    clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const leave = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      if (!pinned.current && !root.current?.contains(document.activeElement)) setOpen(false);
    }, 150);
  };
  useEscapeToClose(open ? close : undefined);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !root.current?.contains(event.target) &&
        !panel.current?.contains(event.target)
      ) {
        pinned.current = false;
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  return (
    <div
      ref={root}
      className="shrink-0"
      onMouseEnter={enter}
      onMouseLeave={leave}
      onBlur={(event) => {
        if (
          !event.currentTarget.contains(event.relatedTarget) &&
          !panel.current?.contains(event.relatedTarget)
        )
          close();
      }}
    >
      <button
        type="button"
        aria-label="How Fill Details works"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-describedby={open ? id : undefined}
        onFocus={() => setOpen(true)}
        onClick={() => {
          pinned.current = !pinned.current;
          setOpen(pinned.current);
        }}
        className="grid h-8 w-8 place-items-center rounded-md text-gray-500 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:text-gray-400 dark:hover:bg-gray-800"
      >
        <Info aria-hidden="true" className="h-4 w-4" />
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            onMouseEnter={enter}
            onMouseLeave={leave}
            style={position}
            id={id}
            role="tooltip"
            className="z-40 space-y-3 overflow-y-auto overscroll-contain rounded-lg border border-gray-200 bg-white p-3 text-xs leading-relaxed text-gray-600 shadow-lg dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
          >
            <p className="text-pretty">
              For each field, autofill tries learned mappings → rules → AI and stops when it finds a
              reliable answer.
            </p>
            <p>Each fill attempt can have one of these results:</p>
            <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-2 [&_dd]:text-balance">
              <dt className="font-medium text-green-700 dark:text-green-400">Green</dt>
              <dd>Filled, high confidence or confirmed by you.</dd>
              <dt className="font-medium text-amber-700 dark:text-amber-400">Yellow</dt>
              <dd>Filled, but needs your review.</dd>
              <dt className="font-medium text-red-700 dark:text-red-400">Red</dt>
              <dd>Not filled, no safe match or the form rejected it.</dd>
              <dt className="font-medium text-gray-500 dark:text-gray-400">Gray</dt>
              <dd>Not filled, profile match found but no saved data.</dd>
            </dl>
            <div className="space-y-1 text-pretty">
              <p>Fields such as consent questions are always skipped.</p>
              <p>Existing answers are kept in “Empty fields only” mode.</p>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
