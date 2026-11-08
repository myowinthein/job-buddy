import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useAnchoredPanel } from '@/src/components/options/shared/useAnchoredPanel';
import { useEscapeToClose } from './useEscapeToClose';

const PANEL_WIDTH = 384;
const PANEL_MAX_HEIGHT = 360;
const CLOSE_DELAY_MS = 150;

/** An info button whose panel opens on hover or focus and stays open when clicked. */
export function HelpPopover({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const position = useAnchoredPanel(open, root, PANEL_WIDTH, PANEL_MAX_HEIGHT, true);
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
    }, CLOSE_DELAY_MS);
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
        aria-label={label}
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
            {children}
          </div>,
          document.body,
        )}
    </div>
  );
}
