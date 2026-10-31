import { describe, expect, it } from 'vitest';
import { applyChanges, generateDiff } from './parser';
import { resumeChanges, applyReviewedResumeChanges } from './resumeImport';
import { assertImportCurrent, replacementChanges } from '@/src/utils/importPolicy';
import { acceptAllChanges } from '@/src/utils/backupImport';
import { reviewCounts, selectChange, selectEntry } from './entrySelection';

const school = (institution: string) => ({
  institution,
  degree: 'BA',
  fieldOfStudy: 'Design',
  startDate: '2020',
  endDate: '2024',
});
const job = (company: string) => ({
  company,
  title: 'Designer',
  startDate: '2024-01',
  isCurrent: true,
});
const changeFor = (id: string, current: object, incoming: object) =>
  generateDiff(current, incoming).find((change) => change.id === id)!;
const authorization = (country: string) => ({ country, status: 'citizen_or_pr' as const });

describe('individual import entries', () => {
  it.each(['education', 'workHistory'] as const)(
    'imports only selected new %s entries',
    (section) => {
      const rows = section === 'education' ? ['A', 'B', 'C'].map(school) : ['A', 'B', 'C'].map(job);
      let change = changeFor(section, {}, { [section]: rows });
      expect(reviewCounts(change)).toMatchObject({ total: 3, selected: 3, new: 3 });
      change = selectEntry(change, 1, false);
      expect(reviewCounts(change).selected).toBe(2);
      expect(applyChanges({}, [change])[section]).toEqual([rows[0], rows[2]]);
      change = selectEntry(change, 1, true);
      expect(applyChanges({}, [change])[section]).toEqual(rows);
    },
  );

  it('keeps a rejected matched entry and a rejected removal while applying other selected entries', () => {
    const current = { education: [school('Matched'), school('Omitted')] };
    const incoming = { education: [{ ...school('Matched'), degree: 'MA' }, school('New')] };
    let change = changeFor('education', current, incoming);
    change = selectEntry(change, 0, false);
    change = selectEntry(change, 2, false);
    expect(applyChanges(current, [change]).education).toEqual([
      current.education[0],
      incoming.education[1],
      current.education[1],
    ]);
    expect(applyChanges(current, acceptAllChanges([change])).education).toEqual(incoming.education);
  });

  it('preserves default JSON/Drive list replacement including omitted saved entries', () => {
    const current = { education: [school('Old')] };
    const incoming = { education: [school('New')] };
    const change = changeFor('education', current, incoming);
    expect(applyChanges(current, [change]).education).toEqual(incoming.education);
    expect(applyChanges(current, [selectChange(change, false)])).toEqual(current);
  });

  it('preserves omitted resume entries and missing details when individual incoming entries are rejected', () => {
    const current = { education: [school('Matched'), school('Omitted')] };
    const incoming = {
      education: [{ ...school('Matched'), degree: 'MA', startDate: '' }, school('New')],
    };
    let change = resumeChanges(current, incoming).find((change) => change.id === 'education')!;
    change = selectEntry(change, 1, false);
    expect(applyReviewedResumeChanges(current, [change]).education).toEqual([
      { ...school('Matched'), degree: 'MA' },
      current.education[1],
    ]);
  });

  it('does not carry rejected or omitted saved entries into a replacement, including equal entries', () => {
    const current = { education: [school('Same'), school('Old')] };
    const incoming = { education: [school('Same'), school('New')] };
    let change = replacementChanges(current, incoming).find((change) => change.id === 'education')!;
    expect(reviewCounts(change)).toMatchObject({ total: 2, selected: 2, cleared: 1 });
    change = selectEntry(change, 0, false);
    expect(applyChanges({}, [change]).education).toEqual([school('New')]);
  });

  it('selects exactly one entry after clearing the whole selection', () => {
    const original = changeFor('education', {}, { education: ['A', 'B', 'C'].map(school) });
    const selected = selectEntry(selectChange(original, false), 1, true);
    expect(reviewCounts(selected)).toMatchObject({ total: 3, selected: 1 });
    expect(applyChanges({}, [selected]).education).toEqual([school('B')]);
  });

  it('keeps exact saved copies distinct when labels are ambiguous', () => {
    const current = { education: [school('Same'), { ...school('Same'), startDate: '2018' }] };
    const incoming = { education: [{ ...school('Same'), degree: 'MA', endDate: '' }] };
    let change = resumeChanges(current, incoming).find((change) => change.id === 'education')!;
    change = selectEntry(change, 0, false);
    expect(applyReviewedResumeChanges(current, [change]).education).toEqual(current.education);
  });

  it('keeps the existing review guard for concurrent changes to a selected list', () => {
    const current = { workHistory: [job('A')] };
    const change = selectEntry(
      resumeChanges(current, { workHistory: [job('B'), job('C')] }).find(
        (change) => change.id === 'workHistory',
      )!,
      0,
      false,
    );
    expect(() =>
      applyReviewedResumeChanges({ workHistory: [job('Concurrent')] }, [change]),
    ).toThrow('changed in another tab');
  });

  it('requires another review when concurrent data matches the unfiltered list but not the selection', () => {
    const current = { education: [school('Saved')] };
    const incoming = { education: [school('A'), school('B')] };
    const change = selectEntry(changeFor('education', current, incoming), 1, false);
    expect(() => assertImportCurrent(current, incoming, [change])).toThrow(
      'changed in another tab',
    );
    expect(() => applyReviewedResumeChanges(incoming, [change])).toThrow('changed in another tab');
    expect(() =>
      assertImportCurrent(current, { education: [school('A')] }, [change]),
    ).not.toThrow();
  });

  it('does not count omitted saved lists as changes or removals', () => {
    const change = changeFor('education', { education: [school('Saved')] }, {});
    expect(reviewCounts(change)).toEqual({
      total: 0,
      selected: 0,
      new: 0,
      changed: 0,
      unchanged: 0,
      incoming: 0,
      cleared: 0,
    });
  });

  it('counts unchanged list entries individually', () => {
    const data = { education: [school('A'), school('B')] };
    expect(reviewCounts(changeFor('education', data, data))).toMatchObject({
      total: 0,
      selected: 0,
      unchanged: 2,
    });
  });

  it('selects languages individually with readable names and proficiency labels', () => {
    const incoming = {
      languages: [
        { language: 'en', proficiency: 'full_professional' as const },
        { language: 'my', proficiency: 'native_bilingual' as const },
      ],
    };
    let change = changeFor('languages', {}, incoming);
    expect(change.entries![0]).toMatchObject({
      label: 'English',
      fields: [{ label: 'Proficiency', suggested: 'Fluent' }],
    });
    change = selectEntry(change, 1, false);
    expect(applyChanges({}, [change]).languages).toEqual([incoming.languages[0]]);
  });
});

describe('individual work authorizations', () => {
  it('counts and imports each new country independently', () => {
    const rows = ['US', 'GB', 'TH'].map(authorization);
    const change = selectEntry(
      changeFor('workAuthorization', {}, { workAuthorization: rows }),
      1,
      false,
    );
    expect(reviewCounts(change)).toMatchObject({ total: 3, selected: 2, new: 3 });
    expect(change.entries![0]).toMatchObject({
      label: 'United States',
      fields: expect.arrayContaining([
        {
          label: 'Status',
          current: 'Not provided',
          suggested: 'Citizen / Permanent Resident',
          changed: true,
        },
      ]),
    });
    expect(applyChanges({}, [change]).workAuthorization).toEqual([rows[0], rows[2]]);
    const single = selectEntry(selectChange(change, false), 1, true);
    expect(applyChanges({}, [single]).workAuthorization).toEqual([rows[1]]);
  });

  it('matches countries by code or name and preserves rejected changes and removals for JSON/Drive', () => {
    const current = { workAuthorization: [authorization('US'), authorization('TH')] };
    const incoming = {
      workAuthorization: [
        {
          country: 'United States',
          status: 'work_visa' as const,
          visaType: 'H-1B',
          expiryDate: '2028-01-31',
        },
        authorization('GB'),
      ],
    };
    let change = changeFor('workAuthorization', current, incoming);
    expect(change.entries!.map((entry) => entry.status)).toEqual(['changed', 'new', 'removed']);
    change = selectEntry(selectEntry(change, 0, false), 2, false);
    expect(applyChanges(current, [change]).workAuthorization).toEqual([
      current.workAuthorization[0],
      incoming.workAuthorization[1],
      current.workAuthorization[1],
    ]);
    expect(applyChanges(current, acceptAllChanges([change])).workAuthorization).toEqual(
      incoming.workAuthorization,
    );
  });

  it('keeps saved resume authorizations and missing visa details while respecting individual choices', () => {
    const current = {
      workAuthorization: [
        { country: 'US', status: 'work_visa' as const, visaType: 'H-1B', expiryDate: '2028-01-31' },
        authorization('TH'),
      ],
    };
    const incoming = {
      workAuthorization: [
        { country: 'US', status: 'requires_sponsorship' as const },
        authorization('GB'),
      ],
    };
    const change = selectEntry(
      resumeChanges(current, incoming).find((c) => c.id === 'workAuthorization')!,
      1,
      false,
    );
    expect(applyReviewedResumeChanges(current, [change]).workAuthorization).toEqual([
      { ...current.workAuthorization[0], status: 'requires_sponsorship' },
      current.workAuthorization[1],
    ]);
    expect(() =>
      applyReviewedResumeChanges({ workAuthorization: [authorization('CA')] }, [change]),
    ).toThrow('changed in another tab');
  });

  it('replaces with only selected incoming countries, including unchanged entries', () => {
    const current = { workAuthorization: ['US', 'TH'].map(authorization) };
    const incoming = { workAuthorization: ['US', 'GB'].map(authorization) };
    let change = replacementChanges(current, incoming).find((c) => c.id === 'workAuthorization')!;
    expect(reviewCounts(change)).toMatchObject({ total: 2, selected: 2, cleared: 1 });
    change = selectEntry(change, 0, false);
    expect(applyChanges({}, [change]).workAuthorization).toEqual([incoming.workAuthorization[1]]);
  });
});

const link = (
  label: string,
  url = `https://example.com/${label.toLowerCase().replace(/\s+/g, '-')}`,
) => ({
  label,
  url,
});
it('matches custom links by URL or unique label and preserves rejected changes and removals', () => {
  const current = {
    links: { linkedin: '', custom: [link('Docs'), link('Old label'), link('Saved')] },
  };
  const incoming = {
    links: {
      linkedin: '',
      custom: [
        link('Docs', 'https://example.com/new-docs'),
        link('New label', link('Old label').url),
        link('New'),
      ],
    },
  };
  let change = changeFor('links.custom', current, incoming);
  expect(change.entries?.slice(0, 2).map((entry) => entry.status)).toEqual(['changed', 'changed']);
  change = selectEntry(change, 0, false);
  change = selectEntry(change, 3, false);
  expect(applyChanges(current, [change]).links?.custom).toEqual([
    current.links.custom[0],
    incoming.links.custom[1],
    incoming.links.custom[2],
    current.links.custom[2],
  ]);
});

it('keeps omitted resume links while filtering rejected incoming links', () => {
  const current = { links: { linkedin: '', custom: [link('Saved')] } };
  const incoming = { links: { linkedin: '', custom: [link('A'), link('B')] } };
  const change = selectEntry(
    resumeChanges(current, incoming).find((c) => c.id === 'links.custom')!,
    1,
    false,
  );
  expect(applyReviewedResumeChanges(current, [change]).links?.custom).toEqual([
    link('A'),
    link('Saved'),
  ]);
  expect(applyChanges(current, acceptAllChanges([change])).links?.custom).toEqual([
    link('A'),
    link('B'),
    link('Saved'),
  ]);
});

it('imports only selected custom links into a replacement', () => {
  const current = { links: { linkedin: '', custom: [link('Saved')] } };
  const incoming = { links: { linkedin: '', custom: [link('A'), link('B')] } };
  const change = selectEntry(
    replacementChanges(current, incoming).find((c) => c.id === 'links.custom')!,
    1,
    false,
  );
  expect(applyChanges({}, [change]).links?.custom).toEqual([link('A')]);
  expect(reviewCounts(change)).toMatchObject({ total: 2, selected: 1, new: 2, cleared: 1 });
});
