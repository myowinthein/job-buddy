import type { WorkHistoryEntry } from '../types/profile';

export interface ExperienceSummary {
  totalMonths: number;
  years: number;
  months: number;
  label: string; // human-readable, e.g. "8 years 6 months"
}

// Parses a "YYYY-MM" date string into an absolute month index (year*12 + month).
// Returns null if the string is missing or malformed.
function toAbsoluteMonth(dateStr: string | undefined): number | null {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  const year = parseInt(parts[0] ?? '', 10);
  const month = parseInt(parts[1] ?? '', 10);
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) return null;
  return year * 12 + month;
}

function currentAbsoluteMonth(): number {
  const now = new Date();
  return now.getFullYear() * 12 + (now.getMonth() + 1);
}

// Calculates total experience from a list of work history entries.
//
// Algorithm:
//   1. Convert each entry to a [start, end] interval in absolute months.
//   2. Skip entries with a missing or invalid start date.
//   3. Sort intervals by start.
//   4. Merge overlapping/adjacent intervals (standard interval-merge).
//   5. Sum the durations of the merged intervals.
//
// Limitation: if two roles overlap exactly (e.g. two simultaneous part-time
// jobs), the overlapping period is counted only once, which is the correct
// behaviour for total experience.
export function calculateExperience(
  workHistory: WorkHistoryEntry[] | undefined,
): ExperienceSummary {
  const intervals: [number, number][] = [];

  for (const entry of workHistory ?? []) {
    const start = toAbsoluteMonth(entry.startDate);
    if (start === null) continue;

    const end = entry.isCurrent
      ? currentAbsoluteMonth()
      : toAbsoluteMonth(entry.endDate);

    if (end === null || end < start) continue;

    intervals.push([start, end]);
  }

  if (intervals.length === 0) {
    return { totalMonths: 0, years: 0, months: 0, label: 'No experience recorded yet' };
  }

  // Sort by start ascending
  intervals.sort((a, b) => a[0] - b[0]);

  // Merge overlapping intervals
  const merged: [number, number][] = [intervals[0]!];
  for (let i = 1; i < intervals.length; i++) {
    const current = intervals[i]!;
    const last = merged[merged.length - 1]!;
    if (current[0] <= last[1]) {
      // Overlapping — extend the last merged interval if needed
      last[1] = Math.max(last[1], current[1]);
    } else {
      merged.push(current);
    }
  }

  const totalMonths = merged.reduce((sum, [s, e]) => sum + (e - s), 0);
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;

  let label: string;
  if (years === 0) {
    label = `${months} month${months !== 1 ? 's' : ''}`;
  } else if (months === 0) {
    label = `${years} year${years !== 1 ? 's' : ''}`;
  } else {
    label = `${years} year${years !== 1 ? 's' : ''} ${months} month${months !== 1 ? 's' : ''}`;
  }

  return { totalMonths, years, months, label };
}
