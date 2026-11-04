import { resolveProfileValue } from './resolver';
import { describe, it, expect } from 'vitest';
import type { Profile } from '../types/profile';
import { buildPickerTree } from './profileFieldTree';
import { RULE_PROFILE } from './ruleMatching.fixture';
import { isLearnedPath } from '../utils/learnedMappingData';

function emptyProfile(): Profile {
  return {
    id: 'p1',
    personal: { firstName: '', lastName: '', email: '', phone: { countryCode: '', callingCode: '', number: '' } },
    address: { city: '', country: '' },
    professional: {},
    salary: { current: { amount: 0, currency: '', period: 'monthly' }, expected: [] },
    workAuthorization: [],
    workHistory: [],
    education: [],
    languages: [],
    links: { linkedin: '' },
    documents: { cv: {} },
  };
}

function sectionIds(profile: Profile): string[] {
  return buildPickerTree(profile).map((s) => s.id);
}

// salary.current.amount is a required number (defaults to 0), and the source
// checks `!= null` rather than truthiness, so a 'salary' section with an
// "Amount: 0" row is always present for any well-typed profile — it is not a
// section you can fully omit the way address/links/etc. can be.
function getSection(profile: Profile, id: string) {
  const section = buildPickerTree(profile).find((s) => s.id === id);
  if (!section) throw new Error(`no section with id ${id}`);
  return section;
}

describe('buildPickerTree', () => {
  it('returns only the always-present salary section for a completely empty profile', () => {
    expect(sectionIds(emptyProfile())).toEqual(['salary']);
  });

  describe('personal section', () => {
    it('includes only the fields that have a value', () => {
      const p = emptyProfile();
      p.personal.firstName = 'Jane';
      p.personal.email = 'jane@example.com';

      const personal = getSection(p, 'personal');
      const labels = personal.items.map((i) => ('label' in i ? i.label : i.heading));
      expect(labels).toEqual(['First Name', 'Email']);
    });

    it('uses the Profile label for a preferred name', () => {
      const p = emptyProfile();
      p.personal.firstName = 'Jane';
      p.personal.nickname = 'Janey';

      const personal = getSection(p, 'personal');
      const labels = personal.items.map((i) => ('label' in i ? i.label : i.heading));
      expect(labels).toEqual(['First Name', 'Preferred name']);
    });

    it('groups phone into a cluster only when callingCode or number is present', () => {
      const p = emptyProfile();
      p.personal.phone = { countryCode: 'TH', callingCode: '+66', number: '812345678' };

      const personal = getSection(p, 'personal');
      const cluster = personal.items.find((i) => 'heading' in i && i.heading === 'Phone');
      expect(cluster).toBeDefined();
      if (cluster && 'rows' in cluster) {
        expect(cluster.rows.map((r) => r.label)).toEqual(['Full Phone', 'Country Code', 'Phone Number']);
        expect(cluster.rows[0].value).toBe('+66 812345678');
      }
    });

    it('omits the phone cluster entirely when phone has no callingCode or number', () => {
      const p = emptyProfile();
      p.personal.firstName = 'Jane';
      const personal = getSection(p, 'personal');
      expect(personal.items.some((i) => 'heading' in i && i.heading === 'Phone')).toBe(false);
    });

    it('splits dateOfBirth into a cluster with day/month/year rows', () => {
      const p = emptyProfile();
      p.personal.dateOfBirth = '1990-06-15';

      const personal = getSection(p, 'personal');
      const cluster = personal.items.find((i) => 'heading' in i && i.heading === 'Date of Birth');
      expect(cluster).toBeDefined();
      if (cluster && 'rows' in cluster) {
        expect(cluster.rows.map((r) => `${r.label}:${r.value}`)).toEqual([
          'Date of Birth:1990-06-15',
          'Day:15',
          'Month:06',
          'Year:1990',
        ]);
      }
    });
  });

  describe('address section', () => {
    it('resolves the country code to its display name', () => {
      const p = emptyProfile();
      p.address = { city: 'Bangkok', country: 'TH' };

      const addr = getSection(p, 'address');
      const countryRow = addr.items.find((i) => 'label' in i && i.label === 'Country');
      expect(countryRow && 'value' in countryRow ? countryRow.value : null).toBe('Thailand');
    });

    it('is omitted entirely when no address fields are set', () => {
      expect(sectionIds(emptyProfile())).not.toContain('address');
    });
  });

  describe('salary section', () => {
    it('includes a Current Salary subgroup with formatted amount', () => {
      const p = emptyProfile();
      p.salary.current = { amount: 5000, currency: 'USD', period: 'monthly' };

      const salary = getSection(p, 'salary');
      const sub = salary.items.find((i) => 'heading' in i && i.heading === 'Current Salary');
      expect(sub).toBeDefined();
      if (sub && 'rows' in sub) {
        expect(sub.rows.some((r) => r.label === 'Current Salary')).toBe(true);
        expect(sub.rows.some((r) => r.label === 'Amount' && r.value === '5000')).toBe(true);
      }
    });

    it('adds one subgroup per expected-salary entry, named by currency', () => {
      const p = emptyProfile();
      p.salary.expected = [
        { amount: 100, currency: 'USD', period: 'monthly', country: 'US' },
        { amount: 200, currency: 'GBP', period: 'annual' },
      ];

      const salary = getSection(p, 'salary');
      const headings = salary.items.filter((i) => 'heading' in i).map((i) => (i as { heading: string }).heading);
      expect(headings).toEqual(['Current Salary', 'Expected Salary: USD', 'Expected Salary: GBP']);
    });

    it('skips an expected-salary entry with neither amount nor currency', () => {
      const p = emptyProfile();
      p.salary.expected = [{ period: 'monthly' }];
      const salary = getSection(p, 'salary');
      expect(salary.items.some((i) => 'heading' in i && i.heading.startsWith('Expected Salary'))).toBe(false);
    });
  });

  describe('work authorization section', () => {
    it('groups each country and its authorization status, preserving indexed mapping paths', () => {
      const p = emptyProfile();
      p.workAuthorization = [
        { country: 'US', status: 'citizen_or_pr' },
        { country: 'TH', status: 'requires_sponsorship' },
      ];

      const wa = getSection(p, 'work-authorization');
      expect(wa.items.map((item) => item.kind === 'subgroup' && [item.heading, item.rows])).toEqual([
        ['United States', [
          { kind: 'option', label: 'Country', fieldPath: 'workAuthorization.0.country', value: 'US' },
          { kind: 'option', label: 'Authorization Status', fieldPath: 'workAuthorization.0', value: 'Citizen / Permanent Resident' },
        ]],
        ['Thailand', [
          { kind: 'option', label: 'Country', fieldPath: 'workAuthorization.1.country', value: 'TH' },
          { kind: 'option', label: 'Authorization Status', fieldPath: 'workAuthorization.1', value: 'Requires Sponsorship' },
        ]],
      ]);
    });

    it('skips an entry with no status', () => {
      const p = emptyProfile();
      p.workAuthorization = [{ country: 'US' } as Profile['workAuthorization'][0]];
      expect(sectionIds(p)).not.toContain('work-authorization');
    });
  });

  describe('work history section', () => {
    it('builds a heading from company and title, and formats the date range', () => {
      const p = emptyProfile();
      p.workHistory = [
        { company: 'Acme', title: 'Engineer', startDate: '2020-01', isCurrent: true },
      ];

      const wh = getSection(p, 'work-history');
      const [entry] = wh.items;
      expect('heading' in entry && entry.heading).toBe('Acme · Engineer');
      if ('rows' in entry) {
        expect(entry.rows.some((r) => r.label === 'End Date' && r.value === 'Present')).toBe(true);
      }
    });

    it('leaves only the most recent entry expanded by default; older ones default-collapsed', () => {
      const p = emptyProfile();
      p.workHistory = [
        { company: 'OldCo', title: 'Junior Dev', startDate: '2015-01', isCurrent: false, endDate: '2018-01' },
        { company: 'NewCo', title: 'Senior Dev', startDate: '2018-02', isCurrent: true },
      ];

      const wh = getSection(p, 'work-history');
      const collapsedFlags = wh.items.map((i) => ('defaultCollapsed' in i ? i.defaultCollapsed : undefined));
      expect(collapsedFlags).toEqual([true, false]); // OldCo collapsed, NewCo (current) expanded
    });

    it('picks the entry with isCurrent true as most recent even if not last in the array', () => {
      const p = emptyProfile();
      p.workHistory = [
        { company: 'A', title: 'X', startDate: '2022-01', isCurrent: true },
        { company: 'B', title: 'Y', startDate: '2023-01', isCurrent: false },
      ];

      const wh = getSection(p, 'work-history');
      const collapsedFlags = wh.items.map((i) => ('defaultCollapsed' in i ? i.defaultCollapsed : undefined));
      expect(collapsedFlags).toEqual([false, true]); // A (isCurrent) stays expanded despite earlier startDate
    });

    it('includes Career Summary as its own top-level entry, not per work-history entry', () => {
      const p = emptyProfile();
      p.workHistory = [{ company: 'Acme', title: 'Eng', startDate: '2020-01', isCurrent: true }];
      p.professional = { summary: 'Backend engineer with 8 years of experience.' };

      const wh = getSection(p, 'work-history');
      const summaryRow = wh.items.find((i) => 'label' in i && i.label === 'Career Summary');
      expect(summaryRow).toBeDefined();
      expect(summaryRow && 'fieldPath' in summaryRow && summaryRow.fieldPath).toBe('professional.summary');
    });

    it('surfaces the work-history section for Career Summary alone, with no valid entries', () => {
      const p = emptyProfile();
      p.professional = { summary: 'Backend engineer with 8 years of experience.' };
      expect(sectionIds(p)).toContain('work-history');
    });

    it('includes Available Date and Notice Period as separate top-level entries', () => {
      const p = emptyProfile();
      p.professional = { noticePeriod: { immediate: false, value: 2, unit: 'week' } };

      const wh = getSection(p, 'work-history');
      const availableDateRow = wh.items.find((i) => 'label' in i && i.label === 'Available Date');
      const noticePeriodRow = wh.items.find((i) => 'label' in i && i.label === 'Notice Period');
      expect(availableDateRow && 'fieldPath' in availableDateRow && availableDateRow.fieldPath).toBe('professional.noticePeriod.availableDate');
      expect(noticePeriodRow && 'fieldPath' in noticePeriodRow && noticePeriodRow.fieldPath).toBe('professional.noticePeriod.formatted');
      expect(noticePeriodRow && 'value' in noticePeriodRow && noticePeriodRow.value).toBe('2 Weeks');
    });

    it('retains usable fields in a partial work entry', () => {
      const p = emptyProfile();
      p.workHistory = [{ startDate: '2020-01', isCurrent: false } as Profile['workHistory'][0]];
      expect(getSection(p, 'work-history').items[0]).toMatchObject({
        heading: '2020', rows: [expect.objectContaining({ fieldPath: 'workHistory.0.startDate.formatted' })],
      });
    });

    it('falls back to just the company name when title is missing', () => {
      const p = emptyProfile();
      p.workHistory = [{ company: 'Acme', startDate: '2020-01', isCurrent: false, endDate: '2021-01' } as Profile['workHistory'][0]];
      const wh = getSection(p, 'work-history');
      expect('heading' in wh.items[0] && wh.items[0].heading).toBe('Acme');
    });
  });

  describe('education section', () => {
    it('builds a heading from institution and degree', () => {
      const p = emptyProfile();
      p.education = [{ institution: 'MIT', degree: 'BSc', fieldOfStudy: 'CS', startDate: '2014', isCurrent: false, endDate: '2018' }];

      const edu = getSection(p, 'education');
      expect('heading' in edu.items[0] && edu.items[0].heading).toBe('MIT · BSc');
    });

    it('retains usable fields in a partial education entry', () => {
      const p = emptyProfile();
      p.education = [{ fieldOfStudy: 'CS', startDate: '2020' } as Profile['education'][0]];
      expect(getSection(p, 'education').items[0]).toMatchObject({
        heading: '2020', rows: [
          expect.objectContaining({ fieldPath: 'education.0.fieldOfStudy' }),
          expect.objectContaining({ fieldPath: 'education.0.startDate.formatted' }),
        ],
      });
    });
  });

  describe('languages section', () => {
    it('resolves a known language code to its display name and formats proficiency', () => {
      const p = emptyProfile();
      p.languages = [{ language: 'en', proficiency: 'native_bilingual' }];

      const lang = getSection(p, 'languages');
      expect(lang.items[0]).toEqual({
        kind: 'subgroup', heading: 'English', rows: [
          { kind: 'option', label: 'Language', fieldPath: 'languages.0.language', value: 'English' },
          { kind: 'option', label: 'Proficiency', fieldPath: 'languages.0.proficiency', value: 'Native' },
        ],
      });
    });

    it('skips an entry with no language', () => {
      const p = emptyProfile();
      p.languages = [{ proficiency: 'fluent' } as unknown as Profile['languages'][0]];
      expect(sectionIds(p)).not.toContain('languages');
    });
  });

  describe('links section', () => {
    it('includes linkedin, portfolio, and only well-formed custom links', () => {
      const p = emptyProfile();
      p.links = {
        linkedin: 'https://linkedin.com/in/jane',
        portfolio: 'https://jane.dev',
        custom: [
          { label: 'GitHub', url: 'https://github.com/jane' },
          { label: '', url: 'https://missing-label.example' },
          { label: 'Missing URL', url: '' },
        ],
      };

      const links = getSection(p, 'links');
      expect(links.items.map((i) => ('label' in i ? i.label : ''))).toEqual(['LinkedIn', 'Portfolio', 'GitHub']);
    });

    it('is omitted when linkedin is empty and there are no other links', () => {
      expect(sectionIds(emptyProfile())).not.toContain('links');
    });
  });

  describe('documents section', () => {
    it('includes the CV URL when present', () => {
      const p = emptyProfile();
      p.documents = { cv: { url: 'https://drive.example/cv.pdf' } };

      const docs = getSection(p, 'documents');
      expect('rows' in docs.items[0] && docs.items[0].rows[0].value).toBe('https://drive.example/cv.pdf');
    });

    it('is omitted when the CV has no URL (file-only or empty)', () => {
      const p = emptyProfile();
      p.documents = { cv: { file: { name: 'cv.pdf', size: 10, base64: 'x' } } };
      expect(sectionIds(p)).not.toContain('documents');
    });

    it('includes the Cover Letter URL when present', () => {
      const p = emptyProfile();
      p.documents = { cv: {}, coverLetter: { url: 'https://drive.example/letter.pdf' } };

      const docs = getSection(p, 'documents');
      expect('rows' in docs.items[0] && docs.items[0].rows[0].value).toBe('https://drive.example/letter.pdf');
    });

    it('includes both CV URL and Cover Letter URL as separate rows when both are present', () => {
      const p = emptyProfile();
      p.documents = {
        cv: { url: 'https://drive.example/cv.pdf' },
        coverLetter: { url: 'https://drive.example/letter.pdf' },
      };

      const docs = getSection(p, 'documents');
      expect(docs.items).toHaveLength(2);
      expect('rows' in docs.items[0] && docs.items[0].rows[0].value).toBe('https://drive.example/cv.pdf');
      expect('rows' in docs.items[1] && docs.items[1].rows[0].value).toBe('https://drive.example/letter.pdf');
    });
  });

  it('produces every section in the same fixed order when fully populated', () => {
    const p = emptyProfile();
    p.personal.firstName = 'Jane';
    p.address = { city: 'Bangkok', country: 'TH' };
    p.salary.current = { amount: 5000, currency: 'USD', period: 'monthly' };
    p.workAuthorization = [{ country: 'US', status: 'citizen_or_pr' }];
    p.workHistory = [{ company: 'Acme', title: 'Eng', startDate: '2020-01', isCurrent: true }];
    p.education = [{ institution: 'MIT', degree: 'BSc', fieldOfStudy: 'CS', startDate: '2014', isCurrent: false, endDate: '2018' }];
    p.languages = [{ language: 'en', proficiency: 'native_bilingual' }];
    p.links = { linkedin: 'https://linkedin.com/in/jane' };
    p.documents = { cv: { url: 'https://drive.example/cv.pdf' } };

    expect(sectionIds(p)).toEqual([
      'personal', 'address', 'work-authorization', 'work-history',
      'education', 'languages', 'links', 'documents', 'salary',
    ]);
  });
});


describe('custom link original indices', () => {
  it('retains array indices when incomplete rows precede a valid link', () => {
    const profile = emptyProfile();
    profile.links.custom = [{ label: '', url: 'https://wrong.test' }, { label: 'GitHub', url: 'https://github.com/example' }];
    const section = getSection(profile, 'links');
    const row = section.items.find((item) => item.kind === 'option' && item.label === 'GitHub');
    expect(row).toMatchObject({ fieldPath: 'links.custom.1.url', value: 'https://github.com/example' });
    if (!row || row.kind !== 'option') throw new Error('Expected custom link option');
    expect(resolveProfileValue(profile, row.fieldPath)).toBe('https://github.com/example');
  });
});

it('preserves formatted work and education previews, order, and current end dates', () => {
  const profile = emptyProfile();
  profile.workHistory = [{ company: 'Acme', title: 'Dev', location: { city: 'Paris', countryCode: 'FR' }, arrangement: 'remote', startDate: '2022-03', isCurrent: true }];
  profile.education = [{ institution: 'School', degree: 'BSc', fieldOfStudy: '', startDate: '2015', endDate: '2019-06', isCurrent: false }];
  const work = getSection(profile, 'work-history').items[0];
  const education = getSection(profile, 'education').items[0];
  if (work.kind !== 'subgroup' || education.kind !== 'subgroup') throw new Error('Expected entry groups');
  expect(work.rows.map(({ label, value }) => [label, value])).toEqual([
    ['Company', 'Acme'], ['Job Title', 'Dev'], ['Location', 'Paris, France'],
    ['Country', 'France'], ['City', 'Paris'], ['Work Arrangement', 'Remote'],
    ['Start Date', 'March 2022'], ['End Date', 'Present'], ['I currently work here', 'Yes'],
  ]);
  expect(education.rows.map(({ label, value }) => [label, value])).toEqual([
    ['Institution', 'School'], ['Degree', 'BSc'], ['Start Date', '2015'], ['End Date', 'June 2019'],
  ]);
});


it('offers current Profile fields with previews equal to their resolved mapping values', () => {
  const profile = structuredClone(RULE_PROFILE);
  profile.personal.nickname = 'Lex';
  profile.workAuthorization[1].visaType = 'Work permit';
  profile.workAuthorization[1].expiryDate = '2028-06-30';
  profile.workHistory[1].location = { city: 'Bangkok', countryCode: 'TH' };
  profile.documents.coverLetter = { url: 'https://example.test/letter' };
  profile.links.twitter = 'https://x.com/example';
  const rows = buildPickerTree(profile).flatMap((section) =>
    section.items.flatMap((item) => item.kind === 'option' ? [item] : item.rows),
  );
  const paths = rows.map((row) => row.fieldPath);
  expect(new Set(paths).size).toBe(paths.length);
  expect(paths).toEqual(expect.arrayContaining([
    'personal.nickname', 'salary.current.period', 'salary.expected.1.period',
    'workAuthorization.1', 'workAuthorization.1.country',
    'workAuthorization.1.visaType', 'workAuthorization.1.expiryDate',
    'workHistory.1.location.city', 'workHistory.1.location.countryName',
    'workHistory.1.isCurrent', 'education.1.isCurrent',
    'languages.0.language', 'languages.0.proficiency',
    'documents.cv.url', 'documents.coverLetter.url',
  ]));
  for (const row of rows) {
    expect(isLearnedPath(row.fieldPath), row.fieldPath).toBe(true);
    expect(row.value, row.fieldPath).toBe(resolveProfileValue(profile, row.fieldPath));
  }
  expect(paths.some((path) => path.includes('.file'))).toBe(false);
  expect(rows.find((row) => row.fieldPath === 'links.twitter')?.label).toBe('X / Twitter');
});
