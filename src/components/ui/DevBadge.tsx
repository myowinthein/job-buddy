/** A quiet, shared marker for development builds across extension headers. */
export function DevBadge() {
  if (!import.meta.env.DEV) return null;
  return (
    <span
      title="Development build"
      className="shrink-0 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-semibold tracking-wide text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
    >
      DEV
    </span>
  );
}
