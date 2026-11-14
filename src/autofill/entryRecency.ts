// Returns the index of the most recent entry (isCurrent first, then latest startDate).
export function mostRecentIdx(entries: Array<{ startDate?: string; isCurrent?: boolean }>): number {
  if (!entries.length) return 0;
  const current = entries.flatMap((entry, index) => (entry.isCurrent ? [index] : []));
  const candidates = current.length ? current : entries.map((_, index) => index);
  let best = candidates[0];
  for (const index of candidates.slice(1)) {
    if ((entries[index].startDate ?? '') > (entries[best].startDate ?? '')) best = index;
  }
  return best;
}
/** Original profile indices, ordered without changing saved entries or mappings. */
export function recentEntryIndices(
  entries: Array<{ startDate?: string; isCurrent?: boolean }>,
): number[] {
  return entries
    .map((_, index) => index)
    .sort(
      (a, b) =>
        Number(!!entries[b].isCurrent) - Number(!!entries[a].isCurrent) ||
        (entries[a].startDate ?? '').localeCompare(entries[b].startDate ?? '') * -1 ||
        a - b,
    );
}
