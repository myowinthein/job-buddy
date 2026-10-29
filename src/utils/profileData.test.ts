import { describe, it, expect } from 'vitest';
import { profileData, hasCredentialSettings } from './profileData';
import { validateImportedProfile } from './profileValidator';
import { generateDiff, applyChanges } from '../resume-ai/parser';
import { settingsReviewProfile } from '../components/options/settingsReviewFixture';

describe('Profile backup privacy boundary', () => {
  it('preserves every canonical profile field, document file and derived value', () => {
    const profile = settingsReviewProfile();
    expect(profileData(profile)).toEqual(profile);
  });
  it('strips unknown properties throughout nested objects and arrays without changing legitimate data', () => {
    const profile = settingsReviewProfile();
    const raw = structuredClone(profile);
    Object.assign(raw, { geminiApiKey: 'root-secret' });
    Object.assign(raw.personal.phone, { geminiApiKey: 'phone-secret' });
    Object.assign(raw.professional.noticePeriod!, { geminiApiKey: 'notice-secret' });
    Object.assign(raw.workHistory[0].location!, { apiKey: 'location-secret' });
    Object.assign(raw.documents.cv.file!, { geminiApiKey: 'document-secret' });
    expect(profileData(raw)).toEqual(profile);
    expect(JSON.stringify(profileData(raw))).not.toContain('secret');
  });
  it('keeps supported legacy strings intact while stripping unknown fields', () => {
    const raw = {
      personal: { phone: 'legacy phone' },
      workHistory: [{ location: 'legacy location' }],
    };
    expect(profileData(raw as never)).toEqual(raw);
  });
  it('strips nested credentials before an imported field is reviewed and saved', () => {
    const { sanitized } = validateImportedProfile({
      professional: {
        noticePeriod: {
          immediate: false,
          value: 1,
          unit: 'month',
          geminiApiKey: 'hidden-key',
        },
      },
    });
    const changes = generateDiff({}, sanitized).map((change) => ({ ...change, accepted: true }));
    const saved = applyChanges({}, changes);
    expect(saved.professional?.noticePeriod).toEqual({ immediate: false, value: 1, unit: 'month' });
    expect(JSON.stringify(saved)).not.toContain('hidden-key');
  });
  it('recognizes credential settings in a JSON bundle without exposing their contents', () => {
    expect(hasCredentialSettings({ profile: { personal: { firstName: 'Jane' } } })).toBe(false);
    expect(
      hasCredentialSettings({ profile: { personal: { phone: { apiKey: 'synthetic' } } } }),
    ).toBe(true);
    expect(hasCredentialSettings({ geminiApiKey: 'synthetic' })).toBe(true);
  });
});
