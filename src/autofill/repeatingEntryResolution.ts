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
import { extractSignals, bestLabel } from './signals';
import { composedParent } from './dom';
import {
  ADJUSTABLE_LAYERS,
  scopeRoot,
  entryIndex,
  containsControl,
  sectionFamily,
} from './ruleContext';
import { mostRecentIdx, recentEntryIndices } from './entryRecency';
import { CONF_FILL, CONF_CONTEXT } from './constants';
import { calendarInput } from './calendarInput';

// Shared by education/work-history sibling-detection (see
// educationResolution.ts / workHistoryResolution.ts) — same reasoning as
// phoneResolution.ts / languageResolution.ts for why this can't live inside
// mapper.ts: it needs every field's match already computed.
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

// History rows use current/latest first; other collections retain saved order.
// Rows share an anchor field so missing fields cannot mix two profile entries.
// Every form is independent; shadow field components share their composed form. Explicit learned paths stay unchanged.
export function adjustRepeatingEntryMatches(
  matches: FieldMatch[],
  entries: EntryWithRecency[],
  family: ProfileCollectionPath,
  profile: Profile,
): void {
  // Bare dates/title/summary only acquire meaning inside an identified row
  // section. Never use these labels as global dictionary aliases.
  if (family === 'education' || family === 'workHistory')
    for (const match of matches) {
      if (
        !match.element ||
        (!ADJUSTABLE_LAYERS.has(match.matchLayer) && match.matchLayer !== 'none') ||
        sectionFamily(match.element) !== family
      )
        continue;
      const label = normalize(
        bestLabel(extractSignals(match.element)).replace(/\(optional\)|\(required\)/gi, ''),
      );
      const suffix =
        label === 'startdate' || (calendarInput(match.element) && label === 'from')
          ? 'startDate.formatted'
          : label === 'enddate' || (calendarInput(match.element) && ['to', 'toactualorexpected'].includes(label))
            ? 'endDate.formatted'
            : family === 'workHistory' && label === 'title'
              ? 'title'
              : family === 'workHistory' && label === 'summary'
                ? 'description'
                : undefined;
      if (!suffix) continue;
      match.fieldPath = `${family}.${suffix}`;
      match.confidence = CONF_CONTEXT;
      match.matchLayer = 'context';
    }
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
    const chronological = family === 'education' || family === 'workHistory';
    const ordered = chronological ? recentEntryIndices(entries) : [];
    // Weak guesses remain available for review, but cannot establish a row.
    // An essay mentioning a role must not shift real employment entries.
    const byMarker = markers.map((marker) =>
      group.filter((match) => match.fieldPath === marker && match.confidence >= CONF_FILL),
    );
    const anchors = byMarker.reduce((a, b) => (a.length >= b.length ? a : b), [] as FieldMatch[]);
    for (const match of group) {
      let idx = mostRecentIdx(entries);
      if (anchors.length > 1) {
        const own = byMarker.find((items) => items.includes(match));
        const row =
          match.element && anchors.every((anchor) => anchor.element)
            ? entryIndex(
                match.element,
                anchors.map((anchor) => anchor.element!),
                group.map((field) => field.element!),
              )
            : (own?.indexOf(match) ?? idx);
        idx = chronological ? (ordered[row] ?? entries.length) : row;
      }
      const fieldPath = `${prefix}${idx}.${match.fieldPath!.slice(prefix.length)}`;
      match.fieldPath = fieldPath;
      match.value = resolveProfileValue(profile, fieldPath) || null;
    }
  }
}

/** A structural row's resolved source entry, shared by checkboxes and AI.
 * null means the container spans different entries; never borrow a sibling row. */
export function matchedEntryIndex(
  element: HTMLElement,
  prefix: string,
  fields: ReadonlyArray<{ element?: HTMLElement; fieldPath: string | null }>,
): number | null | undefined {
  if (typeof element?.getRootNode !== 'function') return;
  const scope = scopeRoot(element);
  const relevant = fields.filter(
    (field) =>
      field.element &&
      typeof field.element.getRootNode === 'function' &&
      scopeRoot(field.element) === scope &&
      field.fieldPath?.startsWith(prefix),
  );
  for (let container: Element | null = element; container; container = composedParent(container)) {
    const indices = new Set(
      relevant
        .filter((field) => containsControl(container, field.element!))
        .map((field) => Number(field.fieldPath!.slice(prefix.length).split('.')[0]))
        .filter(Number.isInteger),
    );
    if (indices.size === 1) return [...indices][0];
    if (indices.size > 1) return null;
    if (container.matches('form')) break;
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
  const ordered = recentEntryIndices(entries);
  matched.forEach((c) => {
    const scope = (element: HTMLElement) =>
      typeof element?.getRootNode === 'function' ? scopeRoot(element) : undefined;
    const siblings = matched.filter((other) => scope(other.element) === scope(c.element));
    const resolved = matchedEntryIndex(c.element, prefix, matches);
    if (resolved === null) return;
    const idx = resolved ?? ordered[siblings.indexOf(c)] ?? entries.length;
    if (entries[idx]?.isCurrent) {
      result.push({ element: c.element, fieldPath: `${prefix}${idx}.isCurrent` });
    }
  });
  return result;
}
