// Consent controls require an explicit user choice, regardless of input type.
const CONSENT_TERMS = ['agree', 'terms', 'privacy', 'gdpr', 'consent', 'marketing'];

export function isConsentGroup(group: {
  groupLabel: string;
  options: { label: string }[];
}): boolean {
  return [group.groupLabel, ...group.options.map((option) => option.label)].some((text) =>
    CONSENT_TERMS.some((term) => text.toLowerCase().includes(term)),
  );
}
