import { describe, expect, it } from 'vitest';
import { AUTOFILL_ERROR, isAISetupError, isProfileSetupError, isSetupError } from './errorCodes';

describe('autofill error codes', () => {
  it('keeps the strings persisted in runs and sent between contexts', () => {
    expect(AUTOFILL_ERROR).toEqual({
      failed: 'autofill_failed',
      pageChanged: 'page_changed',
      profileSetupRequired: 'profile_setup_required',
      profileUnavailable: 'profile_unavailable',
      aiSetupRequired: 'ai_setup_required',
      aiSettingsUnavailable: 'ai_settings_unavailable',
    });
  });

  it.each([
    ['profile_setup_required', true, false],
    ['profile_unavailable', true, false],
    ['ai_setup_required', false, true],
    ['ai_settings_unavailable', false, true],
    ['autofill_failed', false, false],
    ['page_changed', false, false],
    [undefined, false, false],
    [null, false, false],
    ['', false, false],
  ])('classifies %s as profile setup %s and AI setup %s', (error, profile, ai) => {
    expect([isProfileSetupError(error), isAISetupError(error), isSetupError(error)]).toEqual([
      profile,
      ai,
      profile || ai,
    ]);
  });
});
