// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import {
  adjustRepeatingEntryMatches,
  matchCurrentEntryCheckboxes,
} from './repeatingEntryResolution';
import { RULE_PROFILE } from './ruleMatching.fixture';
import type { FieldMatch } from './mapper';

afterEach(() => {
  document.body.replaceChildren();
});

it('orders each form independently and binds current-status choices to the same source rows', () => {
  document.body.innerHTML =
    '<form><fieldset><input id="a0"><input id="c0" type="checkbox"></fieldset><fieldset><input id="a1"><input id="c1" type="checkbox"></fieldset></form><form><fieldset><input id="a2"><input id="c2" type="checkbox"></fieldset></form>';
  const entries = [
    { ...RULE_PROFILE.workHistory[0], startDate: '2023-01' },
    { ...RULE_PROFILE.workHistory[0], startDate: '2010-01' },
    { ...RULE_PROFILE.workHistory[0], startDate: '2020-01', isCurrent: true },
  ];
  const profile = { ...RULE_PROFILE, workHistory: entries };
  const matches: FieldMatch[] = ['a0', 'a1', 'a2'].map((id) => ({
    element: document.getElementById(id)!,
    fieldPath: 'workHistory.company',
    confidence: 0.85,
    value: null,
    matchLayer: 'dictionary_exact',
  }));
  adjustRepeatingEntryMatches(matches, entries, 'workHistory', profile);
  expect(matches.map((match) => match.fieldPath)).toEqual([
    'workHistory.2.company',
    'workHistory.0.company',
    'workHistory.2.company',
  ]);
  const choices = ['c0', 'c1', 'c2'].map((id) => ({
    element: document.getElementById(id)!,
    label: 'I currently work here',
    value: 'on',
  }));
  expect(
    matchCurrentEntryCheckboxes(
      choices,
      entries,
      new Set(['icurrentlyworkhere']),
      'workHistory.',
      matches,
    ).map((match) => [match.element.id, match.fieldPath]),
  ).toEqual([
    ['c0', 'workHistory.2.isCurrent'],
    ['c2', 'workHistory.2.isCurrent'],
  ]);
});

for (const [family, anchor, other] of [
  ['workHistory', 'title', 'company'],
  ['education', 'degree', 'institution'],
] as const) {
  it(`does not let a weak ${family} guess shift real repeated entries`, () => {
    document.body.innerHTML =
      '<form><textarea id="essay"></textarea><fieldset><input id="a0"><input id="b0"></fieldset><fieldset><input id="a1"><input id="b1"></fieldset></form>';
    const match = (id: string, key: string, confidence = 0.85): FieldMatch => ({
      element: document.getElementById(id)!,
      fieldPath: `${family}.${key}`,
      confidence,
      value: null,
      matchLayer: confidence < 0.6 ? 'fuzzy' : 'dictionary_exact',
    });
    const matches = [
      match('essay', anchor, 0.5),
      match('a0', anchor),
      match('b0', other),
      match('a1', anchor),
      match('b1', other),
    ];
    adjustRepeatingEntryMatches(matches, RULE_PROFILE[family], family, RULE_PROFILE);
    expect(matches.slice(1).map((item) => item.fieldPath)).toEqual([
      `${family}.1.${anchor}`,
      `${family}.1.${other}`,
      `${family}.0.${anchor}`,
      `${family}.0.${other}`,
    ]);
    expect(matches[0].confidence).toBe(0.5);
  });
}

for (const family of ['education', 'workHistory'] as const) {
  it(`keeps ${family} rows together in recency order without borrowing missing details`, () => {
    document.body.innerHTML =
      '<form><fieldset><input id="a0"><input id="d0"></fieldset><fieldset><input id="a1"></fieldset><fieldset><input id="a2"><input id="d2"></fieldset><fieldset><input id="a3"></fieldset></form>';
    const anchor = family === 'education' ? 'institution' : 'company';
    const detail = family === 'education' ? 'fieldOfStudy' : 'description';
    const entries = [
      {
        ...RULE_PROFILE[family][0],
        startDate: '2023-01',
        isCurrent: false,
        [anchor]: 'Recent',
        [detail]: 'Recent detail',
      },
      {
        ...RULE_PROFILE[family][0],
        startDate: '2010-01',
        isCurrent: false,
        [anchor]: 'Oldest',
        [detail]: 'Old detail',
      },
      {
        ...RULE_PROFILE[family][0],
        startDate: '2020-01',
        isCurrent: true,
        [anchor]: 'Current',
        [detail]: undefined,
      },
    ];
    const profile = { ...RULE_PROFILE, [family]: entries };
    const matches: FieldMatch[] = ['a0', 'd0', 'a1', 'a2', 'd2', 'a3'].map((id) => ({
      element: document.getElementById(id)!,
      fieldPath: `${family}.${id[0] === 'a' ? anchor : detail}`,
      confidence: 0.85,
      value: null,
      matchLayer: 'dictionary_exact',
    }));
    adjustRepeatingEntryMatches(matches, entries, family, profile);
    expect(matches.map((m) => m.fieldPath)).toEqual([
      `${family}.2.${anchor}`,
      `${family}.2.${detail}`,
      `${family}.0.${anchor}`,
      `${family}.1.${anchor}`,
      `${family}.1.${detail}`,
      `${family}.3.${anchor}`,
    ]);
    expect(matches.map((m) => m.value)).toEqual([
      'Current',
      null,
      'Recent',
      'Oldest',
      'Old detail',
      null,
    ]);
    expect(profile[family]).toEqual(entries);
  });
}
