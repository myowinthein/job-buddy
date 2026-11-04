import type { FieldSignals } from './signals';
import { FIELD_DICTIONARY } from './dictionary';
import { normalize } from './normalizer';

export const learningQuestion = (signals: FieldSignals): string =>
  (signals.label || signals.ariaLabel || signals.placeholder).trim();

export function genericLearnedSignal(text: string): boolean {
  return /^(?:enter(?:your)?(?:answer|response|text|value)?|select(?:one|option)?|choose(?:one)?|answer|response|value|text|field\d*|typehere|typeyourresponse|youranswer|starttyping|singlelinetext|egquestions|usernameornumber|yyyy|mmddyyyy)$/.test(
    text,
  );
}

/** Only generic repeated-field wording should follow row position. */
export function repeatedLearnedMarker(path: string): string | null {
  let marker = path
    .replace(/^(education|workHistory|languages)\.\d+\./, '$1.')
    .replace(/^salary\.expected\.\d+\./, 'salary.expected.');
  if (marker === path) return null;
  if (/^(education|workHistory)\.(startDate|endDate)$/.test(marker)) marker += '.formatted';
  if (marker === 'salary.expected.amount') marker = 'salary.expected.formatted';
  return FIELD_DICTIONARY[marker] ? marker : null;
}

export function hasGenericEntryLabel(path: string, signals: FieldSignals): boolean {
  const marker = repeatedLearnedMarker(path);
  return (
    !!marker &&
    [signals.label, signals.ariaLabel].some((text) =>
      FIELD_DICTIONARY[marker].includes(normalize(text)),
    )
  );
}

export function learnedSensitiveQuestion(path: string, signals: FieldSignals): boolean {
  const text = learningQuestion(signals);
  if (path.startsWith('personal.dateOfBirth')) return /\b(birth|dob)\b/i.test(text);
  if (path === 'derived.age') return /\bage\b/i.test(text);
  const checks: Record<string, RegExp> = {
    'personal.gender': /\b(gender|sex)\b/i,
    'personal.ethnicity': /\b(ethnicity|ethnic|race|racial)\b/i,
    'personal.veteranStatus': /\bveteran\b/i,
    'personal.disabilityStatus': /\b(disability|disabled)\b/i,
  };
  return !checks[path] || checks[path].test(text);
}
