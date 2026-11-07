/** Error codes carried between the run coordinator, content scripts, popup and Quick Fill. */
export const AUTOFILL_ERROR = {
  failed: 'autofill_failed',
  pageChanged: 'page_changed',
  profileSetupRequired: 'profile_setup_required',
  profileUnavailable: 'profile_unavailable',
  aiSetupRequired: 'ai_setup_required',
  aiSettingsUnavailable: 'ai_settings_unavailable',
} as const;

const PROFILE_SETUP_ERRORS: readonly string[] = [
  AUTOFILL_ERROR.profileSetupRequired,
  AUTOFILL_ERROR.profileUnavailable,
];
const AI_SETUP_ERRORS: readonly string[] = [
  AUTOFILL_ERROR.aiSetupRequired,
  AUTOFILL_ERROR.aiSettingsUnavailable,
];

export const isProfileSetupError = (error?: string | null): boolean =>
  PROFILE_SETUP_ERRORS.includes(error ?? '');
export const isAISetupError = (error?: string | null): boolean =>
  AI_SETUP_ERRORS.includes(error ?? '');
export const isSetupError = (error?: string | null): boolean =>
  isProfileSetupError(error) || isAISetupError(error);
