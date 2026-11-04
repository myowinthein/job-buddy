import {
  PROFILE_ENTRY_PATHS,
  PROFILE_MAPPING_PATH_TEMPLATES,
  type ProfileCollectionPath,
} from '../profile/fieldCatalog';
import { FIELD_DICTIONARY } from './dictionary';
import type { Profile } from '../types/profile';
import type { FieldMatch } from './mapper';
import type { CheckboxOption } from './scanner';
import { resolveProfileValue } from './resolver';
import { normalize } from './normalizer';
import { composedParent } from './dom';
import { scopeRoot, entryIndex, containsControl, sectionFamily } from './ruleContext';
import { mostRecentIdx } from './entryRecency';

// Shared by education/work-history sibling-detection (see
// educationResolution.ts / workHistoryResolution.ts) — same reasoning as
// phoneResolution.ts / languageResolution.ts for why this can't live inside
// mapper.ts: it needs every field's match already computed.
const ADJUSTABLE_LAYERS = new Set(['dictionary_exact', 'fuzzy', 'context']);

type EntryWithRecency = { startDate?: string; isCurrent?: boolean };

const mappingTemplates = new Set(PROFILE_MAPPING_PATH_TEMPLATES);
const repeatingMarkers = new Map(
  PROFILE_ENTRY_PATHS.map((family) => [
    family,
    Object.keys(FIELD_DICTIONARY).filter(
      (path) =>
        path.startsWith(`${family}.`) &&
        mappingTemplates.has(`${family}.$${path.slice(family.length)}`),
    ),
  ]),
);

export function repeatingEntryMarkers(family: ProfileCollectionPath): readonly string[] {
  return repeatingMarkers.get(family) ?? [];
}

// Resolve a single entry to the most relevant profile entry. Repeated rows
// share an anchor field so missing fields cannot mix two profile entries.
// Every form is independent; shadow field components share their composed form. Explicit learned paths stay unchanged.
export function adjustRepeatingEntryMatches(
  matches: FieldMatch[],
  entries: EntryWithRecency[],
  family: ProfileCollectionPath,
  profile: Profile,
): void {
  const markers = repeatingEntryMarkers(family);
  const prefix = `${family}.`;
  const candidates = matches.filter(
    (match) =>
      match.fieldPath &&
      markers.includes(match.fieldPath) &&
      (ADJUSTABLE_LAYERS.has(match.matchLayer) ||
        (match.matchLayer === 'learned' && match.learnedScope === 'field')),
  );
  const scopes = new Map<Node | undefined, FieldMatch[]>();
  for (const match of candidates) {
    const scope = match.element ? scopeRoot(match.element) : undefined;
    const group = scopes.get(scope) ?? [];
    group.push(match);
    scopes.set(scope, group);
  }
  for (const group of scopes.values()) {
    const byMarker = markers.map((marker) => group.filter((match) => match.fieldPath === marker));
    const anchors = byMarker.reduce((a, b) => (a.length >= b.length ? a : b), [] as FieldMatch[]);
    for (const match of group) {
      let idx = mostRecentIdx(entries);
      if (anchors.length > 1) {
        const own = byMarker.find((items) => items.includes(match))!;
        idx =
          match.element && anchors.every((anchor) => anchor.element)
            ? entryIndex(
                match.element,
                anchors.map((anchor) => anchor.element!),
                group.map((field) => field.element!),
              )
            : own.indexOf(match);
      }
      const fieldPath = `${prefix}${idx}.${match.fieldPath!.slice(prefix.length)}`;
      match.fieldPath = fieldPath;
      match.value = resolveProfileValue(profile, fieldPath) || null;
    }
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
  matches: FieldMatch[] = [],
): { element: HTMLElement; fieldPath: string }[] {
  const family = prefix.slice(0, -1) as 'education' | 'workHistory';
  const matched = candidates.filter((c) => {
    if (!terms.has(normalize(c.label))) return false;
    const section = sectionFamily(c.element);
    if (section && section !== family) return false;
    return normalize(c.label) !== 'noenddate' || section === family;
  });
  if (matched.length === 0) return [];

  const result: { element: HTMLElement; fieldPath: string }[] = [];
  matched.forEach((c, i) => {
    let idx = matched.length === 1 ? mostRecentIdx(entries) : i;
    const fields = matches.filter((match) => match.element && match.fieldPath?.startsWith(prefix));
    for (
      let container =
        typeof c.element?.getRootNode === 'function' ? composedParent(c.element) : null;
      container;
      container = composedParent(container)
    ) {
      const indices = new Set(
        fields
          .filter((match) => containsControl(container, match.element!))
          .map((match) => Number(match.fieldPath!.split('.')[1])),
      );
      if (indices.size === 1) {
        idx = [...indices][0];
        break;
      }
      if (indices.size > 1) break;
    }
    if (entries[idx]?.isCurrent) {
      result.push({ element: c.element, fieldPath: `${prefix}${idx}.isCurrent` });
    }
  });
  return result;
}
