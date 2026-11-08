import { describe, it, expect, vi } from 'vitest';
import { autofillProfilePayload } from './profilePayload';
import { extractFromResume } from './gemini';
import { settingsReviewProfile } from '@/src/testing/settingsReviewFixture';

const profile = settingsReviewProfile();
describe('Minimal Gemini profile payloads', () => {
  it('excludes stored document bytes, identifiers and unsolicited background details from autofill', () => {
    const payload = autofillProfilePayload(profile, [
      { fieldId: 'field', type: 'text', label: 'Job title' },
    ]);
    expect(payload.documents?.cv.url).toBe(profile.documents.cv.url);
    expect(payload.documents?.cv.file).toBeUndefined();
    expect(payload.documents?.coverLetter?.file).toBeUndefined();
    expect(payload.id).toBeUndefined();
    expect(payload.personal?.gender).toBeUndefined();
    expect(payload.personal?.dateOfBirth).toBeUndefined();
    expect(payload.derived?.age).toBeUndefined();
    expect(payload.workHistory).toEqual(profile.workHistory);
  });
  it('includes only the background detail a form actually asks for', () => {
    const payload = autofillProfilePayload(profile, [
      { fieldId: 'field', type: 'select', label: 'Gender' },
    ]);
    expect(payload.personal?.gender).toBe(profile.personal.gender);
    expect(payload.personal?.ethnicity).toBeUndefined();
    expect(payload.personal?.dateOfBirth).toBeUndefined();
  });
  it('keeps birth date and derived age available for an age question', () => {
    const payload = autofillProfilePayload(profile, [
      { fieldId: 'field', type: 'text', label: 'Date of birth' },
    ]);
    expect(payload.personal?.dateOfBirth).toBe(profile.personal.dateOfBirth);
  });
  it('does not send the current profile or its stored documents with a new resume', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ candidates: [{ content: { parts: [{ text: '{}' }] } }] }),
      });
    vi.stubGlobal('fetch', fetch);
    try {
      await extractFromResume(
        'synthetic-key',
        'gemini-3.8-flash',
        'selected-file-only',
        'application/pdf',
        profile,
      );
      const body = fetch.mock.calls[0][1].body;
      expect(body).toContain('selected-file-only');
      expect(body).not.toContain(profile.documents.cv.file!.base64);
      expect(body).not.toContain(profile.personal.email);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('sensitive context and payload limits', () => {
  it('does not use internal names to disclose background details', () => {
    const payload = autofillProfilePayload(profile, [
      { fieldId: 'x', type: 'text', label: 'Custom reference', name: 'gender' },
    ]);
    expect(payload.personal?.gender).toBeUndefined();
  });
  it('provides a current age without disclosing the full birth date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-07-01T12:00:00Z'));
    try {
      const data = structuredClone(profile);
      data.personal.dateOfBirth = '2000-06-01';
      const payload = autofillProfilePayload(data, [{ fieldId: 'x', type: 'text', label: 'Age' }]);
      expect(payload.personal?.dateOfBirth).toBeUndefined();
      expect(payload.derived?.age).toBe(30);
    } finally {
      vi.useRealTimers();
    }
  });
  it('bounds a very large profile without modifying stored prose or shifting indices', () => {
    const data = structuredClone(profile);
    data.workHistory = Array.from({ length: 100 }, (_, i) => ({
      company: `Company ${i}`,
      title: 'Engineer',
      startDate: '2020-01',
      isCurrent: false,
      description: 'x'.repeat(10_000),
    }));
    const payload = autofillProfilePayload(data, [
      { fieldId: 'x', type: 'text', label: 'Custom reference' },
    ]);
    expect(new TextEncoder().encode(JSON.stringify(payload)).length).toBeLessThanOrEqual(48_000);
    expect(payload.workHistory?.[0].description?.length).toBe(2_000);
    expect(data.workHistory[0].description?.length).toBe(10_000);
    for (const [index, entry] of (payload.workHistory ?? []).entries()) {
      if (entry?.company) expect(entry.company).toBe(`Company ${index}`);
    }
  });
});
