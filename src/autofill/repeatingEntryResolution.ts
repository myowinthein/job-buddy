import type { Profile } from '../types/profile';
import type { FieldMatch } from './mapper';
import type { CheckboxOption } from './scanner';
import { resolveProfileValue } from './resolver';
import { normalize } from './normalizer';
import { mostRecentIdx } from './profileFieldTree';

// Shared by education/work-history sibling-detection (see
// educationResolution.ts / workHistoryResolution.ts) — same reasoning as
// phoneResolution.ts / languageResolution.ts for why this can't live inside
// mapper.ts: it needs every field's match already computed.
const ADJUSTABLE_LAYERS = new Set(['dictionary_exact', 'fuzzy']);

type EntryWithRecency = { startDate?: string; isCurrent?: boolean };

// Mutates `matches` in place: rewrites unindexed "{prefix}field" markers to
// concrete "{prefix}N.field" paths. A marker appearing once on the page
// resolves to the applicant's most relevant entry (mostRecentIdx — the same
// heuristic driving the Learned Mappings picker's default-expanded entry);
// appearing multiple times, sequential index assignment per occurrence,
// matching a repeated "Add entry" builder.
export function adjustRepeatingEntryMatches(
  matches: FieldMatch[],
  entries: EntryWithRecency[],
  markers: readonly string[],
  prefix: string,
  profile: Profile,
): void {
  for (const marker of markers) {
    const occurrences = matches.filter((m) => m.fieldPath === marker && ADJUSTABLE_LAYERS.has(m.matchLayer));
    if (occurrences.length === 0) continue;

    occurrences.forEach((match, i) => {
      const idx = occurrences.length === 1 ? mostRecentIdx(entries) : i;
      const fieldPath = `${prefix}${idx}.${marker.slice(prefix.length)}`;
      match.fieldPath = fieldPath;
      match.value = resolveProfileValue(profile, fieldPath) || null;
    });
  }
}

// Shared by education/work-history "currently active" checkbox matching.
// Deliberately exact-match only against a domain-specific term allowlist —
// see each caller for why. Only returns checkboxes that should actually be
// checked; an isCurrent-labelled checkbox whose matched entry isn't current
// has nothing useful to report, so it's simply omitted.
export function matchCurrentEntryCheckboxes(
  candidates: CheckboxOption[],
  entries: EntryWithRecency[],
  terms: ReadonlySet<string>,
  prefix: string,
): { element: HTMLInputElement; fieldPath: string }[] {
  const matched = candidates.filter((c) => terms.has(normalize(c.label)));
  if (matched.length === 0) return [];

  const result: { element: HTMLInputElement; fieldPath: string }[] = [];
  matched.forEach((c, i) => {
    const idx = matched.length === 1 ? mostRecentIdx(entries) : i;
    if (entries[idx]?.isCurrent) {
      result.push({ element: c.element, fieldPath: `${prefix}${idx}.isCurrent` });
    }
  });
  return result;
}
