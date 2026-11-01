import { describe, expect, it } from 'vitest';
import type { Profile } from '@/src/types/profile';
import { validateResumeProfile } from './validateResume';
import {
  applyReviewedResumeChanges,
  resumeChanges,
  resumeFileChange,
  ResumeReviewChangedError,
} from './resumeImport';

const school = {
  institution: 'Greenwich',
  degree: 'BSc',
  fieldOfStudy: 'Computing',
  startDate: '2023-07',
  endDate: '2024-07',
  isCurrent: false,
};
const role = {
  company: 'Acme',
  title: 'Technical Lead',
  startDate: '2020-01',
  endDate: '2024-01',
  isCurrent: false,
  description: 'Original details',
};

describe('validated resume data', () => {
  it.each([
    null,
    [],
    'profile',
    { education: 'bad' },
    { education: [null] },
    { personal: 3 },
    { personal: { firstName: {} } },
    { workHistory: [{ ...role, isCurrent: 'yes' }] },
    { personal: { email: 'bad' } },
    { education: [{ ...school, startDate: '2024-15' }] },
  ])('rejects malformed extraction: %j', (raw) => {
    expect(() => validateResumeProfile(raw)).toThrow('invalid data');
  });

  it('accepts missing dates without inventing them or keeping nulls', () => {
    expect(
      validateResumeProfile({ education: [{ ...school, startDate: null, grade: null }] })
        .education?.[0],
    ).toMatchObject({ startDate: '', endDate: '2024-07' });
  });

  it('normalizes links and strips settings, derived data, documents, IDs, and expected salary', () => {
    const result = validateResumeProfile({
      id: 'foreign',
      geminiApiKey: 'do-not-import',
      derived: { fullName: 'Fake' },
      documents: { cv: { url: 'https://fake.example' } },
      salary: { expected: [{ amount: 1 }] },
      links: {
        linkedin: 'linkedin.com/in/test',
        custom: [{ label: 'GitHub', url: 'github.com/test' }],
      },
    });
    expect(result).toEqual({
      links: {
        linkedin: 'https://linkedin.com/in/test',
        github: 'https://github.com/test',
        custom: [],
      },
    });
  });

  it('imports dedicated social fields through comparison and save without losing other links', () => {
    const current = { links: { linkedin: '', custom: [{ label: 'Blog', url: 'https://blog.example' }] } };
    const extracted = validateResumeProfile({ links: {
      github: 'github.com/test', twitter: 'https://x.com/test',
      dribbble: 'https://dribbble.com/test', behance: 'https://behance.net/test',
    } });
    const saved = applyReviewedResumeChanges(current, resumeChanges(current, extracted));
    expect(saved.links).toEqual({ ...current.links,
      github: 'https://github.com/test', twitter: 'https://x.com/test',
      dribbble: 'https://dribbble.com/test', behance: 'https://behance.net/test',
    });
  });

  it('preserves repository, ambiguous account, and unrelated custom links', () => {
    const custom = [
      { label: 'GitHub', url: 'https://github.com/test/project' },
      { label: 'GitHub', url: 'https://github.com/one' },
      { label: 'GitHub', url: 'https://github.com/two' },
      { label: 'GitHub', url: 'https://github.example/test' },
    ];
    expect(validateResumeProfile({ links: { custom } }).links).toEqual({ custom });
  });

  it('does not overwrite an explicit GitHub field with a different custom account', () => {
    const links = { github: 'https://github.com/one', custom: [{ label: 'GitHub', url: 'https://github.com/two' }] };
    expect(validateResumeProfile({ links }).links).toEqual(links);
    expect(links.custom).toHaveLength(1);
  });
});

describe('resume comparison and preservation', () => {
  it('keeps languages, work authorizations, and custom links absent from the resume', () => {
    const current: Partial<Profile> = {
      languages: [
        { language: 'English', proficiency: 'full_professional' },
        { language: 'Burmese', proficiency: 'native_bilingual' },
      ],
      workAuthorization: [
        { country: 'MM', status: 'citizen_or_pr' },
        { country: 'TH', status: 'work_visa', visaType: 'Existing visa' },
      ],
      links: {
        linkedin: '',
        custom: [
          { label: 'GitHub', url: 'https://github.com/old' },
          { label: 'Blog', url: 'https://blog.example' },
        ],
      },
    };
    const changes = resumeChanges(current, {
      languages: [{ language: 'English', proficiency: 'professional_working' }],
      workAuthorization: [{ country: 'TH', status: 'work_visa' }],
      links: { linkedin: '', custom: [{ label: 'GitHub', url: 'https://github.com/new' }] },
    });
    const saved = applyReviewedResumeChanges(current, changes);
    expect(saved.languages).toEqual([
      { language: 'English', proficiency: 'professional_working' },
      current.languages![1],
    ]);
    expect(saved.workAuthorization).toEqual([
      current.workAuthorization![1],
      current.workAuthorization![0],
    ]);
    expect(saved.links?.custom).toEqual([
      { label: 'GitHub', url: 'https://github.com/new' },
      current.links!.custom![1],
    ]);
  });

  it('retains known dates and entries omitted by the resume, without mutating either source', () => {
    const current = { education: [school, { ...school, institution: 'Other School' }] };
    const incoming = validateResumeProfile({
      education: [{ ...school, startDate: null, grade: 'First class' }],
    });
    const change = resumeChanges(current, incoming).find((change) => change.id === 'education')!;
    expect(change.suggestedValue).toEqual([
      { ...school, grade: 'First class' },
      current.education[1],
    ]);
    expect(incoming.education?.[0].startDate).toBe('');
    expect(current.education[0]).toEqual(school);
  });

  it('does not transfer dates between different degrees or ambiguous entries', () => {
    const current = { education: [school, { ...school, startDate: '2021', endDate: '2022' }] };
    const incoming = validateResumeProfile({
      education: [{ ...school, degree: 'MSc', startDate: null, endDate: null }],
    });
    const change = resumeChanges(current, incoming).find((change) => change.id === 'education')!;
    expect((change.suggestedValue as Profile['education'])[0].startDate).toBe('');
    expect(change.suggestedValue).toHaveLength(3);
  });

  it('does not create conflicts for URLs that only lack a scheme', () => {
    const changes = resumeChanges(
      { links: { linkedin: 'https://linkedin.com/in/test' } },
      { links: { linkedin: 'linkedin.com/in/test' } },
    );
    expect(changes.find((change) => change.id === 'links.linkedin')?.status).toBe('unchanged');
  });

  it('marks an identical resume as unchanged even if its filename or MIME prefix changed', () => {
    const current = { name: 'old.pdf', size: 1, base64: 'data:application/pdf;base64,AA==' };
    expect(
      resumeFileChange({ ...current, name: 'new.pdf', base64: 'data:;base64,AA==' }, current),
    ).toMatchObject({ status: 'unchanged', accepted: false });
    expect(resumeFileChange({ ...current, base64: 'AQ==' }, current).status).toBe('conflict');
  });

  it('shows missing dates as readable text in comparisons', () => {
    const change = resumeChanges({}, { education: [{ ...school, startDate: '' }] }).find(
      (change) => change.id === 'education',
    )!;
    expect(change.displaySuggested).toContain('Start date not provided');
    expect(change.displaySuggested).not.toContain('null');
  });
});

describe('applying a review against current storage', () => {
  it('preserves concurrent edits to unrelated and rejected fields, plus document URLs and cover letters', () => {
    const base = { workHistory: [role], links: { linkedin: 'https://linkedin.com/in/old' } };
    const changes = resumeChanges(base, { workHistory: [{ ...role, description: 'New details' }] });
    const file = { name: 'cv.pdf', size: 1, base64: 'AA==' };
    const latest = {
      ...base,
      links: { linkedin: 'https://linkedin.com/in/concurrent' },
      documents: {
        cv: { url: 'https://cv.example' },
        coverLetter: { url: 'https://letter.example' },
      },
    };
    const saved = applyReviewedResumeChanges(latest, [...changes, resumeFileChange(file)]);
    expect(saved.links).toEqual(latest.links);
    expect(saved.documents).toEqual({ ...latest.documents, cv: { ...latest.documents.cv, file } });
    expect(saved.workHistory?.[0].description).toBe('New details');
  });

  it('requires review again if an accepted field changed in another tab', () => {
    const changes = resumeChanges(
      { workHistory: [role] },
      { workHistory: [{ ...role, description: 'From resume' }] },
    );
    const latest = { workHistory: [{ ...role, description: 'Concurrent edit' }] };
    try {
      applyReviewedResumeChanges(latest, changes);
      expect.fail('Must not overwrite a concurrent edit');
    } catch (error) {
      expect(error).toBeInstanceOf(ResumeReviewChangedError);
      const updated = (error as ResumeReviewChangedError).changes.find(
        (change) => change.id === 'workHistory',
      )!;
      expect(updated.displayCurrent).toContain('Concurrent edit');
      expect(
        applyReviewedResumeChanges(latest, (error as ResumeReviewChangedError).changes)
          .workHistory?.[0].description,
      ).toBe('From resume');
    }
  });

  it('does not replace a rejected field that changed concurrently', () => {
    const changes = resumeChanges(
      { workHistory: [role] },
      { workHistory: [{ ...role, description: 'From resume' }] },
    );
    const latest = { workHistory: [{ ...role, description: 'Concurrent edit' }] };
    expect(
      applyReviewedResumeChanges(
        latest,
        changes.map((change) => ({ ...change, accepted: false })),
      ),
    ).toEqual(latest);
  });
});
