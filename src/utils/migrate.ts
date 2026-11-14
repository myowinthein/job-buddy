import type { Profile, SalaryPeriod } from '@/src/types/profile';
import { withScheme } from './url';

/** Canonical destination for a profile path stored by an older version. */
export function canonicalProfilePath(path: string): string {
  return path === 'links.portfolio' ? 'documents.portfolio.url' : path;
}

/** Move legacy portfolio URLs before projection or validation can discard them. */
export function migratePortfolio<T extends Partial<Profile>>(profile: T): T {
  const links = profile.links as (Profile['links'] & { portfolio?: unknown }) | undefined;
  if (!links || !Object.hasOwn(links, 'portfolio')) return profile;
  const { portfolio: legacy, ...nextLinks } = links;
  if (legacy != null && typeof legacy !== 'string') return profile;
  const url = typeof legacy === 'string' && legacy.trim() ? withScheme(legacy.trim()) : '';
  const documents = profile.documents;
  const current = documents?.portfolio;
  const currentUrl = typeof current?.url === 'string' ? current.url.trim() : '';
  if (url && currentUrl && withScheme(currentUrl) !== url) {
    // Mixed-version backups can contain both URLs. Keep the older URL visible
    // as a selectable custom link in the shared import review.
    const custom = Array.isArray(nextLinks.custom) ? nextLinks.custom : [];
    if (!custom.some((link) => link?.url === url))
      nextLinks.custom = [...custom, { label: 'Previous portfolio', url }];
  }
  return {
    ...profile,
    links: nextLinks,
    ...(url && !currentUrl ? { documents: { ...documents, portfolio: { ...current, url } } } : {}),
  };
}

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

  const fields = ['linkedin', 'github', 'twitter', 'dribbble', 'behance'] as const;
  const normalized = Object.fromEntries(
    fields.map((key) => [key, links[key] ? withScheme(links[key]!) : links[key]]),
  );
  const urlsChanged = fields.some((key) => normalized[key] !== links[key]);

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

  if (!urlsChanged && !customChanged) return links;
  return { ...links, ...normalized, custom: nextCustom };
}

/**
 * Hermetic migration / defaulting layer for stored profiles.
 *
 * Currently applies these rules:
 *   - `salary.current.period` defaults to 'monthly' when missing or invalid
 *   - Each `salary.expected[].period` defaults to 'monthly' when missing or invalid
 *   - `links.linkedin`, document URLs and each `links.custom[].url` get a
 *     `https://` scheme added if missing (see normalizeLinks above)
 *
 * Pure: returns the same reference when no migration is needed (so callers
 * can compare with `===` to decide whether to persist back to storage).
 * Returns a new shallow-cloned profile only when something actually changed.
 *
 * Legacy portfolio URLs move into documents, alongside optional file data.
 */
export function normalizeProfile(profile: Profile): Profile {
  profile = migratePortfolio(profile);
  const salary = normalizeSalary(profile.salary);
  const links = normalizeLinks(profile.links);
  let documents = profile.documents;
  for (const key of ['cv', 'coverLetter', 'portfolio'] as const) {
    const entry = documents?.[key];
    if (!entry?.url || withScheme(entry.url) === entry.url) continue;
    documents = { ...documents, [key]: { ...entry, url: withScheme(entry.url) } };
  }

  if (salary === profile.salary && links === profile.links && documents === profile.documents)
    return profile;
  return { ...profile, salary, links, documents };
}
