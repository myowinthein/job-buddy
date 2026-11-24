import type { FieldSignals } from './signals';

/** Degree selectors often omit honours or prefix the same degree with College. */
export function educationChoiceAliases(
  signals: FieldSignals,
  value: string,
  options: string[] = [],
): string[] {
  const question = signals.label || signals.ariaLabel || signals.placeholder;
  const degree = value
    .trim()
    .replace(/\s*\((?:hono[u]?rs|hons\.?)\)\s*$/i, '')
    .replace(/\s+(?:with\s+)?hono[u]?rs\s*$/i, '')
    .trim();
  const degreeQuestion = /\b(?:degree|highest\s+(?:level\s+of\s+)?education)\b/i.test(question);
  const aliases =
    degreeQuestion && /^(?:Bachelor|Master) of [\p{L}][\p{L}\s&-]*$/u.test(degree)
      ? [degree, `College - ${degree}`]
      : [];
  if (/\b(?:level\s+of\s+education|education\s+level)\b/i.test(question)) {
    const level = /\bbachelor/i.test(value)
      ? /\bbachelor/i
      : /\bmaster/i.test(value)
        ? /\bmaster(?!\s*1\b)/i
        : /\b(?:doctor|ph\.?d)/i.test(value)
          ? /\b(?:doctor|ph\.?d)/i
          : null;
    const matches = level ? options.filter((option) => level.test(option)) : [];
    if (matches.length === 1) aliases.push(matches[0]);
  }
  return aliases;
}
