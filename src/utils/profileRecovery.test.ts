import { expect, it } from 'vitest';
import type { Profile } from '@/src/types/profile';
import { profileRecoveryChanges } from './profileRecovery';
import { applyChanges } from '@/src/resume-ai/parser';
import { selectChange } from '@/src/resume-ai/entrySelection';

it('offers only edited fields and keeps the replacement values by default', () => {
  const original = {
    id: 'old',
    personal: { firstName: 'Alex', email: 'alex@example.test', nickname: 'Al' },
  } as Profile;
  const draft = { ...original, personal: { ...original.personal, nickname: 'Lex' } };
  const current = { id: 'new', personal: { firstName: 'Jordan', nickname: 'Jay' } } as Profile;
  const changes = profileRecoveryChanges(original, draft, current);
  expect(changes.map((c) => [c.id, c.accepted])).toEqual([['personal.nickname', false]]);
  expect(applyChanges(current, changes)).toEqual(current);
  expect(
    applyChanges(
      current,
      changes.map((c) => selectChange(c, true)),
    ),
  ).toEqual({ ...current, personal: { ...current.personal, nickname: 'Lex' } });
});

it('keeps every collection entry unselected until explicitly recovered', () => {
  const original = { languages: [{ language: 'en', proficiency: 'full_professional' }] } as Profile;
  const draft = {
    languages: [...original.languages, { language: 'es', proficiency: 'professional_working' }],
  } as Profile;
  const current = { languages: [{ language: 'fr', proficiency: 'native_bilingual' }] } as Profile;
  const changes = profileRecoveryChanges(original, draft, current);
  expect(changes[0].entries?.every((entry) => entry.accepted === false)).toBe(true);
  expect(applyChanges(current, changes)).toEqual(current);
});

it('supports deliberate clearing and recovery of both document attachments', () => {
  const file = { name: 'resume.pdf', size: 10, base64: 'c2FtcGxl' };
  const original = {
    documents: { cv: { file }, coverLetter: { url: 'https://example.test/letter' } },
  };
  const draft = { documents: { cv: {}, coverLetter: { file } } };
  const current = { documents: { cv: { file }, coverLetter: { url: 'https://example.test/new' } } };
  const changes = profileRecoveryChanges(original, draft, current);
  const result = applyChanges(
    current,
    changes.map((c) => selectChange(c, true)),
  );
  expect(result.documents?.cv.file).toBeUndefined();
  expect(result.documents?.coverLetter?.file).toEqual(file);
  expect(result.documents?.coverLetter?.url).toBeUndefined();
});
