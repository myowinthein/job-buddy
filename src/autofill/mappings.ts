import type { FieldSignals } from './signals';
import { extractSignals, displayLabel } from './signals';
import { normalize } from './normalizer';
import { saveLearnedMapping } from '../utils/storage';
import type { LearnedMappings } from '../types/storage';

// Saves a learned field→profilePath mapping for every normalised signal text
// extracted from an element (name, id, placeholder, ariaLabel, label).
// nearbyText is excluded from the matching signals: Layer 0 never reads it
// back (mapper.ts only checks label/ariaLabel/placeholder/name/id), so saving
// it as a matching key would be a dead write. It's still used as a display
// label fallback via displayLabel — see signals.ts.
// Best-effort — callers may wrap in try/catch or fire-and-forget with void.
export async function saveElementMappings(
  domain: string,
  element: HTMLElement,
  fieldPath: string,
): Promise<void> {
  const sigs = extractSignals(element);
  const texts = [
    sigs.name, sigs.id, sigs.placeholder, sigs.ariaLabel, sigs.label,
  ].filter(Boolean);
  // The normalized signal key (lowercased, punctuation/spaces stripped) is not
  // human-readable — carry a display label through for the Learned Mappings UI
  // instead of showing the raw key there.
  const label = displayLabel(sigs);
  for (const text of texts) {
    const norm = normalize(text);
    if (norm) await saveLearnedMapping(domain, norm, fieldPath, label);
  }
}

// Opportunistically backfills a missing/stale display label on an *existing*
// learned-mapping entry when the same field is scanned again later — covers
// entries written before label capture existed, and ones where the page's
// wording changed since. Never touches path/count (trust is unaffected).
// Legacy string-format entries are left alone; saveLearnedMapping's own
// upgrade path already handles those on the next real confirmation.
// Mutates `mappings` in place and returns whether anything changed, so
// callers can batch many fields into a single storage write per scan instead
// of one write per field.
export function refreshLearnedLabels(
  domain: string,
  signals: FieldSignals,
  mappings: LearnedMappings,
): boolean {
  const domainMap = mappings[domain];
  if (!domainMap) return false;

  const label = displayLabel(signals);
  if (!label) return false;

  const texts = [
    signals.name, signals.id, signals.placeholder, signals.ariaLabel, signals.label,
  ].filter(Boolean);

  let changed = false;
  for (const text of texts) {
    const norm = normalize(text);
    if (!norm) continue;
    const existing = domainMap[norm];
    if (existing === undefined || typeof existing === 'string') continue;
    if (existing.label === label) continue;
    domainMap[norm] = { ...existing, label };
    changed = true;
  }
  return changed;
}
