// @vitest-environment jsdom
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { repairMappingDomain, type LearnedRepairField } from './learnedMappingRepair';
import { createPreviewChrome } from '../preview/chrome';
import { RULE_PROFILE } from '../autofill/ruleMatching.fixture';
import {
  getLearningContext,
  getProfile,
  getLearnedMappings,
  repairLearnedMappings,
  clearAllStorage,
  saveLearnedObservationLocally,
  saveLearnedMappings,
  replaceProfileData,
} from './storage';
import { groupMappings } from '../learned-mappings/groups';

const domain = 'example.test';
const old = { path: 'workHistory.0.company', count: 1, label: 'Current Employer* (required)' };
const evidence: LearnedRepairField[] = [
  {
    keys: [
      'currentemployer',
      'currentemployerrequired',
      'customattribute2523329',
      'fieldcustomattribute2523329',
    ],
    question: old.label,
  },
];
const aliases = Object.fromEntries(evidence[0].keys.map((key) => [key, { ...old }]));
beforeEach(() => {
  vi.stubEnv('DEV', false);
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal(
    'chrome',
    createPreviewChrome(RULE_PROFILE, undefined, {
      initialData: { profile: RULE_PROFILE, learnedMappings: { [domain]: aliases } },
    }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const context = async () => (await getLearningContext(await getProfile()))!;
const read = (key: string | string[]) =>
  new Promise<Record<string, unknown>>((resolve) =>
    chrome.storage.local.get<Record<string, unknown>>(key, (data) => resolve(data)),
  );

it('repairs the four Audi-style aliases without an edit or additional confirmations', async () => {
  const result = await repairLearnedMappings(domain, evidence, await context());
  for (const value of Object.values(result[domain]))
    expect(value).toEqual({ ...old, question: old.label });
  expect(groupMappings(result).get(domain)).toHaveLength(1);
  expect((await getLearnedMappings())[domain]).toEqual(result[domain]);
});

it('recovers a full long question from the live form without truncating its label', async () => {
  const question =
    'Which contact detail should be used for this application? '.repeat(24) + 'Final context';
  await new Promise<void>((resolve) =>
    chrome.storage.local.set(
      {
        learnedMappings: {
          [domain]: { q7: { path: 'personal.email', count: 1, label: question.slice(0, 120) } },
        },
      },
      resolve,
    ),
  );
  const repaired = await repairLearnedMappings(
    domain,
    [{ keys: ['q7'], question }],
    await context(),
  );
  expect(repaired[domain].q7).toEqual({
    path: 'personal.email',
    count: 1,
    label: question,
    question,
  });
});

it('writes nothing on a repeat scan and keeps checkpoints out of mapping data', async () => {
  const captured = await context();
  await repairLearnedMappings(domain, evidence, captured);
  const write = vi.spyOn(chrome.storage.local, 'set');
  await repairLearnedMappings(domain, evidence, captured);
  expect(write).not.toHaveBeenCalled();
  const saved = await read('learnedMappingRepairs');
  expect(saved).toMatchObject({
    learnedMappingRepairs: { [domain]: { currentemployer: { version: 1 } } },
  });
  expect((await getLearnedMappings())[domain].currentemployer).not.toHaveProperty('repair');
});

it('rechecks changed mappings and checkpoints from an older repair version', async () => {
  const first = await repairMappingDomain(aliases, evidence, {}, 'person');
  const stale = structuredClone(first.state);
  for (const checkpoint of Object.values(stale)) checkpoint.version = 0;
  const again = await repairMappingDomain(aliases, evidence, stale, 'person');
  expect(again.mappings.currentemployer).toHaveProperty('question', old.label);
  const changed = { ...first.mappings, currentemployer: { path: 'unknown.oldField', count: 1 } };
  const repaired = await repairMappingDomain(changed, evidence, first.state, 'person');
  expect(repaired.mappings.currentemployer).toMatchObject({ inactive: true, count: 1 });
});

it('retries missing form evidence when the corresponding input appears later', async () => {
  const first = await repairMappingDomain(aliases, [], {}, 'person');
  expect(first.mappings).toEqual(aliases);
  const next = await repairMappingDomain(first.mappings, evidence, first.state, 'person');
  expect(next.mappings.currentemployer).toHaveProperty('question', old.label);
});

it('keeps checkpoints stable across storage property order and unrelated forms', async () => {
  const value = { path: 'personal.email', count: 2, label: 'Email', question: 'Email' };
  const first = await repairMappingDomain({ email: value }, [], {}, 'person');
  const reordered = { question: 'Email', label: 'Email', count: 2, path: 'personal.email' };
  const next = await repairMappingDomain(
    { email: reordered },
    [{ keys: ['email', 'q2'], question: 'Email' }],
    first.state,
    'person',
  );
  expect(next.state).toEqual(first.state);
});

it('preserves inconsistent historical counts while displaying verified aliases once', async () => {
  const input = { ...aliases, currentemployer: { ...old, count: 3 } };
  const repaired = await repairMappingDomain(input, evidence, {}, 'person');
  expect(repaired.mappings.currentemployer).toMatchObject({ count: 3 });
  expect(repaired.mappings.customattribute2523329).toMatchObject({ count: 1 });
  const groups = groupMappings({ [domain]: repaired.mappings }).get(domain)!;
  expect(groups).toHaveLength(1);
  expect(groups[0].status).toBe('Trusted');
});

it('retains generic identifiers and unsupported historical paths as inactive records', async () => {
  const input = {
    typeyourresponse: { path: 'personal.nickname', count: 2 },
    cvurl: { path: 'documents.cv.file.name', count: 1 },
    widget: { path: 'languages.0.language', count: 1, label: 'Language Translate Widget' },
  };
  const result = await repairMappingDomain(input, [], {}, 'person');
  for (const [key, value] of Object.entries(input))
    expect(result.mappings[key]).toEqual({ ...value, inactive: true });
});

it('does not bind reused IDs, shared keys, or incomplete long questions', async () => {
  const input = {
    q7: { ...old, label: 'Previous employer' },
    shared: old,
    long: { ...old, label: 'A'.repeat(120), question: 'A'.repeat(120) },
    unidentified: { path: 'personal.email', count: 2 },
  };
  const result = await repairMappingDomain(
    input,
    [
      { keys: ['q7'], question: old.label },
      { keys: ['shared', 'row1'], question: old.label },
      { keys: ['shared', 'row2'], question: old.label },
      { keys: ['long'], question: 'A'.repeat(120) + ' a different ending' },
      { keys: ['unidentified'], question: 'Email' },
    ],
    {},
    'person',
  );
  expect(result.mappings).toEqual(input);
});

it('uses an independently matching visible question to recover missing alias labels', async () => {
  const input = {
    email: { path: 'personal.email', count: 1 },
    q7: { path: 'personal.email', count: 2 },
  };
  const result = await repairMappingDomain(
    input,
    [{ keys: ['email', 'q7'], question: 'Email' }],
    {},
    'person',
  );
  expect(result.mappings.q7).toEqual({
    path: 'personal.email',
    count: 2,
    label: 'Email',
    question: 'Email',
  });
});

it('upgrades verified legacy strings with their existing trust and leaves unknown IDs pending', async () => {
  const result = await repairMappingDomain(
    { email: 'personal.email', q7: 'personal.firstName' },
    [
      { keys: ['email'], question: 'Email' },
      { keys: ['q7'], question: 'Novel response' },
    ],
    {},
    'person',
  );
  expect(result.mappings.email).toEqual({
    path: 'personal.email',
    count: 2,
    label: 'Email',
    question: 'Email',
  });
  expect(result.mappings.q7).toBe('personal.firstName');
});

it('applies repairs to fresh mappings without overwriting a concurrent correction', async () => {
  const captured = await context();
  await saveLearnedObservationLocally(domain, {
    signals: ['customattribute2523329'],
    path: 'personal.email',
    label: 'Email',
    question: 'Email',
    context: captured,
  });
  await repairLearnedMappings(domain, evidence, captured);
  expect((await getLearnedMappings())[domain].customattribute2523329).toMatchObject({
    path: 'personal.email',
    question: 'Email',
  });
});

it('rejects stale repair after reset and clears its local checkpoints', async () => {
  const captured = await context();
  await repairLearnedMappings(domain, evidence, captured);
  await clearAllStorage();
  await expect(repairLearnedMappings(domain, evidence, captured)).rejects.toThrow(
    'Profile changed',
  );
  expect((await read('learnedMappingRepairs')).learnedMappingRepairs).toBeUndefined();
  expect(await getLearnedMappings()).toEqual({});
});

it('removes deleted mappings from checkpoints and clears them on profile replacement', async () => {
  const captured = await context();
  await repairLearnedMappings(domain, evidence, captured);
  const base = await getLearnedMappings();
  await saveLearnedMappings({}, { base, context: captured });
  expect((await read('learnedMappingRepairs')).learnedMappingRepairs).toEqual({});
  await saveLearnedMappings(base);
  await repairLearnedMappings(domain, evidence, captured);
  const profile = (await getProfile())!;
  await replaceProfileData({ ...profile, id: 'replacement-person' }, profile, {});
  expect((await read('learnedMappingRepairs')).learnedMappingRepairs).toEqual({});
});
