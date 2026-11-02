import { useEffect, useId, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { useEscapeToClose } from '@/src/components/ui/useEscapeToClose';

export function LearnedMappingsHelp() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const pinned = useRef(false);
  const id = useId();
  const close = () => {
    pinned.current = false;
    setOpen(false);
  };
  useEscapeToClose(open ? close : undefined);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) {
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
      className="relative shrink-0"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => {
        if (!pinned.current && !root.current?.contains(document.activeElement)) setOpen(false);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) close();
      }}
    >
      <button
        type="button"
        aria-label="How learned mappings work"
        aria-expanded={open}
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
      {open && (
        <div className="absolute right-0 top-full z-40 w-80 max-w-[calc(100vw-6rem)] pt-2">
          <div
            id={id}
            role="tooltip"
            className="space-y-2 rounded-lg border border-gray-200 bg-white p-3 text-xs leading-relaxed text-gray-600 shadow-lg dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
          >
            <p>
              Job Buddy learns when you correct a form field and leave it. Two matching
              confirmations make a mapping trusted.
            </p>
            <p>
              Saving a correction here makes it trusted immediately. AI answers do not teach
              mappings.
            </p>
            <p>
              Trusted mappings apply when the question matches and profile data is available.
              Inactive mappings stay saved but do not fill fields.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
