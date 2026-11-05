import { useEffect, useId, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useAnchoredPanel } from '@/src/components/options/shared/useAnchoredPanel';
import { useEscapeToClose } from '@/src/components/ui/useEscapeToClose';

export function LearnedMappingsHelp() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const position = useAnchoredPanel(open, root, 384, 360, true);
  const [pinned, setPinned] = useState(false);
  const id = useId();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  const close = () => {
    clearTimeout(closeTimer.current);
    setPinned(false);
    setOpen(false);
  };
  const enter = () => {
    clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const leave = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      if (!pinned && !root.current?.contains(document.activeElement)) setOpen(false);
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
        setPinned(false);
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
        aria-label="How learned mappings work"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-describedby={open ? id : undefined}
        onFocus={() => setOpen(true)}
        onClick={() => {
          setPinned(!pinned);
          setOpen(!pinned);
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
            className="z-40 overflow-y-auto overscroll-contain space-y-3 rounded-lg border border-gray-200 bg-white p-3 text-xs leading-relaxed text-gray-600 shadow-lg dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
          >
            <p>Job Buddy remembers your corrections to improve future autofills on each site.</p>
            <dl className="grid grid-cols-[4.25rem_minmax(0,1fr)] gap-x-3 gap-y-2">
              <dt className="font-medium text-amber-700 dark:text-amber-400">Learning</dt>
              <dd>One manual correction recorded.</dd>
              <dt className="font-medium text-green-700 dark:text-green-400">Trusted</dt>
              <dd>Confirmed again and ready for future autofills.</dd>
              <dt className="font-medium text-gray-500 dark:text-gray-400">Inactive</dt>
              <dd>Saved but excluded from autofill because the mapping needs review.</dd>
            </dl>
            <p>Use Review Mappings to let AI check your saved matches.</p>
          </div>,
          document.body,
        )}
    </div>
  );
}
