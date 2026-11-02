// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createPreviewChrome } from '@/src/preview/chrome';
import { RULE_PROFILE } from '@/src/autofill/ruleMatching.fixture';
import { mapField } from '@/src/autofill/mapper';
import { extractSignals } from '@/src/autofill/signals';
import { applyChanges, generateDiff } from '@/src/resume-ai/parser';
import { applyReviewedResumeChanges, resumeChanges } from '@/src/resume-ai/resumeImport';
import { selectEntry } from '@/src/resume-ai/entrySelection';
import { validateBackupData } from './backupImport';
import { validateImportedProfile } from './profileValidator';
import { rebaseLearnedMappings } from './learnedMappingProfile';
import { replaceImportedProfile } from './replaceImportedProfile';
import {
  getProfile,
  getLearnedMappings,
  saveProfile,
  saveLearnedMappings,
  getLearningContext,
  saveLearnedObservationLocally,
  mergeLearnedMappings,
} from './storage';
import type { LearnedMappings } from '@/src/types/storage';
import type { Profile } from '@/src/types/profile';

const set = (data: Record<string, unknown>) =>
  new Promise<void>((resolve) => chrome.storage.local.set(data, resolve));
const mappings: LearnedMappings = {
  'example.test': { school: { path: 'education.0.institution', count: 2, scope: 'entry' } },
};
beforeEach(() => {
  vi.stubEnv('DEV', false);
  vi.stubGlobal(
    'chrome',
    createPreviewChrome(RULE_PROFILE, undefined, {
      initialData: { profile: RULE_PROFILE, learnedMappings: mappings },
    }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it('keeps an entry-specific mapping attached through a resume reorder and atomic save', async () => {
  const incoming = { education: [...RULE_PROFILE.education].reverse() };
  const changes = resumeChanges(RULE_PROFILE, incoming);
  const next = applyReviewedResumeChanges(RULE_PROFILE, changes) as Profile;
  await saveProfile(next);
  expect((await getProfile())?.education[1].institution).toBe(
    RULE_PROFILE.education[0].institution,
  );
  expect((await getLearnedMappings())['example.test'].school).toMatchObject({
    path: 'education.1.institution',
    count: 2,
  });
});

it.each([
  'education',
  'workHistory',
  'languages',
  'workAuthorization',
  'links.custom',
  'salary.expected',
])('rebases entry-specific %s mappings while retaining field-scoped choices', (family) => {
  const rows: Record<string, Record<string, unknown>[]> = {
    education: [{ institution: 'School A' }, { institution: 'School B' }],
    workHistory: [
      { company: 'Company A', startDate: '2020-01' },
      { company: 'Company B', startDate: '2022-01' },
    ],
    languages: [{ language: 'en' }, { language: 'my' }],
    workAuthorization: [{ country: 'US' }, { country: 'TH' }],
    'links.custom': [
      { label: 'A', url: 'https://a.test' },
      { label: 'B', url: 'https://b.test' },
    ],
    'salary.expected': [
      { currency: 'USD', period: 'monthly', amount: 1 },
      { currency: 'THB', period: 'monthly', amount: 2 },
    ],
  };
  const make = (list: unknown[]) =>
    family === 'links.custom'
      ? { links: { custom: list } }
      : family === 'salary.expected'
        ? { salary: { expected: list } }
        : { [family]: list };
  const map: LearnedMappings = {
    'a.test': {
      bound: {
        path: `${family}.0.${family === 'links.custom' ? 'url' : Object.keys(rows[family][0])[0]}`,
        count: 2,
        scope: 'entry',
      },
      generic: {
        path: `${family}.0.${family === 'links.custom' ? 'url' : Object.keys(rows[family][0])[0]}`,
        count: 2,
        scope: 'field',
      },
    },
  };
  const next = rebaseLearnedMappings(
    map,
    make(rows[family]) as Partial<Profile>,
    make([...rows[family]].reverse()) as Partial<Profile>,
  );
  expect(next['a.test'].bound).toMatchObject({ path: expect.stringContaining(`${family}.1.`) });
  expect(next['a.test'].generic).toEqual(map['a.test'].generic);
});

it('retains removed or ambiguous entries as inactive instead of pointing to another entry', () => {
  const target = { ...RULE_PROFILE, education: [RULE_PROFILE.education[1]] };
  const next = rebaseLearnedMappings(mappings, RULE_PROFILE, target);
  expect(next['example.test'].school).toMatchObject({
    path: 'education.0.institution',
    inactive: true,
  });
  const ambiguous = rebaseLearnedMappings(mappings, RULE_PROFILE, {
    ...RULE_PROFILE,
    education: [RULE_PROFILE.education[0], RULE_PROFILE.education[0]],
  });
  expect(ambiguous['example.test'].school).toMatchObject({ inactive: true });
});

it.each(['update', 'replace'] as const)(
  'rebases incoming mappings against individually selected entries in %s',
  async (mode) => {
    const current = { ...RULE_PROFILE, education: [] };
    await set({ profile: current, learnedMappings: {} });
    const changes = generateDiff(current, RULE_PROFILE).map((change) =>
      change.id === 'education' ? selectEntry(change, 0, false) : change,
    );
    const next = applyChanges(current, changes) as Profile;
    const incoming: LearnedMappings = {
      'example.test': {
        dropped: { path: 'education.0.institution', count: 2, scope: 'entry' },
        selected: { path: 'education.1.institution', count: 2, scope: 'entry' },
      },
    };
    if (mode === 'update') await saveProfile(next, { incoming, base: {}, source: RULE_PROFILE });
    else
      await replaceImportedProfile(
        current,
        [
          ...changes,
          {
            id: 'backup.learnedMappings',
            label: 'Learned Mappings',
            section: 'Learned Mappings',
            currentValue: {},
            suggestedValue: incoming,
            displayCurrent: '',
            displaySuggested: '',
            status: 'new',
            accepted: true,
          },
        ],
        false,
        RULE_PROFILE,
      );
    const saved = await getLearnedMappings();
    expect((await getProfile())?.education.map((row) => row.institution)).toEqual([
      RULE_PROFILE.education[1].institution,
    ]);
    expect(saved['example.test'].dropped).toMatchObject({ inactive: true });
    expect(saved['example.test'].selected).toMatchObject({ path: 'education.0.institution' });
  },
);

it('preserves concurrent deletions, corrections and newly learned signals during an import', async () => {
  const base: LearnedMappings = {
    'a.test': {
      deleted: 'personal.firstName',
      corrected: 'personal.lastName',
      retrained: { path: 'personal.email', count: 2 },
    },
  };
  const fresh: LearnedMappings = {
    'a.test': {
      corrected: 'personal.email',
      learned: { path: 'address.city', count: 1 },
      retrained: { path: 'personal.email', count: 1 },
    },
  };
  await saveLearnedMappings(fresh);
  await saveProfile(RULE_PROFILE, {
    base,
    incoming: { 'a.test': { ...base['a.test'], added: 'address.country' } },
    source: RULE_PROFILE,
  });
  expect(await getLearnedMappings()).toEqual({
    'a.test': { ...fresh['a.test'], added: 'address.country' },
  });
});

it('leaves both profile and LM unchanged when the combined storage transaction fails', async () => {
  const before = await getProfile(),
    beforeMappings = await getLearnedMappings();
  const write = vi.spyOn(chrome.storage.local, 'set').mockImplementationOnce(() => {
    throw new Error('Quota exceeded');
  });
  await expect(
    saveProfile(
      { ...RULE_PROFILE, address: { city: 'Changed', country: 'US' } },
      {
        base: mappings,
        incoming: { 'other.test': { email: 'personal.email' } },
        source: RULE_PROFILE,
      },
    ),
  ).rejects.toThrow('Quota exceeded');
  expect(write).toHaveBeenCalledTimes(1);
  expect(await getProfile()).toEqual(before);
  expect(await getLearnedMappings()).toEqual(beforeMappings);
});

it('does not write anything when a fresh LM read fails', async () => {
  const before = await getProfile();
  const original = chrome.storage.local.get.bind(chrome.storage.local);
  vi.spyOn(chrome.storage.local, 'get').mockImplementation((keys, callback) => {
    if (keys === 'learnedMappings') throw new Error('Read failed');
    return original(keys, callback!);
  });
  const write = vi.spyOn(chrome.storage.local, 'set');
  await expect(saveProfile({ ...RULE_PROFILE, id: 'changed' })).rejects.toThrow('Read failed');
  expect(write).not.toHaveBeenCalled();
  expect(await getProfile()).toEqual(before);
});

it('round-trips historical mapping metadata without making it executable', async () => {
  await set({
    learnedMappings: {
      'example.test': {
        school: 'retired.oldField',
        dormant: { path: 'personal.firstName', count: 2, inactive: true },
      },
    },
  });
  const exported = await getLearnedMappings();
  const parsed = validateBackupData(JSON.parse(JSON.stringify({ learnedMappings: exported })));
  expect(parsed.invalidFields).toEqual([]);
  expect(parsed.learnedMappings).toEqual(exported);
  document.body.innerHTML = '<label>Novel response<input id="dormant"></label>';
  expect(
    mapField(
      extractSignals(document.querySelector('input')!),
      RULE_PROFILE,
      exported,
      'example.test',
    ).matchLayer,
  ).not.toBe('learned');
  await saveProfile(RULE_PROFILE, {
    incoming: parsed.learnedMappings!,
    base: {},
    source: RULE_PROFILE,
  });
  expect(await getLearnedMappings()).toEqual(exported);
});

it('starts a new confirmation count when manually relearning an inactive mapping', async () => {
  await saveLearnedMappings({
    'example.test': { school: { path: 'personal.email', count: 5, inactive: true } },
  });
  const profile = await getProfile();
  await saveLearnedObservationLocally('example.test', {
    signals: ['school'],
    path: 'personal.email',
    context: (await getLearningContext(profile))!,
  });
  expect((await getLearnedMappings())['example.test'].school).toEqual({
    path: 'personal.email',
    count: 1,
  });
});

it('does not transfer trust or activation between active and inactive snapshots', () => {
  const active: LearnedMappings = { 'a.test': { q: { path: 'personal.email', count: 1 } } };
  const inactive: LearnedMappings = {
    'a.test': { q: { path: 'personal.email', count: 7, inactive: true } },
  };
  expect(mergeLearnedMappings(active, inactive)).toEqual(active);
  expect(mergeLearnedMappings(inactive, active)).toEqual(inactive);
});

it.each([
  ['education', 'institution', { education: [null, RULE_PROFILE.education[0]] }],
  ['workHistory', 'company', { workHistory: [null, RULE_PROFILE.workHistory[0]] }],
  ['languages', 'language', { languages: [null, RULE_PROFILE.languages[0]] }],
  ['workAuthorization', 'country', { workAuthorization: [null, { country: 'US', status: 'citizen_or_pr' }] }],
  ['salary.expected', 'amount', { salary: { expected: [null, RULE_PROFILE.salary.expected[0]] } }],
  ['links.custom', 'url', { links: { custom: [null, { label: 'Site', url: 'https://example.test' }] } }],
] as const)('tracks discarded rows before rebasing %s mappings', (family, property, raw) => {
  const entryIndices = {};
  validateImportedProfile(raw, { entryIndices });
  const backup = validateBackupData({ learnedMappings: { 'a.test': {
    dropped: { path: `${family}.0.${property}`, count: 2, scope: 'entry' },
    kept: { path: `${family}.1.${property}`, count: 2, scope: 'entry' },
    generic: { path: `${family}.1.${property}`, count: 2, scope: 'field' },
  } } }, entryIndices);
  expect(backup.learnedMappings?.['a.test'].dropped).toMatchObject({ inactive: true });
  expect(backup.learnedMappings?.['a.test'].kept).toMatchObject({ path: `${family}.0.${property}` });
  expect(backup.learnedMappings?.['a.test'].generic).toMatchObject({ path: `${family}.0.${property}` });
});
it('does not let an invalid work authorization reserve its country before a valid entry', () => {
  const entryIndices = {};
  const result = validateImportedProfile({ workAuthorization: [
    { country: 'US', status: 'work_visa', expiryDate: 'bad-date' },
    { country: 'US', status: 'citizen_or_pr' },
  ] }, { entryIndices });
  expect(result.sanitized.workAuthorization).toHaveLength(1);
  expect(entryIndices).toMatchObject({ workAuthorization: { 1: 0 } });
});
