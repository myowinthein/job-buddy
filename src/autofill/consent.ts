// Match consent requests, not departments/job titles that happen to mention
// marketing, privacy or agreements. Ambiguous consent remains a user decision.
export function isConsentGroup(group: {
  groupLabel: string;
  options: { label: string }[];
}): boolean {
  if (
    /^(?:terms|privacy|marketing)(?:\s+(?:agreement|permission|acceptance|preferences))?[?*: ]*$/i.test(
      group.groupLabel.trim(),
    )
  )
    return true;
  return [group.groupLabel, ...group.options.map((option) => option.label)].some((text) => {
    const value = text.toLowerCase();
    return (
      /\b(consent|gdpr|agree|agreement|terms)\b/.test(value) ||
      /^privacy[?*: ]*$/.test(value.trim()) ||
      /\b(i\s+agree|agree\s+to|agreement\s+to|accept\s+(?:the\s+)?terms|terms\s+(?:and|of)|privacy\s+(?:policy|notice|statement))\b/.test(
        value,
      ) ||
      /\b(accept|allow|authori[sz]e|permission|agree)\b.*\b(process(?:ing)?|collect(?:ion)?|stor(?:e|age)|shar(?:e|ing))\b.*\b(data|information)\b/.test(
        value,
      ) ||
      /\b(receive|subscribe|opt[ -]?in|send\s+me)\b.*\b(marketing|promotional|newsletter|updates|communications)\b/.test(
        value,
      )
    );
  });
}
