import { createPreviewChrome } from '@/src/preview/chrome';
import type { Profile } from '@/src/types/profile';

/** A preview `chrome` holding the profile and a synthetic Gemini key, with dev seeding off. */
export function geminiSeededChrome(profile: Partial<Profile>, extra: Record<string, unknown> = {}) {
  return createPreviewChrome(profile, undefined, {
    initialData: {
      profile,
      geminiApiKey: 'synthetic-key',
      geminiModel: 'gemini-3.8-flash',
      geminiDevDisabled: true,
      ...extra,
    },
  });
}
