import type { FieldChange } from './types';
import type { EntryComparison } from './entryComparison';

export function hasEntryChoices(change: FieldChange): boolean {
  return (
    change.status !== 'unchanged' &&
    !!change.entries?.length &&
    change.entries.every(
      (entry) => entry.currentIndex !== undefined || entry.suggestedIndex !== undefined,
    ) &&
    (change.entryMode === 'replace' || change.entries.some((entry) => entry.status !== 'unchanged'))
  );
}

export const entryIsSelectable = (entry: EntryComparison, replacement = false) =>
  replacement ? entry.suggestedIndex !== undefined : entry.status !== 'unchanged';
export const entryIsSelected = (change: FieldChange, entry: EntryComparison) =>
  entry.accepted ?? change.accepted;

export function selectChange(change: FieldChange, accepted: boolean): FieldChange {
  return {
    ...change,
    accepted,
    ...(change.entries && { entries: change.entries.map((entry) => ({ ...entry, accepted })) }),
  };
}

export function selectEntry(change: FieldChange, index: number, accepted: boolean): FieldChange {
  const entries = change.entries!.map((entry, i) => ({
    ...entry,
    accepted: i === index ? accepted : entryIsSelected(change, entry),
  }));
  return {
    ...change,
    entries,
    accepted: entries.some(
      (entry) =>
        entryIsSelectable(entry, change.entryMode === 'replace') && entryIsSelected(change, entry),
    ),
  };
}

/** Entry choices resolve to one array write, preserving the existing concurrency boundary. */
export function selectedEntryValue(change: FieldChange): unknown {
  if (!hasEntryChoices(change) || !change.entries!.some((entry) => entry.accepted !== undefined))
    return change.suggestedValue;
  const current = Array.isArray(change.currentValue) ? change.currentValue : [];
  const incoming = Array.isArray(change.suggestedValue) ? change.suggestedValue : [];
  const result: unknown[] = [];
  for (const entry of change.entries!) {
    const selected = entryIsSelected(change, entry);
    if (change.entryMode === 'replace') {
      if (selected && entry.suggestedIndex !== undefined)
        result.push(incoming[entry.suggestedIndex]);
    } else if (entry.status === 'unchanged' || (selected && entry.suggestedIndex !== undefined)) {
      if (entry.suggestedIndex !== undefined) result.push(incoming[entry.suggestedIndex]);
    } else if (!selected && entry.currentIndex !== undefined)
      result.push(current[entry.currentIndex]);
  }
  return result;
}

export function reviewCounts(change: FieldChange) {
  const replacement = change.entryMode === 'replace';
  if (change.status === 'unchanged')
    return {
      total: 0,
      selected: 0,
      new: 0,
      changed: 0,
      incoming: 0,
      cleared: 0,
      unchanged: change.hasIncomingValue === false ? 0 : change.entries?.length || 1,
    };
  if (hasEntryChoices(change)) {
    const entries = change.entries!;
    const selectable = entries.filter((entry) => entryIsSelectable(entry, replacement));
    return {
      total: selectable.length,
      selected: selectable.filter((entry) => entryIsSelected(change, entry)).length,
      new: entries.filter((entry) => entry.status === 'new').length,
      changed: entries.filter((entry) => entry.status === 'changed' || entry.status === 'removed')
        .length,
      unchanged: entries.filter((entry) => entry.status === 'unchanged').length,
      incoming: entries.filter((entry) => entry.suggestedIndex !== undefined).length,
      cleared: entries.filter((entry) => entry.status === 'removed').length,
    };
  }
  const clearing = change.hasIncomingValue === false;
  const total = replacement && clearing ? 0 : 1;
  return {
    total,
    selected: change.accepted ? total : 0,
    new: change.status === 'new' ? 1 : 0,
    changed: change.status === 'conflict' ? 1 : 0,
    unchanged: 0,
    incoming: clearing ? 0 : 1,
    cleared: clearing ? 1 : 0,
  };
}
