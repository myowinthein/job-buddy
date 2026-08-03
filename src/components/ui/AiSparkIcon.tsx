// Original 4-point spark glyph (not Google's Gemini mark) — avoids trademarked
// logo usage while still signaling "AI-powered". currentColor drives the
// active/inactive color swap via the wrapping className.
export function AiSparkIcon({ active, onClick }: { active: boolean; onClick?: () => void }) {
  const clickable = !active && !!onClick;
  return (
    <svg
      viewBox="0 0 24 24"
      className={`w-5 h-5 shrink-0 transition-colors ${
        active ? 'text-blue-500 dark:text-blue-400 animate-spark-pulse' : 'text-gray-300 dark:text-gray-600'
      } ${clickable ? 'cursor-pointer hover:text-gray-400 dark:hover:text-gray-500' : ''}`}
      fill="currentColor"
      role={clickable ? 'button' : 'img'}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onClick : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } } : undefined}
      aria-label={active ? 'AI-assisted autofill is on' : 'AI-assisted autofill is off — click to add your Gemini API key'}
    >
      <path d="M12 2c.4 2.8 1.1 4.8 2.2 5.9C15.3 9 17.2 9.7 20 10.1c-2.8.4-4.7 1.1-5.8 2.2-1.1 1.1-1.8 3-2.2 5.7-.4-2.8-1.1-4.6-2.2-5.7C8.7 11.2 6.8 10.5 4 10.1c2.8-.4 4.7-1.1 5.8-2.2C10.9 6.8 11.6 4.8 12 2z" />
      <path d="M18.5 15c.2 1.3.5 2.2 1 2.7.5.5 1.4.8 2.7 1-1.3.2-2.2.5-2.7 1-.5.5-.8 1.4-1 2.7-.2-1.3-.5-2.2-1-2.7-.5-.5-1.4-.8-2.7-1 1.3-.2 2.2-.5 2.7-1 .5-.5.8-1.4 1-2.7z" />
    </svg>
  );
}
