// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { RULE_PROFILE } from './ruleMatching.fixture';
import { extractSignals } from './signals';
import { mapField } from './mapper';
import { aiQuestionAllowed, allowedAIPath } from './aiSafety';

it.each([
  'How would you describe your hands-on experience with AWS, Terraform and cloud infrastructure in production environments?',
  'Can you describe a service you developed and helped deploy to production? Which parts of the code, infrastructure and security were you responsible for?',
  'Explain how you resolved a disagreement with a colleague.',
  'Give an example of a project you led.',
  'Tell us about a time you made a mistake.',
  'Why are you interested in this position?',
  'What attracted you to this role?',
])('keeps the narrative question manual despite a plausible summary mapping: %s', (question) => {
  document.body.innerHTML = '<label><textarea id="summary" name="summary"></textarea></label>';
  const input = document.querySelector<HTMLTextAreaElement>('textarea')!;
  input.parentElement!.prepend(question);
  const signals = extractSignals(input);
  const mappings = { 'example.test': { summary: { path: 'professional.summary', count: 2 } } };
  expect(mapField(signals, RULE_PROFILE, mappings, 'example.test')).toMatchObject({
    ruleBlocked: true,
    fieldPath: null,
  });
  expect(aiQuestionAllowed(input)).toBe(false);
  expect(
    allowedAIPath(
      RULE_PROFILE,
      { fieldId: 'summary', type: 'text', label: question },
      'professional.summary',
    ),
  ).toBe(false);
  const profile = {
    ...RULE_PROFILE,
    workHistory: [
      { ...RULE_PROFILE.workHistory[0], description: 'Synthetic job responsibilities' },
    ],
  };
  expect(
    allowedAIPath(
      profile,
      { fieldId: 'description', type: 'text', label: question },
      'workHistory.0.description',
    ),
  ).toBe(false);
});

it.each([
  ['Professional summary', 'professional.summary'],
  ['Job responsibilities', 'workHistory.1.description'],
  ['How many years of experience do you have?', 'professional.experience'],
  ['When can you start?', 'professional.noticePeriod.formatted'],
])('keeps direct profile questions eligible: %s', (question) => {
  document.body.innerHTML = '<label><textarea></textarea></label>';
  const input = document.querySelector<HTMLTextAreaElement>('textarea')!;
  input.parentElement!.prepend(question);
  expect(mapField(extractSignals(input), RULE_PROFILE, {}, 'example.test').ruleBlocked).not.toBe(
    true,
  );
  expect(aiQuestionAllowed(input)).toBe(true);
});

it('allows a structured choice to describe a saved status', () => {
  document.body.innerHTML =
    '<label>How would you describe your work authorization?<select><option>Citizen</option></select></label>';
  expect(aiQuestionAllowed(document.querySelector('select')!)).toBe(true);
});

it('does not let generic writing instructions override a direct saved-profile field', () => {
  document.body.innerHTML =
    '<label>Professional summary<textarea placeholder="Describe your background"></textarea></label>';
  const input = document.querySelector('textarea')!;
  expect(aiQuestionAllowed(input)).toBe(true);
  expect(
    allowedAIPath(
      RULE_PROFILE,
      {
        fieldId: 'summary',
        type: 'text',
        label: 'Professional summary',
        placeholder: 'Describe your background',
      },
      'professional.summary',
    ),
  ).toBe(true);
});
