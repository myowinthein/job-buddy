// Returns the index of the most recent entry (isCurrent first, then latest startDate).
export function mostRecentIdx(entries: Array<{ startDate?: string; isCurrent?: boolean }>): number {
  if (!entries.length) return 0;
  const currIdx = entries.findIndex((e) => e.isCurrent);
  if (currIdx >= 0) return currIdx;
  let best = 0;
  for (let i = 1; i < entries.length; i++) {
    if ((entries[i].startDate ?? '') > (entries[best].startDate ?? '')) best = i;
  }
  return best;
}
