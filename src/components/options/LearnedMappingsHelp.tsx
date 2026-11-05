import { useEffect, useId, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { useEscapeToClose } from '@/src/components/ui/useEscapeToClose';

export function LearnedMappingsHelp() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);
  const id = useId();
  const close = () => {
    setPinned(false);
    setOpen(false);
  };
  useEscapeToClose(open ? close : undefined);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) {
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
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => {
        if (!pinned && !root.current?.contains(document.activeElement)) setOpen(false);
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
          setPinned(!pinned);
          setOpen(!pinned);
        }}
        className="grid h-8 w-8 place-items-center rounded-md text-gray-500 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:text-gray-400 dark:hover:bg-gray-800"
      >
        <Info aria-hidden="true" className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 w-96 max-w-[calc(100vw-6rem)] pt-2">
          <div
            id={id}
            role="tooltip"
            className="space-y-3 rounded-lg border border-gray-200 bg-white p-3 text-xs leading-relaxed text-gray-600 shadow-lg dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
          >
            <p>
              Job Buddy remembers your corrections to improve future autofills on each site.
            </p>
            <dl className="grid grid-cols-[4.25rem_minmax(0,1fr)] gap-x-3 gap-y-2">
              <dt className="font-medium text-amber-700 dark:text-amber-400">Learning</dt>
              <dd>One manual correction recorded.</dd>
              <dt className="font-medium text-green-700 dark:text-green-400">Trusted</dt>
              <dd>Confirmed again and ready for future autofills.</dd>
              <dt className="font-medium text-gray-500 dark:text-gray-400">Inactive</dt>
              <dd>Saved but excluded from autofill because the mapping needs review.</dd>
            </dl>
            <p>
              Correct a field using your saved profile information, then move to another field
              to record it.
            </p>
            {pinned ? (
              <div className="space-y-2">
                <p>
                  Learning works on detected fields, including those left empty or filled
                  incorrectly. AI answers do not teach mappings.
                </p>
                <p>
                  Mappings can become inactive after a profile entry is removed, an older
                  mapping becomes ambiguous, or you approve making it inactive in a review.
                </p>
                <p>Save an edit here to make the mapping Trusted.</p>
              </div>
            ) : (
              <p className="text-gray-500 dark:text-gray-400">Click for more details</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
