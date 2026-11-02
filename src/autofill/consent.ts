// Match consent requests, not departments/job titles that happen to mention
// marketing, privacy or agreements. Ambiguous consent remains a user decision.
export function isConsentGroup(group: {
  groupLabel: string;
  name?: string;
  options: { label: string }[];
}): boolean {
  const words = (text: string) => text.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim();
  if (
    /^(?:terms|privacy|marketing)(?:\s+(?:agreement|permission|acceptance|preferences|opt\s+in))?[?*: ]*$/i.test(
      words(group.groupLabel),
    )
  )
    return true;
  return [group.groupLabel, group.name ?? '', ...group.options.map((option) => option.label)].some((text) => {
    const value = words(text).toLowerCase();
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
