import { expect, it } from 'vitest';
import { fillStages, defaultStage } from './stages';
import type { FillLogField } from '@/src/autofill/fillLog';
const field: FillLogField = {
  id: 'one',
  label: 'Name',
  kind: 'text',
  source: 'rules',
  outcome: 'review',
  learned: { status: 'unconfirmed', confirmations: 1, profilePath: 'personal.firstName' },
  rule: {
    ran: true,
    outcome: 'filled',
    layer: 'dictionary_exact',
    matchConfidence: 0.85,
    confidence: 0.7,
    profilePath: 'personal.firstName',
  },
  ai: { outcome: 'failed' },
};
it('keeps original match scores and actual write uncertainty separate', () => {
  const stages = fillStages(field);
  expect(stages[0].details).toContainEqual({ label: 'Confirmations', value: '1' });
  expect(stages[1].details).toContainEqual({ label: 'Match score', value: '85%' });
  expect(stages[1].details).toContainEqual({ label: 'Option matching', value: 'Needs review' });
  expect(defaultStage(field, stages)).toBe('rules');
});
it('keeps learned trust distinct from score and disables the skipped Rules stage', () => {
  const learned: FillLogField = {
    ...field,
    learned: { status: 'trusted', confirmations: 2 },
    rule: { ...field.rule, ran: false, layer: 'learned', matchConfidence: 0.97 },
    ai: {
      outcome: 'refined',
      confidence: 'high',
      optionReview: true,
      profilePath: 'personal.firstName',
    },
    source: 'ai',
  };
  const stages = fillStages(learned);
  expect(stages[0].details.some((detail) => detail.label === 'Match score')).toBe(false);
  expect(stages[1].enabled).toBe(false);
  expect(stages[2].details).toContainEqual({ label: 'Confidence', value: 'High' });
  expect(stages[2].details).toContainEqual({ label: 'Option matching', value: 'Needs review' });
  expect(defaultStage(learned, stages)).toBe('ai');
});
it('does not invent a learned check or confirmation count for legacy reports', () => {
  const old = { ...field, learned: undefined };
  expect(fillStages(old)[0]).toMatchObject({ enabled: false, result: 'Not recorded', details: [] });
  const legacyLearned = { ...old, rule: { ...field.rule, layer: 'learned' as const } };
  expect(fillStages(legacyLearned)[0]).toMatchObject({
    enabled: true,
    result: 'Matched and filled',
  });
  expect(
    fillStages(legacyLearned)[0].details.some((detail) => detail.label === 'Confirmations'),
  ).toBe(false);
});
it('leaves stages disabled when they did not run', () => {
  const excluded: FillLogField = {
    ...field,
    outcome: 'excluded',
    source: null,
    learned: { status: 'not_checked' },
    rule: { outcome: 'not_applicable', ran: false },
    ai: { outcome: 'not_sent' },
  };
  expect(fillStages(excluded).every((stage) => !stage.enabled)).toBe(true);
  expect(defaultStage(excluded, fillStages(excluded))).toBeNull();
});

it('does not claim a manual answer change when AI was cancelled or the profile changed', () => {
  for (const skipReason of ['cancelled', 'profile_changed'] as const) {
    const stages = fillStages({ ...field, ai: { outcome: 'skipped', skipReason } });
    expect(stages[2].result).not.toContain('Your answer changed');
    expect(stages[2].enabled).toBe(true);
  }
});
