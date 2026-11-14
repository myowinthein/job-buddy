import type { FieldSignals } from './signals';

/** Degree selectors often omit honours or prefix the same degree with College. */
export function educationChoiceAliases(signals: FieldSignals, value: string): string[] {
  const question = signals.label || signals.ariaLabel || signals.placeholder;
  if (!/\b(?:degree|highest\s+(?:level\s+of\s+)?education)\b/i.test(question)) return [];
  const degree = value
    .trim()
    .replace(/\s*\((?:hono[u]?rs|hons\.?)\)\s*$/i, '')
    .replace(/\s+(?:with\s+)?hono[u]?rs\s*$/i, '')
    .trim();
  if (!/^(?:Bachelor|Master) of [\p{L}][\p{L}\s&-]*$/u.test(degree)) return [];
  return [degree, `College - ${degree}`];
}
