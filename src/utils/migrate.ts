import type { Profile, SalaryPeriod } from '@/src/types/profile';

function isValidPeriod(p: unknown): p is SalaryPeriod {
  return p === 'monthly' || p === 'annual';
}

/**
 * Hermetic migration / defaulting layer for stored profiles.
 *
 * Currently applies one rule:
 *   - `salary.current.period` defaults to 'monthly' when missing or invalid
 *   - Each `salary.expected[].period` defaults to 'monthly' when missing or invalid
 *
 * Pure: returns the same reference when no migration is needed (so callers
 * can compare with `===` to decide whether to persist back to storage).
 * Returns a new shallow-cloned profile only when something actually changed.
 *
 * All other salary fields (country, currency, amount) are preserved verbatim.
 */
export function normalizeProfile(profile: Profile): Profile {
  const salary = profile.salary;
  if (!salary) return profile;

  // Current salary
  let nextCurrent = salary.current;
  let currentChanged = false;
  if (salary.current && !isValidPeriod(salary.current.period)) {
    nextCurrent = { ...salary.current, period: 'monthly' };
    currentChanged = true;
  }

  // Expected salary array
  let nextExpected = salary.expected;
  let expectedChanged = false;
  if (salary.expected?.length) {
    let anyEntryChanged = false;
    const next = salary.expected.map((entry) => {
      if (!isValidPeriod(entry.period)) {
        anyEntryChanged = true;
        return { ...entry, period: 'monthly' as SalaryPeriod };
      }
      return entry;
    });
    if (anyEntryChanged) {
      nextExpected = next;
      expectedChanged = true;
    }
  }

  if (!currentChanged && !expectedChanged) return profile;

  return {
    ...profile,
    salary: {
      current: nextCurrent,
      expected: nextExpected,
    },
  };
}
