import { describe, it, expect } from 'vitest';
import { validateImportedProfile } from './profileValidator';

describe('validateImportedProfile', () => {
  it('returns invalid for null input', () => {
    const result = validateImportedProfile(null);
    expect(result.valid).toBe(false);
    expect(result.invalidFields[0]?.path).toBe('root');
  });

  it('returns invalid for non-object input', () => {
    expect(validateImportedProfile('string').valid).toBe(false);
    expect(validateImportedProfile(42).valid).toBe(false);
  });

  it('returns valid and empty sanitized for an empty object', () => {
    const result = validateImportedProfile({});
    expect(result.valid).toBe(true);
    expect(result.sanitized).toEqual({});
  });

  it('accepts valid personal fields', () => {
    const result = validateImportedProfile({
      personal: {
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        phone: { countryCode: 'TH', callingCode: '+66', number: '812345678' },
        dateOfBirth: '1990-01-15',
        gender: 'female',
        veteranStatus: 'no',
        disabilityStatus: 'no',
      },
    });
    expect(result.valid).toBe(true);
    expect(result.sanitized.personal?.firstName).toBe('Jane');
    expect(result.sanitized.personal?.email).toBe('jane@example.com');
  });

  it('rejects invalid email', () => {
    const result = validateImportedProfile({ personal: { email: 'not-an-email' } });
    expect(result.valid).toBe(false);
    expect(result.invalidFields.some((f) => f.path === 'personal.email')).toBe(true);
  });

  it('accepts emails with multi-level domains (subdomain or multi-part TLD)', () => {
    const result = validateImportedProfile({
      personal: { email: 'jane@mail.co.uk' },
    });
    expect(result.valid).toBe(true);
    expect(result.sanitized.personal?.email).toBe('jane@mail.co.uk');

    const result2 = validateImportedProfile({
      personal: { email: 'jane@sub.example.com' },
    });
    expect(result2.valid).toBe(true);
    expect(result2.sanitized.personal?.email).toBe('jane@sub.example.com');
  });

  it('rejects invalid dateOfBirth format', () => {
    const result = validateImportedProfile({ personal: { dateOfBirth: '1990/01/15' } });
    expect(result.valid).toBe(false);
    expect(result.invalidFields.some((f) => f.path === 'personal.dateOfBirth')).toBe(true);
  });

  it('rejects invalid gender value', () => {
    const result = validateImportedProfile({ personal: { gender: 'unknown' } });
    expect(result.valid).toBe(false);
    expect(result.invalidFields.some((f) => f.path === 'personal.gender')).toBe(true);
  });

  it('rejects invalid veteranStatus', () => {
    const result = validateImportedProfile({ personal: { veteranStatus: 'maybe' } });
    expect(result.valid).toBe(false);
  });

  it('accepts a known ETHNICITIES value', () => {
    const result = validateImportedProfile({ personal: { ethnicity: 'East Asian' } });
    expect(result.valid).toBe(true);
    expect(result.sanitized.personal?.ethnicity).toBe('East Asian');
  });

  it('accepts "prefer_not_to_say" for ethnicity, even though it is not itself in ETHNICITIES', () => {
    const result = validateImportedProfile({ personal: { ethnicity: 'prefer_not_to_say' } });
    expect(result.valid).toBe(true);
    expect(result.sanitized.personal?.ethnicity).toBe('prefer_not_to_say');
  });

  it('rejects an ethnicity value outside the known list', () => {
    const result = validateImportedProfile({ personal: { ethnicity: 'Martian' } });
    expect(result.valid).toBe(false);
    expect(result.invalidFields.some((f) => f.path === 'personal.ethnicity')).toBe(true);
  });

  it('rejects phone with missing fields', () => {
    const result = validateImportedProfile({ personal: { phone: { countryCode: 'TH' } } });
    expect(result.valid).toBe(false);
    expect(result.invalidFields.some((f) => f.path === 'personal.phone')).toBe(true);
  });

  it('accepts valid address', () => {
    const result = validateImportedProfile({ address: { city: 'Bangkok', country: 'TH' } });
    expect(result.valid).toBe(true);
    expect(result.sanitized.address?.city).toBe('Bangkok');
  });

  it('rejects address.city over 100 characters', () => {
    const result = validateImportedProfile({ address: { city: 'x'.repeat(101) } });
    expect(result.valid).toBe(false);
    expect(result.invalidFields.some((f) => f.path === 'address.city')).toBe(true);
  });

  it('accepts valid salary', () => {
    const result = validateImportedProfile({ salary: { current: { amount: 50000, currency: 'USD' } } });
    expect(result.valid).toBe(true);
    expect(result.sanitized.salary?.current?.amount).toBe(50000);
  });

  it('rejects salary with invalid currency code', () => {
    const result = validateImportedProfile({ salary: { current: { amount: 50000, currency: 'us' } } });
    expect(result.valid).toBe(false);
    expect(result.invalidFields.some((f) => f.path === 'salary.current.currency')).toBe(true);
  });

  it('accepts salary with zero amount', () => {
    const result = validateImportedProfile({ salary: { current: { amount: 0, currency: 'USD' } } });
    expect(result.valid).toBe(true);
    expect(result.sanitized.salary?.current?.amount).toBe(0);
  });

  it('rejects salary with negative amount', () => {
    const result = validateImportedProfile({ salary: { current: { amount: -1, currency: 'USD' } } });
    expect(result.valid).toBe(false);
    expect(result.invalidFields.some((f) => f.path === 'salary.current.amount')).toBe(true);
  });

  it('drops expected salary entries missing currency', () => {
    const result = validateImportedProfile({
      salary: {
        current: { amount: 50000, currency: 'USD' },
        expected: [{ country: 'TH' }],
      },
    });
    expect(result.valid).toBe(true);
    expect(result.sanitized.salary?.expected).toBeUndefined();
  });

  it('accepts valid expected salary entries', () => {
    const result = validateImportedProfile({
      salary: {
        current: { amount: 50000, currency: 'USD' },
        expected: [{ country: 'TH', currency: 'THB', amount: 80000 }],
      },
    });
    expect(result.valid).toBe(true);
    expect(result.sanitized.salary?.expected).toHaveLength(1);
  });

  it('rejects invalid work auth status', () => {
    const result = validateImportedProfile({
      workAuthorization: [{ country: 'TH', status: 'unknown' }],
    });
    expect(result.valid).toBe(false);
  });

  it('accepts valid work auth entry', () => {
    const result = validateImportedProfile({
      workAuthorization: [{ country: 'TH', status: 'citizen_or_pr' }],
    });
    expect(result.valid).toBe(true);
    expect(result.sanitized.workAuthorization).toHaveLength(1);
  });

  it('rejects work history entry missing startDate', () => {
    const result = validateImportedProfile({
      workHistory: [{ company: 'Acme', title: 'Dev', isCurrent: true }],
    });
    expect(result.valid).toBe(false);
  });

  it('rejects work history entry with bad startDate format', () => {
    const result = validateImportedProfile({
      workHistory: [{ company: 'Acme', title: 'Dev', startDate: '2020/01', isCurrent: false }],
    });
    expect(result.valid).toBe(false);
  });

  it('accepts valid work history entry', () => {
    const result = validateImportedProfile({
      workHistory: [{ company: 'Acme', title: 'Dev', startDate: '2020-01', isCurrent: true }],
    });
    expect(result.valid).toBe(true);
    expect(result.sanitized.workHistory).toHaveLength(1);
  });

  it('rejects education entry missing startDate', () => {
    const result = validateImportedProfile({
      education: [{ institution: 'MIT', degree: 'B.Sc.', fieldOfStudy: 'CS' }],
    });
    expect(result.valid).toBe(false);
  });

  it('accepts valid education entry', () => {
    const result = validateImportedProfile({
      education: [{ institution: 'MIT', degree: 'B.Sc.', fieldOfStudy: 'CS', startDate: '2014-09', endDate: '2018-05', isCurrent: false }],
    });
    expect(result.valid).toBe(true);
    expect(result.sanitized.education).toEqual([
      { institution: 'MIT', degree: 'B.Sc.', fieldOfStudy: 'CS', startDate: '2014-09', endDate: '2018-05', isCurrent: false, grade: undefined, description: undefined },
    ]);
  });

  it('accepts a year-only (YYYY) education startDate/endDate, unlike work history which requires a month', () => {
    const result = validateImportedProfile({
      education: [{ institution: 'MIT', degree: 'B.Sc.', fieldOfStudy: 'CS', startDate: '2014', endDate: '2018' }],
    });
    expect(result.valid).toBe(true);
    expect(result.sanitized.education?.[0]).toMatchObject({ startDate: '2014', endDate: '2018' });
  });

  it('drops a malformed endDate silently, without rejecting the whole entry (endDate is optional; startDate is not)', () => {
    const result = validateImportedProfile({
      education: [{ institution: 'MIT', degree: 'B.Sc.', fieldOfStudy: 'CS', startDate: '2014-09', endDate: '2018/05' }],
    });
    expect(result.valid).toBe(true);
    expect(result.sanitized.education?.[0]).toMatchObject({ startDate: '2014-09', endDate: undefined });
  });

  it('rejects invalid language proficiency', () => {
    const result = validateImportedProfile({
      languages: [{ language: 'English', proficiency: 'fluent' }],
    });
    expect(result.valid).toBe(false);
  });

  it('accepts valid language entry', () => {
    const result = validateImportedProfile({
      languages: [{ language: 'English', proficiency: 'native_bilingual' }],
    });
    expect(result.valid).toBe(true);
    expect(result.sanitized.languages).toHaveLength(1);
  });

  it('rejects LinkedIn URL without linkedin.com', () => {
    const result = validateImportedProfile({ links: { linkedin: 'https://example.com/jane' } });
    expect(result.valid).toBe(false);
    expect(result.invalidFields.some((f) => f.path === 'links.linkedin')).toBe(true);
  });

  it('accepts empty linkedin string', () => {
    const result = validateImportedProfile({ links: { linkedin: '' } });
    expect(result.valid).toBe(true);
  });

  it('rejects a non-string linkedin value instead of silently dropping it', () => {
    const result = validateImportedProfile({ links: { linkedin: 12345 } });
    expect(result.valid).toBe(false);
    expect(result.invalidFields.some((f) => f.path === 'links.linkedin')).toBe(true);
  });

  it('accepts valid linkedin URL', () => {
    const result = validateImportedProfile({ links: { linkedin: 'https://linkedin.com/in/jane' } });
    expect(result.valid).toBe(true);
    expect(result.sanitized.links?.linkedin).toBe('https://linkedin.com/in/jane');
  });

  it('accepts valid cv.file', () => {
    const result = validateImportedProfile({
      documents: { cv: { file: { name: 'cv.pdf', size: 1024, base64: 'abc' } } },
    });
    expect(result.valid).toBe(true);
  });

  it('rejects cv.file missing base64', () => {
    const result = validateImportedProfile({
      documents: { cv: { file: { name: 'cv.pdf', size: 1024 } } },
    });
    expect(result.valid).toBe(false);
    expect(result.invalidFields.some((f) => f.path === 'documents.cv.file')).toBe(true);
  });

  it('rejects a cv.file whose base64 payload exceeds the 4 MB cap', () => {
    // Well past the ~5.6M-char base64 bound for a 4 MB raw file.
    const result = validateImportedProfile({
      documents: { cv: { file: { name: 'cv.pdf', size: 10 * 1024 * 1024, base64: 'a'.repeat(7 * 1024 * 1024) } } },
    });
    expect(result.valid).toBe(false);
    expect(result.invalidFields.some((f) => f.path === 'documents.cv.file')).toBe(true);
  });

  it('passes through professional.summary and noticePeriod (object)', () => {
    const result = validateImportedProfile({
      professional: {
        summary: 'Seasoned engineer.',
        noticePeriod: { immediate: false, value: 2, unit: 'week' },
      },
    });
    expect(result.valid).toBe(true);
    expect(result.sanitized.professional?.summary).toBe('Seasoned engineer.');
    expect(result.sanitized.professional?.noticePeriod).toEqual({
      immediate: false,
      value: 2,
      unit: 'week',
    });
  });

  it('excludes a non-object professional.noticePeriod but keeps summary', () => {
    const result = validateImportedProfile({
      professional: {
        summary: 'Hello',
        noticePeriod: 'immediately' as unknown as object,
      },
    });
    expect(result.valid).toBe(true);
    expect(result.sanitized.professional?.summary).toBe('Hello');
    expect(result.sanitized.professional?.noticePeriod).toBeUndefined();
  });

  it('ignores a non-string professional.summary', () => {
    const result = validateImportedProfile({
      professional: { summary: 42 as unknown as string },
    });
    expect(result.valid).toBe(true);
    expect(result.sanitized.professional?.summary).toBeUndefined();
  });

  it('passes through documents.coverLetter', () => {
    const result = validateImportedProfile({
      documents: {
        coverLetter: { url: 'https://example.com/cl.pdf' },
      },
    });
    expect(result.valid).toBe(true);
    expect(result.sanitized.documents?.coverLetter).toEqual({ url: 'https://example.com/cl.pdf' });
  });

  it('rejects documents.coverLetter.file missing base64, same rigor as cv.file', () => {
    const result = validateImportedProfile({
      documents: { coverLetter: { file: { name: 'cl.pdf', size: 1024 } } },
    });
    expect(result.valid).toBe(false);
    expect(result.invalidFields.some((f) => f.path === 'documents.coverLetter.file')).toBe(true);
  });

  it('rejects documents.coverLetter.url over 255 chars', () => {
    const result = validateImportedProfile({
      documents: { coverLetter: { url: 'x'.repeat(256) } },
    });
    expect(result.valid).toBe(false);
    expect(result.invalidFields.some((f) => f.path === 'documents.coverLetter.url')).toBe(true);
  });

  it('accepts valid links.custom entries', () => {
    const result = validateImportedProfile({
      links: { linkedin: '', custom: [{ label: 'GitHub', url: 'https://github.com/jane' }] },
    });
    expect(result.valid).toBe(true);
    expect(result.sanitized.links?.custom).toEqual([{ label: 'GitHub', url: 'https://github.com/jane' }]);
  });

  it('drops a malformed links.custom entry and reports it, keeping valid entries', () => {
    const result = validateImportedProfile({
      links: {
        linkedin: '',
        custom: [
          { label: 'GitHub', url: 'https://github.com/jane' },
          { label: 'Missing URL' },
        ],
      },
    });
    expect(result.valid).toBe(false);
    expect(result.invalidFields.some((f) => f.path === 'links.custom[1]')).toBe(true);
    expect(result.sanitized.links?.custom).toEqual([{ label: 'GitHub', url: 'https://github.com/jane' }]);
  });
});
