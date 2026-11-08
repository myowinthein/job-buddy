// @vitest-environment jsdom
import { webcrypto } from 'node:crypto';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { RULE_PROFILE } from '../autofill/ruleMatching.fixture';
import { groupMappings } from './groups';
import { createPreviewChrome } from '../preview/chrome';
import {
  getProfile,
  getLearnedMappings,
  clearAllStorage,
  replaceProfileData,
  saveLearnedMappings,
} from '../utils/storage';
import {
  applyMappingReview,
  mappingReviewKeys,
  readMappingReviews,
  saveMappingReviews,
} from '../utils/learnedMappingReview';
import { reviewMappingsWithAI, GEMINI_REQUEST_TIMEOUT_MS } from '../resume-ai/gemini';
import { feedback } from '../ui/feedback';
import { KEY_ERROR_MESSAGES } from '../resume-ai/keyErrors';
import {
  hasReviewQuestion,
  mappingReviewBatches,
  mappingReviewCatalog,
  mappingReviewItems,
  mappingReviewPrompt,
  parseMappingAssessments,
  reviewedMappingChanges,
  type MappingAssessment,
  type MappingReviewDecision,
} from './review';
import type { LearnedMappings } from '../types/storage';
import type { Profile } from '../types/profile';

const model = 'gemini-3.8-flash';
const mappings: LearnedMappings = {
  'jobs.example.test': {
    salary: {
      path: 'salary.current.amount',
      count: 1,
      label: 'Expected salary',
      question: 'Expected salary',
    },
    salaryalias: {
      path: 'salary.current.amount',
      count: 2,
      label: 'Expected salary',
      question: 'Expected salary',
    },
    email: { path: 'personal.email', count: 1, label: 'Email' },
    unknown: { path: 'personal.firstName', count: 2 },
  },
};
const itemsFor = (data = mappings) =>
  mappingReviewItems(
    [...groupMappings(data)].flatMap(([domain, groups]) =>
      groups.map((group) => ({ domain, group })),
    ),
  );
const items = itemsFor();
const salary = items.find((item) => item.path === 'salary.current.amount')!;
const email = items.find((item) => item.path === 'personal.email')!;
const catalog = mappingReviewCatalog(RULE_PROFILE);
const allowed = new Set(catalog.map((field) => field.path));
const changed: MappingAssessment = {
  id: salary.id,
  verdict: 'change',
  path: 'salary.expected.0.amount',
  reason: 'This question asks for expected salary.',
};
const correct: MappingAssessment = {
  id: email.id,
  verdict: 'correct',
  path: null,
  reason: 'The email field matches.',
};
const read = (key: string) =>
  new Promise<Record<string, unknown>>((resolve) =>
    chrome.storage.local.get<Record<string, unknown>>(key, (data) => resolve(data)),
  );
const write = (data: Record<string, unknown>) =>
  new Promise<void>((resolve) => chrome.storage.local.set(data, resolve));
const response = (data: unknown) =>
  new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(data) }] } }] }),
    { status: 200 },
  );

beforeEach(() => {
  vi.stubEnv('DEV', false);
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal(
    'chrome',
    createPreviewChrome(RULE_PROFILE, undefined, {
      initialData: { profile: RULE_PROFILE, learnedMappings: mappings },
    }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it('groups equivalent aliases while keeping separate questions separate', () => {
  expect(items).toHaveLength(3);
  expect(salary.members).toHaveLength(2);
  expect(hasReviewQuestion(salary)).toBe(true);
  expect(hasReviewQuestion(items.find((item) => item.path === 'personal.firstName')!)).toBe(false);
  expect(hasReviewQuestion({ ...salary, question: 'Type your response' })).toBe(false);
  expect(hasReviewQuestion({ ...salary, question: 'field_001' })).toBe(false);
  expect(
    hasReviewQuestion({ ...email, question: 'An incomplete historical question '.repeat(5) }),
  ).toBe(false);
});

it('includes empty schema fields and never sends profile values, files or identity', () => {
  const profile = {
    id: 'private-profile-id',
    personal: { firstName: 'Private Applicant' },
    education: [],
    workHistory: [],
  } as unknown as Profile;
  const fields = mappingReviewCatalog(profile);
  expect(fields).toContainEqual(expect.objectContaining({ path: 'personal.email' }));
  expect(fields).toContainEqual(expect.objectContaining({ path: 'workHistory.0.company' }));
  expect(fields).toContainEqual(expect.objectContaining({ path: 'education.0.degree' }));
  const prompt = mappingReviewPrompt([salary], fields);
  expect(prompt).not.toContain('Private Applicant');
  expect(prompt).not.toContain('private-profile-id');
  expect(prompt).not.toContain('base64');
  expect(prompt).toContain('untrusted data');
});

it('enforces complete, unique results and exact allowed paths', () => {
  expect(
    parseMappingAssessments(JSON.stringify([correct, changed]), [salary, email], catalog),
  ).toEqual([changed, correct]);
  for (const bad of [
    [],
    [changed, changed],
    [changed],
    [changed, { ...correct, id: 'unknown' }],
    [{ ...changed, path: 'geminiApiKey' }, correct],
    [{ ...changed, path: salary.path }, correct],
    [{ ...changed, reason: 'a'.repeat(241) }, correct],
    [{ ...correct, path: 'personal.email' }, changed],
    [null, correct],
    { results: [changed, correct] },
  ]) {
    expect(() => parseMappingAssessments(JSON.stringify(bad), [salary, email], catalog)).toThrow(
      feedback.mappingReviewInvalid,
    );
  }
});

it('bounds requests without silently dropping mappings', () => {
  const many = Array.from({ length: 45 }, (_, index) => ({ ...salary, id: String(index) }));
  const batches = mappingReviewBatches(many, catalog);
  expect(batches.map((batch) => batch.length)).toEqual([20, 20, 5]);
  expect(batches.flat()).toEqual(many);
  expect(() => mappingReviewBatches([salary], [{ path: 'x', label: 'a'.repeat(100_000) }])).toThrow(
    feedback.mappingReviewTooLarge,
  );
});

it('keeps confirmations unchanged and only trusts explicitly approved changes', () => {
  const keep = reviewedMappingChanges(mappings, items, {}, allowed);
  expect(keep).toEqual(mappings);
  const decisions: Record<string, MappingReviewDecision> = {
    [salary.id]: { action: 'change', path: changed.path! },
  };
  const next = reviewedMappingChanges(mappings, items, decisions, allowed);
  expect(next['jobs.example.test'].email).toEqual(mappings['jobs.example.test'].email);
  for (const key of ['salary', 'salaryalias'])
    expect(next['jobs.example.test'][key]).toMatchObject({
      path: changed.path,
      count: 2,
      scope: 'entry',
      question: 'Expected salary',
    });
  const inactive = reviewedMappingChanges(
    mappings,
    items,
    { [salary.id]: { action: 'inactive' } },
    allowed,
  );
  expect(inactive['jobs.example.test'].salary).toMatchObject({
    inactive: true,
    count: 1,
    path: salary.path,
  });
  expect(inactive['jobs.example.test'].salaryalias).toMatchObject({ inactive: true, count: 2 });
});

it('reuses local assessments only for matching mapping, model, profile and entry structure', async () => {
  const profile = (await getProfile())!;
  const keys = await mappingReviewKeys(profile, items, model);
  await saveMappingReviews(profile, items, keys, [changed, correct], model);
  expect((await readMappingReviews(profile, items, keys)).size).toBe(2);
  expect(await getLearnedMappings()).toEqual(mappings);
  expect(
    await mappingReviewKeys(
      { ...profile, personal: { ...profile.personal, firstName: 'Another name' } },
      items,
      model,
    ),
  ).toEqual(keys);
  for (const other of [
    { ...profile, id: 'other-profile' },
    { ...profile, education: [...profile.education].reverse() },
  ]) {
    if (JSON.stringify(other) === JSON.stringify(profile)) continue;
    expect(
      (await readMappingReviews(other, items, await mappingReviewKeys(other, items, model))).size,
    ).toBe(0);
  }
  expect(
    (
      await readMappingReviews(
        profile,
        items,
        await mappingReviewKeys(profile, items, 'gemini-3.5-flash-lite'),
      )
    ).size,
  ).toBe(0);
  const edited = items.map((item) =>
    item.id === salary.id
      ? {
          ...item,
          members: item.members.map(
            ([key, value]) =>
              [
                key,
                typeof value === 'string' ? value : { ...value, count: 9 },
              ] as (typeof item.members)[number],
          ),
        }
      : item,
  );
  expect(
    (await readMappingReviews(profile, edited, await mappingReviewKeys(profile, edited, model)))
      .size,
  ).toBe(1);
});

it('rejects malformed cache data and preserves good cached results', async () => {
  const profile = (await getProfile())!;
  const keys = await mappingReviewKeys(profile, items, model);
  await saveMappingReviews(profile, items, keys, [changed, correct], model);
  const stored = (await read('learnedMappingReviews')).learnedMappingReviews as Record<
    string,
    unknown
  >;
  await write({
    learnedMappingReviews: {
      ...stored,
      [keys.get(salary.id)!]: {
        assessment: { ...changed, path: 'settings.apiKey' },
        model,
        reviewedAt: 1,
      },
    },
  });
  expect((await readMappingReviews(profile, items, keys)).size).toBe(1);
});

it('does not resurrect cached reviews or mappings after reset or profile replacement', async () => {
  const profile = (await getProfile())!;
  const keys = await mappingReviewKeys(profile, items, model);
  await saveMappingReviews(profile, items, keys, [changed], model);
  await clearAllStorage();
  await expect(saveMappingReviews(profile, items, keys, [changed], model)).rejects.toThrow(
    feedback.mappingReviewChanged,
  );
  await expect(
    applyMappingReview(profile, mappings, items, {
      [salary.id]: { action: 'change', path: changed.path! },
    }),
  ).rejects.toThrow(feedback.mappingReviewChanged);
  expect((await read('learnedMappingReviews')).learnedMappingReviews).toBeUndefined();
  await write({ profile, learnedMappings: mappings });
  await saveMappingReviews(profile, items, keys, [changed], model);
  await replaceProfileData({ ...profile, id: 'replacement' }, profile, {});
  expect((await read('learnedMappingReviews')).learnedMappingReviews).toEqual({});
});

it('atomically rejects concurrent edits and preserves unrelated mappings', async () => {
  const profile = (await getProfile())!;
  const decisions: Record<string, MappingReviewDecision> = {
    [salary.id]: { action: 'change', path: changed.path! },
    [email.id]: { action: 'inactive' },
  };
  const fresh = structuredClone(mappings);
  fresh['jobs.example.test'].email = { path: 'links.github', count: 2, label: 'Email' };
  await write({ learnedMappings: fresh });
  await expect(applyMappingReview(profile, mappings, items, decisions)).rejects.toThrow(
    feedback.mappingReviewChanged,
  );
  expect(await getLearnedMappings()).toEqual(fresh);
  await write({ learnedMappings: { ...mappings, 'other.test': { city: 'address.city' } } });
  await applyMappingReview(profile, mappings, items, decisions);
  expect((await getLearnedMappings())['other.test']).toEqual({ city: 'address.city' });
  expect((await getLearnedMappings())['jobs.example.test'].salary).toMatchObject({
    path: changed.path,
    count: 2,
  });
});

it('keeps cache outside portable mappings and clears it on full mapping replacement', async () => {
  const profile = (await getProfile())!;
  const keys = await mappingReviewKeys(profile, items, model);
  await saveMappingReviews(profile, items, keys, [changed], model);
  expect(JSON.stringify(await getLearnedMappings())).not.toContain('reviewedAt');
  await saveLearnedMappings({});
  expect((await read('learnedMappingReviews')).learnedMappingReviews).toEqual({});
});

it('authenticates with a header and falls back from the chosen model on limits', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response('{}', { status: 429 }))
    .mockResolvedValueOnce(response([changed]));
  vi.stubGlobal('fetch', fetcher);
  const result = await reviewMappingsWithAI(
    'private-key',
    model,
    [salary],
    catalog,
    new AbortController().signal,
  );
  expect(result.assessments).toEqual([changed]);
  expect(result.model).toBe('gemini-3.5-flash-lite');
  expect(fetcher.mock.calls[0][0]).toContain(model);
  for (const [url, init] of fetcher.mock.calls) {
    expect(url).not.toContain('private-key');
    expect(init.headers['x-goog-api-key']).toBe('private-key');
    expect(init.body).not.toContain('private-key');
    expect(init.body).not.toContain(RULE_PROFILE.personal.email);
  }
});

it('reports failures as failures and never caches them as uncertain assessments', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 403 })));
  await expect(
    reviewMappingsWithAI('key', model, [salary], catalog, new AbortController().signal),
  ).rejects.toThrow(KEY_ERROR_MESSAGES.permission_denied);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([])));
  await expect(
    reviewMappingsWithAI('key', model, [salary], catalog, new AbortController().signal),
  ).rejects.toThrow(feedback.mappingReviewInvalid);
  expect((await read('learnedMappingReviews')).learnedMappingReviews).toBeUndefined();
});

it('cancels promptly and keeps timeout active through response parsing', async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockImplementation(
        (_url, init) =>
          new Promise((_resolve, reject) =>
            init.signal.addEventListener('abort', () => reject(init.signal.reason)),
          ),
      ),
  );
  const controller = new AbortController();
  const task = reviewMappingsWithAI('key', model, [salary], catalog, controller.signal);
  const aborted = expect(task).rejects.toMatchObject({ name: 'AbortError' });
  controller.abort();
  await aborted;
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: () => new Promise(() => {}) }),
  );
  const timeout = reviewMappingsWithAI(
    'key',
    model,
    [salary],
    catalog,
    new AbortController().signal,
  );
  const rejected = expect(timeout).rejects.toThrow(KEY_ERROR_MESSAGES.timeout);
  await vi.advanceTimersByTimeAsync(GEMINI_REQUEST_TIMEOUT_MS * 2 + 1);
  await rejected;
});
