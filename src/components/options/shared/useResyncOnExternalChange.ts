import { useState } from 'react';

// Resync local field state when `value` changes to a genuinely different,
// non-empty value on an already-mounted instance (e.g. a list index shift
// after a sibling entry is deleted elsewhere in the profile — these pickers
// are keyed by index, so React reuses the same instance for a different
// entry). Adjusted during render (React's recommended pattern for this)
// rather than via useEffect, so there's no extra commit/flicker between the
// stale and resynced values.
//
// Deliberately skipped when the incoming value is '': callers commonly echo
// their own onChange('') result straight back as this prop mid-edit (e.g.
// MonthYearPicker's onChange('') during partial entry — see CLAUDE.md's
// Known Traps). Resyncing on '' would wipe in-progress field state on every
// ordinary edit of an existing value, not just an actual external reset —
// so only a non-empty external value is treated as one.
export function useResyncOnExternalChange(value: string, onResync: () => void): void {
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (value) onResync();
  }
}
