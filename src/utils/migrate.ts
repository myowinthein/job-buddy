import type { Profile, SalaryPeriod } from '@/src/types/profile';
import { withScheme } from './url';

function isValidPeriod(p: unknown): p is SalaryPeriod {
  return p === 'monthly' || p === 'annual';
}

function normalizeSalary(salary: Profile['salary']): Profile['salary'] {
  if (!salary) return salary;

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

  if (!currentChanged && !expectedChanged) return salary;
  return { current: nextCurrent, expected: nextExpected };
}

// A scheme-less stored URL (e.g. "linkedin.com/in/you") looks "filled" but
// fails native type="url" constraint validation on job sites — this mirrors
// LinksSection.tsx's save-time fix (same withScheme helper) so a profile
// saved before that fix existed gets corrected on next load too, not just on
// the next manual re-save.
function normalizeLinks(links: Profile['links']): Profile['links'] {
  if (!links) return links;

  const nextLinkedin  = links.linkedin  ? withScheme(links.linkedin)  : links.linkedin;
  const nextPortfolio = links.portfolio ? withScheme(links.portfolio) : links.portfolio;

  let nextCustom = links.custom;
  let customChanged = false;
  if (links.custom?.length) {
    const next = links.custom.map((entry) => {
      if (!entry.url) return entry;
      const normalizedUrl = withScheme(entry.url);
      if (normalizedUrl === entry.url) return entry;
      customChanged = true;
      return { ...entry, url: normalizedUrl };
    });
    if (customChanged) nextCustom = next;
  }

  if (nextLinkedin === links.linkedin && nextPortfolio === links.portfolio && !customChanged) return links;
  return { ...links, linkedin: nextLinkedin, portfolio: nextPortfolio, custom: nextCustom };
}

/**
 * Hermetic migration / defaulting layer for stored profiles.
 *
 * Currently applies these rules:
 *   - `salary.current.period` defaults to 'monthly' when missing or invalid
 *   - Each `salary.expected[].period` defaults to 'monthly' when missing or invalid
 *   - `links.linkedin`/`links.portfolio`/each `links.custom[].url` gets a
 *     `https://` scheme added if missing (see normalizeLinks above)
 *
 * Pure: returns the same reference when no migration is needed (so callers
 * can compare with `===` to decide whether to persist back to storage).
 * Returns a new shallow-cloned profile only when something actually changed.
 *
 * All other salary/links fields are preserved verbatim.
 */
export function normalizeProfile(profile: Profile): Profile {
  const salary = normalizeSalary(profile.salary);
  const links  = normalizeLinks(profile.links);

  if (salary === profile.salary && links === profile.links) return profile;
  return { ...profile, salary, links };
}
