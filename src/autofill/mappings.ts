import type { FieldSignals } from './signals';
import { extractSignals, displayLabel } from './signals';
import { normalize } from './normalizer';
import { getProfile, getLearningContext, saveLearnedObservation } from '../utils/storage';
import type { LearningContext } from '../types/storage';
import { genericLearnedSignal, hasGenericEntryLabel, learningQuestion } from './learnedContext';
import { isLearnedPath, safeMappingKey } from '../utils/learnedMappingData';

// Saves a learned field→profilePath mapping for every normalised signal text
// extracted from an element (name, id, placeholder, ariaLabel, label).
// nearbyText is excluded from the matching signals: Layer 0 never reads it
// back (mapper.ts only checks label/ariaLabel/placeholder/name/id), so saving
// it as a matching key would be a dead write. It's still used as a display
// label fallback via displayLabel — see signals.ts.
// Best-effort — callers may wrap in try/catch or fire-and-forget with void.
export async function saveElementMappings(
  domain: string,
  element: HTMLElement | FieldSignals,
  fieldPath: string,
  context?: LearningContext,
): Promise<void> {
  const sigs = element instanceof HTMLElement ? extractSignals(element) : element;
  const texts = [sigs.name, sigs.id, sigs.placeholder, sigs.ariaLabel, sigs.label].filter(Boolean);
  // The normalized signal key (lowercased, punctuation/spaces stripped) is not
  // human-readable — carry a display label through for the Learned Mappings UI
  // instead of showing the raw key there.
  const label = displayLabel(sigs);
  const signals = [
    ...new Set(
      texts.map(normalize).filter((key) => safeMappingKey(key) && !genericLearnedSignal(key)),
    ),
  ];
  if (!signals.length || !isLearnedPath(fieldPath)) return;
  const profile = context ? null : await getProfile();
  const captured = context ?? (profile ? await getLearningContext(profile) : null);
  if (!captured) return;
  const question = learningQuestion(sigs);
  await saveLearnedObservation(domain, {
    signals,
    path: fieldPath,
    ...(label ? { label } : {}),
    ...(question ? { question } : {}),
    context: captured,
    ...(repeatedLearnedPath(fieldPath)
      ? { scope: hasGenericEntryLabel(fieldPath, sigs) ? 'field' : 'entry' }
      : {}),
  });
}

const repeatedLearnedPath = (path: string) =>
  /^(education|workHistory|languages)\.\d+\.|^salary\.expected\.\d+\./.test(path);
