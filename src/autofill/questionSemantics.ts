import type { FieldSignals } from './signals';

export function primaryQuestion(
  signals: Pick<FieldSignals, 'label' | 'ariaLabel' | 'placeholder'> &
    Partial<Pick<FieldSignals, 'name' | 'id'>>,
): string {
  return (
    signals.label || signals.ariaLabel || signals.placeholder || signals.name || signals.id || ''
  );
}

/** The profile stores one street line, and gender identity rather than birth sex. */
export function unsupportedQuestion(text: string): boolean {
  text = text.replace(/[_-]+/g, ' ');
  return (
    /\b(?:address|street(?:\s+address)?)\s*(?:line\s*)?[2-9]\b|\b(?:second|third)\s+(?:address|street)\s+line\b/i.test(
      text,
    ) || /\b(?:sex|gender)\s+(?:assigned\s+at\s+birth|at\s+birth)\b|\bbirth\s+sex\b/i.test(text)
  );
}

/** Literal profile requests with ordinary form instructions, not fuzzy prose. */
export function directProfileQuestion(text: string): string | null {
  const name =
    /^(?:please\s+)?(?:(?:provide|enter)\s+)?(?:your\s+)?(?:\(?legal\)?\s+)?(first|given|last|family|sur)\s*name\s*[*:.?]*$/i.exec(
      text.trim(),
    );
  if (name) return /^(first|given)$/i.test(name[1]) ? 'personal.firstName' : 'personal.lastName';
  if (
    /^(?:(?:personal|professional|profile)\s+)?summary\s*(?:[*:]|\(optional\))?\s*(?:$|this\s+(?:section|field)\s+is\s+optional\b)/i.test(
      text.trim(),
    )
  )
    return 'professional.summary';
  if (
    /^(?:do\s+you\s+have\s+(?:the\s+)?right\s+to\s+work\b|are\s+you\s+(?:legally\s+)?(?:authori[sz]ed|eligible)\s+to\s+work\b)/i.test(
      text.trim(),
    ) &&
    !/\b(?:expire|expiry|sponsor)\b/i.test(text)
  )
    return 'workAuthorization';
  return null;
}
