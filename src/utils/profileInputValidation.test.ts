import { describe, expect, it } from 'vitest';
import { isLinkedInUrl, isValidProfileEmail } from './profileInputValidation';
import { validateImportedProfile } from './profileValidator';

describe('profile input and import validation agree', () => {
  it.each(["o'brien@example.com", 'jane+jobs@sub.example.co.uk'])(
    'preserves editor-valid email %s in imports',
    (email) => {
      expect(isValidProfileEmail(email)).toBe(true);
      expect(validateImportedProfile({ personal: { email } }).sanitized.personal?.email).toBe(
        email,
      );
    },
  );

  it.each(['not-an-email', 'has space@example.com', `${'a'.repeat(250)}@example.com`])(
    'rejects invalid email %s',
    (email) => {
      expect(isValidProfileEmail(email)).toBe(false);
      expect(validateImportedProfile({ personal: { email } }).valid).toBe(false);
    },
  );

  it.each([
    'linkedin.com/in/jane',
    'https://www.linkedin.com/in/jane',
    'https://uk.linkedin.com/in/jane',
  ])('accepts LinkedIn hostname %s', (url) => {
    expect(isLinkedInUrl(url)).toBe(true);
    expect(validateImportedProfile({ links: { linkedin: url } }).valid).toBe(true);
  });

  it.each([
    'https://linkedin.com.evil.test/in/jane',
    'https://example.com/linkedin.com',
    'https://linkedin.com@evil.test',
    'not linkedin.com',
  ])('rejects misleading LinkedIn URL %s', (url) => {
    expect(isLinkedInUrl(url)).toBe(false);
    expect(validateImportedProfile({ links: { linkedin: url } }).valid).toBe(false);
  });
});
