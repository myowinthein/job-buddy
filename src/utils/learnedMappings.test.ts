// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPreviewChrome } from '../preview/chrome';
import { RULE_PROFILE } from '../autofill/ruleMatching.fixture';
import {
  getLearningContext,
  getLearnedMappings,
  getProfile,
  saveLearnedObservationLocally,
  saveLearnedMappings,
  clearAllStorage,
  replaceProfileData,
  saveProfile,
  mergeLearnedMappings,
} from './storage';
import { validateBackupData } from './backupImport';
import { mapField } from '../autofill/mapper';
import { extractSignals } from '../autofill/signals';
import { saveElementMappings } from '../autofill/mappings';
import type { LearnedObservation } from '../types/storage';

beforeEach(() => {
  vi.stubEnv('DEV', false);
  vi.stubGlobal(
    'chrome',
    createPreviewChrome(RULE_PROFILE, undefined, {
      initialData: { profile: RULE_PROFILE, learnedMappings: {} },
    }),
  );
  document.body.innerHTML = '';
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const set = (data: Record<string, unknown>) =>
  new Promise<void>((resolve) => chrome.storage.local.set(data, resolve));
async function observation(): Promise<LearnedObservation> {
  const profile = await getProfile();
  return {
    signals: ['novel', 'q7'],
    path: 'personal.email',
    label: 'Novel response',
    question: 'Novel response',
    context: (await getLearningContext(profile!))!,
  };
}

describe('mapping storage integrity', () => {
  it('rejects a stale editor even when a replacement reuses the same mapping keys', async () => {
    const obs = await observation();
    await saveLearnedObservationLocally('example.test', obs);
    const base = await getLearnedMappings();
    await replaceProfileData({ ...RULE_PROFILE, id: 'new-person' }, RULE_PROFILE, base);
    await expect(
      saveLearnedMappings(
        {
          'example.test': { ...base['example.test'], q7: { path: 'personal.firstName', count: 2 } },
        },
        { base, context: obs.context },
      ),
    ).rejects.toThrow('Profile changed');
    expect(await getLearnedMappings()).toEqual(base);
  });
  it('does not let a stale editor snapshot recreate mappings after reset', async () => {
    const obs = await observation();
    await saveLearnedObservationLocally('example.test', obs);
    const base = await getLearnedMappings();
    await clearAllStorage();
    await expect(
      saveLearnedMappings(
        {
          'example.test': { ...base['example.test'], q7: { path: 'personal.firstName', count: 2 } },
        },
        { base },
      ),
    ).rejects.toThrow('changed before saving');
    expect(await getLearnedMappings()).toEqual({});
  });
  it('does not let a delayed profile migration resurrect data after reset', async () => {
    const { id: _id, ...old } = RULE_PROFILE;
    await set({ profile: old });
    const original = chrome.storage.local.get.bind(chrome.storage.local);
    let release!: () => void;
    vi.spyOn(chrome.storage.local, 'get').mockImplementationOnce((key, callback) => {
      original(key, (data) => {
        release = () => callback!(data);
      });
    });
    const loading = getProfile();
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    await clearAllStorage();
    release();
    expect(await loading).toBeNull();
    expect(await getProfile()).toBeNull();
  });
  it('saves all distinct signals in one transaction and resets conflicting confirmations', async () => {
    const obs = await observation();
    const writes = vi.spyOn(chrome.storage.local, 'set');
    await saveLearnedObservationLocally('example.test', { ...obs, signals: ['novel', 'q7', 'q7'] });
    expect(writes).toHaveBeenCalledTimes(1);
    expect((await getLearnedMappings())['example.test'].q7).toMatchObject({ count: 1 });
    await saveLearnedObservationLocally('example.test', obs);
    expect((await getLearnedMappings())['example.test'].q7).toMatchObject({ count: 2 });
    await saveLearnedObservationLocally('example.test', { ...obs, path: 'personal.firstName' });
    expect((await getLearnedMappings())['example.test'].q7).toMatchObject({
      count: 1,
      path: 'personal.firstName',
    });
  });
  it('rejects a failed read without overwriting any saved mappings', async () => {
    const obs = await observation();
    await set({
      learnedMappings: { 'keep.test': { email: { path: 'personal.email', count: 2 } } },
    });
    const writes = vi.spyOn(chrome.storage.local, 'set');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const original = chrome.storage.local.get.bind(chrome.storage.local);
    const reads = vi.spyOn(chrome.storage.local, 'get').mockImplementation((key, callback) => {
      if (key === 'learnedMappings') throw new Error('read failed');
      else original(key, callback!);
    });
    await expect(saveLearnedObservationLocally('new.test', obs)).rejects.toThrow('read failed');
    expect(writes).not.toHaveBeenCalled();
    reads.mockRestore();
    expect((await getLearnedMappings())['keep.test']).toHaveProperty('email');
  });
  it.each(['reset', 'replace', 'edit'] as const)(
    'rejects old observations after %s',
    async (action) => {
      const obs = await observation();
      if (action === 'reset') await clearAllStorage();
      else if (action === 'replace')
        await replaceProfileData({ ...RULE_PROFILE, id: 'new-person' }, RULE_PROFILE, {});
      else
        await saveProfile({
          ...RULE_PROFILE,
          personal: { ...RULE_PROFILE.personal, firstName: 'Updated' },
        });
      await saveLearnedObservationLocally('old.test', obs);
      expect(await getLearnedMappings()).toEqual({});
    },
  );
  it.each(['reset', 'replace'] as const)(
    'serializes an in-flight save before %s',
    async (action) => {
      const obs = await observation();
      const original = chrome.storage.local.set.bind(chrome.storage.local);
      let release!: () => void;
      vi.spyOn(chrome.storage.local, 'set').mockImplementationOnce((data, callback) => {
        release = () => original(data, callback!);
      });
      const saving = saveLearnedObservationLocally('old.test', obs);
      await vi.waitFor(() => expect(release).toBeTypeOf('function'));
      const clearing =
        action === 'reset'
          ? clearAllStorage()
          : replaceProfileData({ ...RULE_PROFILE, id: 'new-person' }, RULE_PROFILE, {});
      release();
      await saving;
      await clearing;
      expect(await getLearnedMappings()).toEqual({});
    },
  );
  it('keeps unrelated concurrent observations and editor changes', async () => {
    const obs = await observation();
    await Promise.all([
      saveLearnedObservationLocally('a.test', obs),
      saveLearnedObservationLocally('b.test', obs),
    ]);
    const base = await getLearnedMappings();
    await saveLearnedObservationLocally('c.test', obs);
    await saveLearnedMappings(
      { ...base, 'a.test': { novel: { path: 'personal.firstName', count: 2 } } },
      { base },
    );
    const result = await getLearnedMappings();
    expect(result['b.test']).toHaveProperty('novel');
    expect(result['c.test']).toHaveProperty('novel');
    expect(result['a.test'].novel).toMatchObject({ path: 'personal.firstName', scope: 'entry' });
  });
  it('uses captured profile content rather than pairing an old profile with a new revision', async () => {
    await saveProfile({
      ...RULE_PROFILE,
      personal: { ...RULE_PROFILE.personal, firstName: 'Updated' },
    });
    expect(await getLearningContext(RULE_PROFILE)).toBeNull();
  });
});

describe('mapping boundary validation and compatibility', () => {
  it('retains historical local paths for review without ever executing them', async () => {
    const stale = { path: 'retired.oldField', count: 2, inactive: true as const };
    const obs = await observation();
    // Use a different signal for the new observation; stale keys survive normal writes.
    await set({ learnedMappings: { 'example.test': { old: stale } } });
    await saveLearnedObservationLocally('example.test', obs);
    const mappings = await getLearnedMappings();
    expect(mappings['example.test'].old).toEqual(stale);
    document.body.innerHTML = '<label>Novel response<input id="old"></label>';
    expect(
      mapField(
        extractSignals(document.querySelector('input')!),
        RULE_PROFILE,
        mappings,
        'example.test',
      ).matchLayer,
    ).not.toBe('learned');
    expect(
      mergeLearnedMappings(mappings, { 'other.test': { email: 'personal.email' } })['example.test']
        .old,
    ).toEqual(stale);
  });
  it.each([
    'id',
    'documents.cv.file.base64',
    'documents.coverLetter.file.name',
    'geminiApiKey',
    'constructor.name',
    'unknown.path',
  ])('rejects executable path %s', (path) => {
    const result = validateBackupData({
      learnedMappings: { 'example.test': { q: { path, count: 2 } } },
    });
    expect(result.invalidFields).toHaveLength(1);
    expect(result.learnedMappings).toEqual({});
  });
  it('ignores malformed local entries without crashing the mapper or deleting valid stale paths', async () => {
    await set({
      learnedMappings: {
        'example.test': {
          bad: { path: 17, count: 2 },
          stale: { path: 'education.50.institution', count: 2 },
        },
      },
    });
    const mappings = await getLearnedMappings();
    expect(mappings['example.test']).not.toHaveProperty('bad');
    document.body.innerHTML = '<label>Novel response<input id="bad"></label>';
    expect(() =>
      mapField(
        extractSignals(document.querySelector('input')!),
        RULE_PROFILE,
        mappings,
        'example.test',
      ),
    ).not.toThrow();
    expect(mappings['example.test'].stale).toMatchObject({ path: 'education.50.institution' });
  });
  it('round-trips question/scope metadata and still accepts old formats', () => {
    const mappings = {
      'example.test': {
        legacy: 'personal.email',
        new: {
          path: 'education.50.institution',
          count: 2,
          label: 'School',
          question: 'School attended',
          scope: 'entry' as const,
        },
      },
    };
    expect(validateBackupData({ learnedMappings: mappings })).toEqual({
      learnedMappings: mappings,
      invalidFields: [],
    });
  });
  it('keeps a recent local correction over high-count or legacy remote conflicts', () => {
    const local = { 'example.test': { q: { path: 'personal.lastName', count: 1 } } };
    for (const old of ['personal.firstName', { path: 'personal.firstName', count: 100 }])
      expect(mergeLearnedMappings(local, { 'example.test': { q: old } })).toEqual(local);
  });
  it('does not treat same-path backup snapshots as new confirmations', () => {
    const local = { 'example.test': { q: { path: 'personal.email', count: 1 } } };
    expect(mergeLearnedMappings(local, local)).toEqual(local);
  });
  it('backfills a counted label without touching legacy strings or performing no-op writes', async () => {
    await set({
      learnedMappings: {
        'example.test': { legacy: 'personal.email', q: { path: 'personal.firstName', count: 1 } },
      },
    });
    const writes = vi.spyOn(chrome.storage.local, 'set');
    const patch = {
      'example.test': {
        legacy: 'personal.email',
        q: { path: 'personal.firstName', count: 1, label: 'Novel response' },
      },
    };
    await saveLearnedMappings(patch, { labelsOnly: true });
    await saveLearnedMappings(patch, { labelsOnly: true });
    expect(writes).toHaveBeenCalledTimes(1);
    expect((await getLearnedMappings())['example.test']).toEqual(patch['example.test']);
  });
  it('saves five signal aliases together through the real observation implementation', async () => {
    document.body.innerHTML =
      '<label for="one">Novel response</label><input id="one" name="two" aria-label="Third signal" placeholder="Fourth signal">';
    const writes = vi.spyOn(chrome.storage.local, 'set');
    await saveElementMappings('example.test', document.querySelector('input')!, 'personal.email');
    expect(writes).toHaveBeenCalledTimes(1);
    expect(Object.keys((await getLearnedMappings())['example.test'])).toHaveLength(5);
  });
});
