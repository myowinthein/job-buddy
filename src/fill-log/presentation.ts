import { catalogProfileFieldName } from '@/src/profile/fieldMetadata';
import { finalFillSource, type FillLogField } from '@/src/autofill/fillLog';

export const sourceNames = {
  learned: 'Learned mappings',
  rules: 'Rules',
  ai: 'AI',
  manual: 'Manual',
};
export const ruleMethods: Record<string, string> = {
  learned: 'Learned mapping',
  autocomplete: 'Autocomplete attribute',
  dictionary_exact: 'Exact dictionary match',
  fuzzy: 'Similar field label',
  custom_link: 'Custom link label',
  checkbox_status: 'Current-status checkbox',
  context: 'Nearby context',
  none: 'No match',
};
const names: Record<string, string> = {
  personal: 'Personal',
  address: 'Address',
  links: 'Links',
  documents: 'Documents',
  professional: 'Work History',
  workHistory: 'Work History',
  education: 'Education',
  languages: 'Languages',
  salary: 'Salary',
  workAuthorization: 'Work Authorization',
  derived: 'Personal',
  linkedin: 'LinkedIn',
  github: 'GitHub',
  cv: 'CV',
  url: 'URL',
  full: 'Full number',
  callingCode: 'Calling code',
  countryCode: 'Country',
  countryName: 'Country',
  availableDate: 'Available date',
  formatted: 'Formatted value',
};
function words(value: string): string {
  return (
    names[value] ??
    value
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/_/g, ' ')
      .replace(/^./, (c) => c.toUpperCase())
  );
}
export function profileFieldName(path?: string): string | null {
  if (!path) return null;
  const catalogName = catalogProfileFieldName(path);
  if (catalogName) return catalogName;
  const parts = path.split('.');
  if (parts[0] === 'derived' && /currentCompany|currentTitle|totalExperience/.test(parts[1] ?? ''))
    parts[0] = 'workHistory';
  return parts
    .map((part) => (/^\d+$/.test(part) ? 'Entry ' + (Number(part) + 1) : words(part)))
    .join(' → ');
}
export function profileMatch(field: FillLogField): string | undefined {
  return field.ai.outcome === 'missing_data' || field.source === 'ai'
    ? (field.ai.profilePath ?? field.rule.profilePath)
    : (field.rule.profilePath ?? field.ai.profilePath);
}
export function checkedBy(field: FillLogField): string {
  const stages: string[] = [];
  if (field.rule.outcome !== 'not_applicable')
    stages.push(field.rule.layer === 'learned' ? 'learned mappings' : 'rules');
  if (field.ai.outcome !== 'not_sent') stages.push('AI');
  return stages.length ? 'Checked by ' + stages.join(' and ') : 'No matching stage applied';
}
export function fieldExplanation(field: FillLogField): string {
  if (field.reason === 'consent') return 'Consent is left for you to decide.';
  if (field.reason === 'manual_clear') return 'You cleared this answer.';
  if (field.reason === 'option_unavailable')
    return 'Your saved value has no matching option on this form.';
  if (field.outcome === 'manual')
    return field.reason === 'value_changed'
      ? 'Your answer changed while AI was checking.'
      : 'You updated this answer on the form.';
  if (field.outcome === 'kept') return 'Kept your existing answer.';
  if (field.outcome === 'excluded') return 'This field was excluded from autofill.';
  if (field.outcome === 'missing_data') return 'No usable saved data for this profile field.';
  if (field.outcome === 'failed')
    return profileMatch(field) || field.ai.confidence
      ? 'Match found, but the form did not accept the value.'
      : 'This control became unavailable before it could be filled.';
  if (field.outcome === 'not_matched') {
    if (field.ai.outcome === 'failed')
      return 'No safe rule fill was available. AI assistance was unavailable.';
    if (field.ai.outcome === 'no_response') return 'AI returned no answer for this field.';
    if (field.reason === 'value_changed') return 'Your answer changed while AI was checking.';
    return profileMatch(field)
      ? 'A possible match could not be used safely.'
      : 'No suitable profile match was found.';
  }
  if (field.ai.outcome === 'refined') return 'AI refined an earlier fill.';
  if (field.source === 'rules' && field.ai.outcome === 'failed')
    return field.rule.layer === 'learned'
      ? 'Kept the learned fill because AI was unavailable.'
      : 'Kept the rule fill because AI was unavailable.';
  return '';
}
export function confidenceText(field: FillLogField): string | null {
  const source = finalFillSource(field);
  if (source === 'manual' || source === 'learned') return null;
  if (source === 'ai')
    return field.ai.confidence === 'high'
      ? 'High confidence'
      : field.ai.confidence === 'low'
        ? 'Needs review'
        : null;
  return source && typeof field.rule.confidence === 'number'
    ? Math.round(field.rule.confidence * 100) + '% match score'
    : null;
}
export function statusLabel(field: FillLogField): string {
  return {
    high_confidence: 'High confidence',
    review: 'Needs review',
    not_matched: 'Not filled',
    missing_data: 'Missing data',
    failed: 'Not filled',
    kept: 'Kept current',
    excluded: 'Skipped',
    manual: 'Confirmed by you',
  }[field.outcome];
}
export function wasCheckedByRules(field: FillLogField): boolean {
  return (
    field.rule.layer !== 'learned' && (field.rule.ran ?? field.rule.outcome !== 'not_applicable')
  );
}
export type OutcomeFilter = 'all' | 'filled' | 'notFilled' | 'kept' | 'skipped';
export type ColorFilter = 'green' | 'yellow' | 'red' | 'gray';
export type SourceFilter = 'learned' | 'rules' | 'ai' | 'manual';
export type FilterId = OutcomeFilter | ColorFilter | SourceFilter | 'sentAI' | 'checkedRules';
export const filterMatches: Record<FilterId, (field: FillLogField) => boolean> = {
  all: () => true,
  filled: (field) => ['high_confidence', 'review', 'manual'].includes(field.outcome),
  notFilled: (field) => ['not_matched', 'missing_data', 'failed'].includes(field.outcome),
  kept: (field) => field.outcome === 'kept',
  skipped: (field) => field.outcome === 'excluded',
  green: (field) => ['high_confidence', 'manual'].includes(field.outcome),
  yellow: (field) => field.outcome === 'review',
  red: (field) => ['not_matched', 'failed'].includes(field.outcome),
  gray: (field) => field.outcome === 'missing_data',
  learned: (field) => finalFillSource(field) === 'learned',
  rules: (field) => finalFillSource(field) === 'rules',
  ai: (field) => finalFillSource(field) === 'ai',
  manual: (field) => finalFillSource(field) === 'manual',
  sentAI: (field) => field.ai.outcome !== 'not_sent',
  checkedRules: wasCheckedByRules,
};
export function matchesSearch(field: FillLogField, query: string): boolean {
  const text = [
    field.label,
    profileFieldName(field.rule.profilePath),
    profileFieldName(field.ai.profilePath),
  ]
    .join(' ')
    .toLocaleLowerCase();
  return query
    .toLocaleLowerCase()
    .trim()
    .split(/\s+/)
    .every((word) => text.includes(word));
}
