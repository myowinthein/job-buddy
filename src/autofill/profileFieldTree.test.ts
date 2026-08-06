import { describe, it, expect } from 'vitest';
import type { Profile } from '../types/profile';
import { buildPickerTree } from './profileFieldTree';

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

    it('adds one subgroup per expected-salary entry, named by country or entry index', () => {
      const p = emptyProfile();
      p.salary.expected = [
        { amount: 100, currency: 'USD', period: 'monthly', country: 'US' },
        { amount: 200, currency: 'GBP', period: 'annual' },
      ];

      const salary = getSection(p, 'salary');
      const headings = salary.items.filter((i) => 'heading' in i).map((i) => (i as { heading: string }).heading);
      expect(headings).toEqual(['Current Salary', 'Expected Salary — United States', 'Expected Salary — Entry 2']);
    });

    it('skips an expected-salary entry with neither amount nor currency', () => {
      const p = emptyProfile();
      p.salary.expected = [{ period: 'monthly' }];
      const salary = getSection(p, 'salary');
      expect(salary.items.some((i) => 'heading' in i && i.heading.startsWith('Expected Salary'))).toBe(false);
    });
  });

  describe('work authorization section', () => {
    it('renders one flat row per entry: country name as label, status label as value', () => {
      const p = emptyProfile();
      p.workAuthorization = [
        { country: 'US', status: 'citizen_or_pr' },
        { country: 'TH', status: 'requires_sponsorship' },
      ];

      const wa = getSection(p, 'work-authorization');
      expect(wa.items.map((i) => ('label' in i ? `${i.label}: ${i.value}` : ''))).toEqual([
        'United States: Citizen / Permanent Resident',
        'Thailand: Requires Sponsorship',
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
      expect('heading' in entry && entry.heading).toBe('Acme — Engineer');
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

    it('skips an entry with neither company nor title', () => {
      const p = emptyProfile();
      p.workHistory = [{ startDate: '2020-01', isCurrent: false } as Profile['workHistory'][0]];
      expect(sectionIds(p)).not.toContain('work-history');
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
      expect('heading' in edu.items[0] && edu.items[0].heading).toBe('MIT — BSc');
    });

    it('skips an entry with neither institution nor degree', () => {
      const p = emptyProfile();
      p.education = [{ fieldOfStudy: 'CS', startDate: '2020' } as Profile['education'][0]];
      expect(sectionIds(p)).not.toContain('education');
    });
  });

  describe('languages section', () => {
    it('resolves a known language code to its display name and formats proficiency', () => {
      const p = emptyProfile();
      p.languages = [{ language: 'en', proficiency: 'native_bilingual' }];

      const lang = getSection(p, 'languages');
      expect('label' in lang.items[0] && lang.items[0].label).toBe('English');
      expect('value' in lang.items[0] && lang.items[0].value).toBe('Native / Bilingual');
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
      expect('value' in docs.items[0] && docs.items[0].value).toBe('https://drive.example/cv.pdf');
    });

    it('is omitted when the CV has no URL (file-only or empty)', () => {
      const p = emptyProfile();
      p.documents = { cv: { file: { name: 'cv.pdf', size: 10, base64: 'x' } } };
      expect(sectionIds(p)).not.toContain('documents');
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
      'personal', 'address', 'salary', 'work-authorization',
      'work-history', 'education', 'languages', 'links', 'documents',
    ]);
  });
});
