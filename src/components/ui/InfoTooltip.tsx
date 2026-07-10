// Hover tooltip using Tailwind peer pattern: the ⓘ span is the peer;
// the following sibling reveals itself on peer-hover.
// align="right" anchors the panel to the right of the icon (for right-side items
// that would otherwise overflow the popup edge).
export function InfoTooltip({ text, align = 'left' }: { text: string; align?: 'left' | 'right' }) {
  const anchor = align === 'right' ? 'right-0' : 'left-0';
  return (
    <span className="relative inline-flex shrink-0">
      <span className="peer text-[10px] leading-none text-gray-400 dark:text-gray-500 cursor-default select-none">ⓘ</span>
      <span className={`pointer-events-none absolute bottom-full ${anchor} z-50 mb-1.5 w-44 rounded-md bg-gray-800 dark:bg-gray-700 px-2 py-1.5 text-[11px] leading-snug text-white shadow-md opacity-0 peer-hover:opacity-100 transition-opacity`}>
        {text}
      </span>
    </span>
  );
}
