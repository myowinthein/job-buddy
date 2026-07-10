import { describe, it, expect } from 'vitest';
import { generateDiff, applyChanges, FIELD_DEFS } from './parser';
import type { Profile } from '@/src/types/profile';

const EMPTY: Partial<Profile> = {};

const FULL: Partial<Profile> = {
  personal: {
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    phone: { countryCode: 'US', callingCode: '+1', number: '555' },
  },
  address: { city: 'Bangkok', country: 'TH' },
  links: { linkedin: 'https://linkedin.com/in/jane' },
};

describe('generateDiff', () => {
  it('marks a field as "new" when current is empty and suggested is not', () => {
    const diff = generateDiff(EMPTY, FULL);
    const change = diff.find((c) => c.id === 'personal.firstName');
    expect(change?.status).toBe('new');
    expect(change?.accepted).toBe(true);
  });

  it('marks a field as "unchanged" when the suggested value is empty', () => {
    const diff = generateDiff(FULL, EMPTY);
    const change = diff.find((c) => c.id === 'personal.firstName');
    expect(change?.status).toBe('unchanged');
    expect(change?.accepted).toBe(false);
  });

  it('marks a field as "unchanged" when both values are equal', () => {
    const diff = generateDiff(FULL, FULL);
    const change = diff.find((c) => c.id === 'personal.firstName');
    expect(change?.status).toBe('unchanged');
  });

  it('marks a field as "conflict" when both have different non-empty values', () => {
    const extracted: Partial<Profile> = {
      personal: { ...(FULL.personal as Profile['personal']), firstName: 'Joan' },
    };
    const diff = generateDiff(FULL, extracted);
    const change = diff.find((c) => c.id === 'personal.firstName');
    expect(change?.status).toBe('conflict');
    expect(change?.accepted).toBe(true);
    expect(change?.currentValue).toBe('Jane');
    expect(change?.suggestedValue).toBe('Joan');
  });

  it('produces a change entry for every field definition', () => {
    const diff = generateDiff(EMPTY, EMPTY);
    expect(diff.length).toBeGreaterThan(0);
    expect(diff.every((c) => c.status === 'unchanged')).toBe(true);
  });

  it('populates display strings for current and suggested values', () => {
    const diff = generateDiff(EMPTY, FULL);
    const change = diff.find((c) => c.id === 'personal.firstName');
    expect(change?.displaySuggested).toBe('Jane');
    expect(change?.displayCurrent).toBe('');
  });
});

describe('applyChanges', () => {
  it('applies accepted new changes onto the base profile', () => {
    const diff = generateDiff(EMPTY, FULL);
    const result = applyChanges(EMPTY, diff);
    expect(result.personal?.firstName).toBe('Jane');
    expect(result.personal?.email).toBe('jane@example.com');
  });

  it('leaves the base profile unchanged when all fields are unchanged', () => {
    const diff = generateDiff(FULL, EMPTY);
    const result = applyChanges(FULL, diff);
    expect(result.personal?.firstName).toBe('Jane');
  });

  it('does not apply declined changes', () => {
    const diff = generateDiff(EMPTY, FULL).map((c) => ({ ...c, accepted: false }));
    const result = applyChanges(EMPTY, diff);
    expect(result.personal?.firstName).toBeUndefined();
  });

  it('applies only the accepted changes from a mixed diff', () => {
    const diff = generateDiff(EMPTY, FULL).map((c) =>
      c.id === 'personal.firstName' ? { ...c, accepted: false } : c,
    );
    const result = applyChanges(EMPTY, diff);
    expect(result.personal?.firstName).toBeUndefined();
    expect(result.personal?.email).toBe('jane@example.com');
  });

  it('uses the suggested value when a conflict is accepted', () => {
    const extracted: Partial<Profile> = {
      personal: { ...(FULL.personal as Profile['personal']), firstName: 'Joan' },
    };
    const diff = generateDiff(FULL, extracted);
    const result = applyChanges(FULL, diff);
    expect(result.personal?.firstName).toBe('Joan');
  });

  it('retains the current value when a conflict is declined', () => {
    const extracted: Partial<Profile> = {
      personal: { ...(FULL.personal as Profile['personal']), firstName: 'Joan' },
    };
    const diff = generateDiff(FULL, extracted).map((c) =>
      c.id === 'personal.firstName' ? { ...c, accepted: false } : c,
    );
    const result = applyChanges(FULL, diff);
    expect(result.personal?.firstName).toBe('Jane');
  });
});

// ── applyChanges with array-typed fields ──────────────────────────────────────

describe('applyChanges — array-typed fields', () => {
  const oldJob: Profile['workHistory'][number] = {
    company: 'OldCo',
    title: 'Junior Dev',
    startDate: '2018-01',
    isCurrent: false,
    endDate: '2019-12',
  };
  const newJob: Profile['workHistory'][number] = {
    company: 'NewCo',
    title: 'Senior Dev',
    startDate: '2020-01',
    isCurrent: true,
  };

  it('replaces the whole workHistory array when a conflict is accepted', () => {
    const current: Partial<Profile> = { workHistory: [oldJob] };
    const extracted: Partial<Profile> = { workHistory: [newJob] };
    const diff = generateDiff(current, extracted);
    const change = diff.find((c) => c.id === 'workHistory');
    expect(change?.status).toBe('conflict');

    const result = applyChanges(current, diff);
    expect(result.workHistory).toEqual([newJob]);
    expect(result.workHistory).toHaveLength(1);
  });

  it('leaves workHistory intact when the conflict is declined', () => {
    const current: Partial<Profile> = { workHistory: [oldJob] };
    const extracted: Partial<Profile> = { workHistory: [newJob] };
    const diff = generateDiff(current, extracted).map((c) =>
      c.id === 'workHistory' ? { ...c, accepted: false } : c,
    );
    const result = applyChanges(current, diff);
    expect(result.workHistory).toEqual([oldJob]);
  });

  it('replaces the education array wholesale on an accepted conflict', () => {
    const current: Partial<Profile> = {
      education: [{ institution: 'Old U', degree: 'BSc', fieldOfStudy: 'CS', startDate: '2014', isCurrent: false, endDate: '2018' }],
    };
    const extracted: Partial<Profile> = {
      education: [{ institution: 'New U', degree: 'MSc', fieldOfStudy: 'AI', startDate: '2019', isCurrent: false, endDate: '2021' }],
    };
    const diff = generateDiff(current, extracted);
    const result = applyChanges(current, diff);
    expect(result.education).toHaveLength(1);
    expect(result.education?.[0].institution).toBe('New U');
  });

  it('replaces the languages array on an accepted conflict', () => {
    const current: Partial<Profile> = { languages: [{ language: 'English', proficiency: 'native_bilingual' }] };
    const extracted: Partial<Profile> = { languages: [{ language: 'French', proficiency: 'elementary' }] };
    const diff = generateDiff(current, extracted);
    const result = applyChanges(current, diff);
    expect(result.languages).toEqual([{ language: 'French', proficiency: 'elementary' }]);
  });

  it('replaces the workAuthorization array on an accepted conflict', () => {
    const current: Partial<Profile> = { workAuthorization: [{ country: 'US', status: 'citizen_or_pr' }] };
    const extracted: Partial<Profile> = { workAuthorization: [{ country: 'GB', status: 'work_visa' }] };
    const diff = generateDiff(current, extracted);
    const result = applyChanges(current, diff);
    expect(result.workAuthorization).toEqual([{ country: 'GB', status: 'work_visa' }]);
  });

  it('replaces the salary.expected array on an accepted conflict', () => {
    const current: Partial<Profile> = {
      salary: { current: { amount: 0, currency: '', period: 'monthly' }, expected: [{ amount: 100, currency: 'USD', period: 'monthly' }] },
    };
    const extracted: Partial<Profile> = {
      salary: { current: { amount: 0, currency: '', period: 'monthly' }, expected: [{ amount: 200, currency: 'GBP', period: 'annual' }] },
    };
    const diff = generateDiff(current, extracted);
    const change = diff.find((c) => c.id === 'salary.expected');
    expect(change?.status).toBe('conflict');
    const result = applyChanges(current, diff);
    expect(result.salary?.expected).toEqual([{ amount: 200, currency: 'GBP', period: 'annual' }]);
  });

  it('leaves salary.expected intact when the conflict is declined', () => {
    const current: Partial<Profile> = {
      salary: { current: { amount: 0, currency: '', period: 'monthly' }, expected: [{ amount: 100, currency: 'USD', period: 'monthly' }] },
    };
    const extracted: Partial<Profile> = {
      salary: { current: { amount: 0, currency: '', period: 'monthly' }, expected: [{ amount: 200, currency: 'GBP', period: 'annual' }] },
    };
    const diff = generateDiff(current, extracted).map((c) =>
      c.id === 'salary.expected' ? { ...c, accepted: false } : c,
    );
    const result = applyChanges(current, diff);
    expect(result.salary?.expected).toEqual([{ amount: 100, currency: 'USD', period: 'monthly' }]);
  });
});

// ── FieldDef.display for complex fields ───────────────────────────────────────

describe('FIELD_DEFS display functions', () => {
  const display = (id: string, v: unknown): string => {
    const def = FIELD_DEFS.find((d) => d.id === id);
    if (!def) throw new Error(`no FieldDef for ${id}`);
    return def.display(v);
  };

  describe('personal.phone', () => {
    it('joins calling code and number', () => {
      expect(display('personal.phone', { callingCode: '+1', number: '5551234' })).toBe('+1 5551234');
    });
    it('shows only the number when calling code is absent', () => {
      expect(display('personal.phone', { number: '5551234' })).toBe('5551234');
    });
    it('returns "" for an empty value', () => {
      expect(display('personal.phone', null)).toBe('');
    });
  });

  describe('professional.noticePeriod', () => {
    it('renders "Immediate" when immediate is true', () => {
      expect(display('professional.noticePeriod', { immediate: true })).toBe('Immediate');
    });
    it('pluralises the unit for values other than 1', () => {
      expect(display('professional.noticePeriod', { value: 3, unit: 'week' })).toBe('3 weeks');
    });
    it('keeps the singular unit for a value of 1', () => {
      expect(display('professional.noticePeriod', { value: 1, unit: 'month' })).toBe('1 month');
    });
    it('returns "" when neither immediate nor value/unit are set', () => {
      expect(display('professional.noticePeriod', {})).toBe('');
      expect(display('professional.noticePeriod', null)).toBe('');
    });
  });

  describe('salary.current', () => {
    it('joins amount, currency and period parenthetically', () => {
      expect(display('salary.current', { amount: 5000, currency: 'USD', period: 'monthly' })).toBe('5000 USD (monthly)');
    });
    it('omits missing parts', () => {
      expect(display('salary.current', { currency: 'USD' })).toBe('USD');
    });
    it('returns "" for a null value', () => {
      expect(display('salary.current', null)).toBe('');
    });
  });

  describe('salary.expected', () => {
    it('renders each row on its own line with country appended', () => {
      expect(
        display('salary.expected', [
          { amount: 100, currency: 'USD', period: 'monthly', country: 'US' },
          { amount: 200, currency: 'GBP', period: 'annual', country: 'GB' },
        ]),
      ).toBe('100 USD (monthly) (US)\n200 GBP (annual) (GB)');
    });
    it('returns "" for an empty array', () => {
      expect(display('salary.expected', [])).toBe('');
    });
  });

  describe('workHistory', () => {
    it('formats a current role with "present" as the end', () => {
      expect(
        display('workHistory', [
          { company: 'Acme', title: 'PD', startDate: '2020-01', isCurrent: true },
        ]),
      ).toBe('PD at Acme (2020-01 – present)');
    });
    it('formats a past role with its end date', () => {
      expect(
        display('workHistory', [
          { company: 'Acme', title: 'PD', startDate: '2018-01', isCurrent: false, endDate: '2019-12' },
        ]),
      ).toBe('PD at Acme (2018-01 – 2019-12)');
    });
    it('omits the end segment when a past role has no end date', () => {
      expect(
        display('workHistory', [
          { company: 'Acme', title: 'PD', startDate: '2018-01', isCurrent: false },
        ]),
      ).toBe('PD at Acme (2018-01)');
    });
  });

  describe('education', () => {
    it('formats a degree with field, institution and date range', () => {
      expect(
        display('education', [
          { institution: 'MIT', degree: 'BSc', fieldOfStudy: 'CS', startDate: '2014', isCurrent: false, endDate: '2018' },
        ]),
      ).toBe('BSc in CS, MIT (2014 – 2018)');
    });
    it('uses "present" for a current programme', () => {
      expect(
        display('education', [
          { institution: 'MIT', degree: 'PhD', fieldOfStudy: 'AI', startDate: '2020', isCurrent: true },
        ]),
      ).toBe('PhD in AI, MIT (2020 – present)');
    });
  });
});
