import { extractSignals } from './signals';
import { normalize } from './normalizer';
import { saveLearnedMapping } from '../utils/storage';

// Saves a learned field→profilePath mapping for every normalised signal text
// extracted from an element (name, id, placeholder, ariaLabel, label, nearbyText).
// Best-effort — callers may wrap in try/catch or fire-and-forget with void.
export async function saveElementMappings(
  domain: string,
  element: HTMLElement,
  fieldPath: string,
): Promise<void> {
  const sigs = extractSignals(element);
  const texts = [
    sigs.name, sigs.id, sigs.placeholder, sigs.ariaLabel, sigs.label, sigs.nearbyText,
  ].filter(Boolean);
  for (const text of texts) {
    const norm = normalize(text);
    if (norm) await saveLearnedMapping(domain, norm, fieldPath);
  }
}
