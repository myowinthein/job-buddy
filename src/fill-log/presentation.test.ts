import { expect, it } from 'vitest';
import type { FillLogField } from '@/src/autofill/fillLog';
import {
  confidenceText,
  fieldExplanation,
  profileFieldName,
  matchesSearch,
  filterMatches,
} from './presentation';
const field: FillLogField = {
  id: 'field_1',
  label: 'Website',
  kind: 'text',
  outcome: 'review',
  source: 'ai',
  rule: { outcome: 'not_matched', confidence: 0.4 },
  ai: { outcome: 'filled', confidence: 'low', profilePath: 'links.linkedin' },
};
it('uses numeric rule match scores and qualitative AI confidence without inventing AI percentages', () => {
  expect(confidenceText(field)).toBe('Needs review');
  expect(confidenceText({ ...field, source: 'rules' })).toBe('40% match score');
  expect(confidenceText({ ...field, outcome: 'manual', source: 'manual' })).toBeNull();
});
it('searches readable profile names and titles, without exposing internal IDs', () => {
  expect(profileFieldName('education.1.fieldOfStudy')).toBe('Education → Entry 2 → Field Of Study');
  expect(matchesSearch(field, 'linkedin links')).toBe(true);
  expect(matchesSearch(field, 'Website')).toBe(true);
  expect(matchesSearch(field, 'field_1')).toBe(false);
});
it('explains rule retention after AI failure and distinguishes unavailable options from missing data', () => {
  expect(
    fieldExplanation({ ...field, source: 'rules', outcome: 'review', ai: { outcome: 'failed' } }),
  ).toBe('Kept the rule fill because AI was unavailable.');
  expect(
    fieldExplanation({ ...field, source: null, outcome: 'failed', reason: 'option_unavailable' }),
  ).toBe('Your saved value has no matching option on this form.');
});

it('counts actual rule checks independently from final fills and AI handoffs', () => {
  expect(filterMatches.checkedRules(field)).toBe(true);
  expect(filterMatches.rules(field)).toBe(false);
  expect(filterMatches.sentAI(field)).toBe(true);
  expect(
    filterMatches.checkedRules({ ...field, rule: { outcome: 'not_applicable', ran: true } }),
  ).toBe(true);
  expect(
    filterMatches.checkedRules({ ...field, rule: { outcome: 'not_matched', ran: false } }),
  ).toBe(false);
  expect(
    filterMatches.checkedRules({
      ...field,
      rule: { outcome: 'filled', layer: 'learned', ran: true },
    }),
  ).toBe(false);
  expect(filterMatches.checkedRules({ ...field, rule: { outcome: 'not_applicable' } })).toBe(false);
});
