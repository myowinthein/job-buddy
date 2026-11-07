// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createPreviewChrome } from '../preview/chrome';
import { RULE_PROFILE } from './ruleMatching.fixture';
import { mapField } from './mapper';
import { extractSignals } from './signals';
import { resolveProfileValue } from './resolver';
import { resolveRuleValue, ruleValuePath } from './ruleValue';
import { adjustWorkHistoryMatches } from './workHistoryResolution';
import { saveElementMappings } from './mappings';
import {
  getLearnedMappings,
  getLearningContext,
  getProfile,
  saveLearnedMappings,
  saveLearnedObservation,
} from '../utils/storage';
import { normalize } from './normalizer';
import { scanAutofill, executeAutofill, undoAutofill, getFillLog } from './index';
import { resolveFieldsWithAI } from '../resume-ai/gemini';
vi.mock('../resume-ai/gemini', () => ({ resolveFieldsWithAI: vi.fn().mockResolvedValue([]) }));

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: createPreviewChrome(RULE_PROFILE, undefined, {
      initialData: {
        profile: RULE_PROFILE,
        geminiApiKey: 'synthetic-key',
        geminiModel: 'gemini-3.8-flash',
        geminiDevDisabled: true,
        devProfileDisabled: true,
      },
    }),
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 100,
    height: 30,
  } as DOMRect);
});
afterEach(async () => {
  await undoAutofill();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
async function learn(domain: string, signal: string, path: string) {
  const context = (await getLearningContext(await getProfile()))!;
  await saveLearnedObservation(domain, { signals: [signal], path, context });
}
function field(html: string) {
  document.body.innerHTML = html;
  return document.querySelector<HTMLElement>('input,select,[contenteditable]')!;
}
async function fill(html: string) {
  field(html);
  await scanAutofill('rules');
  return executeAutofill('overwrite');
}
function match(html: string) {
  const element = field(html);
  return mapField(extractSignals(element), RULE_PROFILE, {}, 'example.test');
}

it.each([
  ['<label>Expected salary<input type="number" required></label>', '6000'],
  [
    '<label>Expected annual salary<input name="expectedSalary" type="number" required></label>',
    '72000',
  ],
  [
    '<label>Expected monthly salary THB<input name="expectedSalary" type="number" required></label>',
    '10000',
  ],
  ['<label>Employment start date<input type="month" required></label>', '2020-01'],
  ['<input autocomplete="country-name">', 'Thailand'],
  [
    '<label>Country<select><option value="">Select</option><option value="764">Thailand</option></select></label>',
    '764',
  ],
])('fills an appropriate value for %s', async (html, value) => {
  const result = await fill(html);
  const element = document.querySelector<HTMLInputElement | HTMLSelectElement>('input,select')!;
  expect(element.value).toBe(value);
  expect(element.validity.valid).toBe(true);
  expect(result.noReview).toBe(1);
});

it.each([
  '<label>Nationality<input></label>',
  '<label>Employment type<input></label>',
  '<label>Emergency contact email<input name="email"></label>',
  '<label>Upload work permit<input type="file" name="attachment"></label>',
])('does not fill unsupported semantics or send them to AI: %s', async (html) => {
  const result = await fill(html);
  expect(document.querySelector<HTMLInputElement>('input')!.value).toBe('');
  expect(result.noReview).toBe(0);
  expect(resolveFieldsWithAI).not.toHaveBeenCalled();
});

it('rejects invalid native values and offers failed rule fills to AI', async () => {
  const result = await fill(
    '<label>Country<select><option value="">Select</option><option value="x">Other</option></select></label>',
  );
  expect(result.failed).toBe(1);
  expect(resolveFieldsWithAI).toHaveBeenCalled();
  expect(getFillLog()?.fields[0].ai.outcome).toBe('no_response');
});
it('does not select a disabled optgroup option', async () => {
  const result = await fill(
    '<label>Country<select required><option value="">Select</option><optgroup disabled><option value="TH">Thailand</option></optgroup></select></label>',
  );
  expect(document.querySelector('select')!.value).toBe('');
  expect(result.noReview).toBe(0);
});
it('rejects an unavailable currency and an incomplete full calendar date', async () => {
  let result = await fill(
    '<label>Expected salary EUR<input type="number" name="expectedSalary"></label>',
  );
  expect(document.querySelector('input')!.value).toBe('');
  expect(result.noReview).toBe(0);
  await undoAutofill();
  result = await fill('<label>Employment start date<input type="date" required></label>');
  expect(document.querySelector('input')!.value).toBe('');
  expect(result.noReview).toBe(0);
});

it('resolves context markers to a concrete entry', () => {
  const element = field('<input>');
  const signals = { ...extractSignals(element), nearbyText: 'Company' };
  const match = mapField(signals, RULE_PROFILE, {}, 'example.test');
  adjustWorkHistoryMatches([match], RULE_PROFILE);
  expect(match.fieldPath).toBe('workHistory.1.company');
  expect(match.value).toBe('New Company');
});
it('keeps partial repeated work entries associated with their row', async () => {
  await fill(
    '<fieldset><label>Company<input id="a"></label><label>Job title<input id="title"></label></fieldset><fieldset><label>Company<input id="b"></label></fieldset>',
  );
  expect(document.querySelector<HTMLInputElement>('#a')!.value).toBe('Old Company');
  expect(document.querySelector<HTMLInputElement>('#title')!.value).toBe('Junior');
  expect(document.querySelector<HTMLInputElement>('#b')!.value).toBe('New Company');
});
it('keeps a phone country code local to its contact section', async () => {
  await fill(
    '<fieldset><label>Phone<input id="primary"></label></fieldset><fieldset><label>Country code<input></label><label>Phone<input id="secondary"></label></fieldset>',
  );
  expect(document.querySelector<HTMLInputElement>('#primary')!.value).toBe('+1 2025550100');
  expect(document.querySelector<HTMLInputElement>('#secondary')!.value).toBe('2025550100');
});
it('does not use work status for an education checkbox', async () => {
  const profile = structuredClone(RULE_PROFILE);
  profile.education.forEach((entry) => (entry.isCurrent = false));
  await new Promise<void>((resolve) => chrome.storage.local.set({ profile }, resolve));
  await fill(
    '<fieldset><legend>Education</legend><label>No end date<input type="checkbox"></label></fieldset>',
  );
  expect(document.querySelector('input')!.checked).toBe(false);
});

it.each([
  ['section-applicant given-name', 'personal.firstName'],
  ['shipping postal-code', 'address.postalCode'],
  ['bday', 'personal.dateOfBirth'],
  ['name', 'derived.fullName'],
])('understands autocomplete %s', (autocomplete, path) =>
  expect(match(`<input autocomplete="${autocomplete}">`).fieldPath).toBe(path),
);
it('matches dedicated GitHub and birthday fields', () => {
  expect(match('<label>GitHub<input></label>').value).toBe(RULE_PROFILE.links.github);
  expect(match('<label>Date of birth<input></label>').value).toBe('1996-06-01');
});
it('does not trust a reused generic learned key over its new question', () => {
  const element = field('<label>Company<input id="question1"></label>');
  const actual = mapField(
    extractSignals(element),
    RULE_PROFILE,
    {
      'example.test': { question1: { path: 'personal.firstName', count: 2, label: 'First name' } },
    },
    'example.test',
  );
  expect(actual.fieldPath).toBe('workHistory.company');
});
it('redirects a learned CV file path when a URL is requested', () => {
  const element = field('<label>Resume<input type="url"></label>');
  const actual = mapField(
    extractSignals(element),
    RULE_PROFILE,
    { 'example.test': { resume: { path: 'documents.cv.file', count: 2 } } },
    'example.test',
  );
  expect(actual.fieldPath).toBe('documents.cv.url');
  expect(actual.value).toBe(RULE_PROFILE.documents.cv.url);
});

it('counts a normalized signal only once per real edit', async () => {
  const element = field('<input name="Phone number" id="phone-number" aria-label="Phone number">');
  await saveElementMappings('example.test', element, 'personal.phone.full');
  expect((await getLearnedMappings())['example.test'].phonenumber).toMatchObject({ count: 1 });
  await saveElementMappings('example.test', element, 'personal.phone.full');
  expect((await getLearnedMappings())['example.test'].phonenumber).toMatchObject({ count: 2 });
});
it('preserves concurrent learning and does not restore stale metadata', async () => {
  await Promise.all([
    learn('example.test', 'one', 'personal.firstName'),
    learn('example.test', 'two', 'personal.lastName'),
  ]);
  const before = await getLearnedMappings();
  expect(Object.keys(before['example.test'])).toEqual(['one', 'two']);
  await learn('example.test', 'three', 'personal.email');
  await saveLearnedMappings(
    { 'example.test': { one: { path: 'personal.firstName', count: 1, label: 'First name' } } },
    { labelsOnly: true },
  );
  expect(Object.keys((await getLearnedMappings())['example.test'])).toEqual([
    'one',
    'two',
    'three',
  ]);
});
it('does not lose a concurrent signal during a UI edit from an older snapshot', async () => {
  await learn('example.test', 'one', 'personal.firstName');
  const base = await getLearnedMappings();
  await learn('example.test', 'two', 'personal.lastName');
  await saveLearnedMappings(
    { 'example.test': { one: { path: 'personal.email', count: 2 } } },
    { base },
  );
  expect((await getLearnedMappings())['example.test']).toMatchObject({
    one: { path: 'personal.email' },
    two: { path: 'personal.lastName' },
  });
});
it.each(['Alexa', 'မြတ်သူဇာ'])(
  'does not learn another contact name from a weak match: %s',
  async (value) => {
    await fill('<label>Unknown detail<input id="other_person"></label>');
    const element = document.querySelector('input')!;
    element.value = value;
    element.dispatchEvent(new FocusEvent('blur'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await getLearnedMappings()).toEqual({});
  },
);
it('retains non-Latin labels and distinguishes unrelated names', () => {
  expect(normalize('အောင်မြင်')).not.toBe('');
  expect(normalize('မြတ်သူဇာ')).not.toBe(normalize('အောင်မြင်'));
  expect(match('<label>作品集<input></label>').value).toBe('https://portfolio.example.test/alex');
});
it('calculates age for today and clamps a calendar month at month end', () => {
  vi.useFakeTimers().setSystemTime(new Date(2026, 0, 31));
  expect(resolveProfileValue(RULE_PROFILE, 'professional.noticePeriod.availableDate')).toBe(
    '2026-02-28',
  );
  vi.setSystemTime(new Date(2026, 5, 1));
  expect(resolveProfileValue(RULE_PROFILE, 'derived.age')).toBe('30');
});
it('does not convert between currencies or infer an unspecified work country', () => {
  const element = field('<label>Work authorization<input></label>');
  expect(resolveRuleValue(RULE_PROFILE, 'workAuthorization', extractSignals(element))).toBe('');
  element.setAttribute('aria-label', 'Authorized to work in Thailand');
  document.body.innerHTML =
    '<select aria-label="Authorized to work in Thailand"><option>Yes</option><option>No</option></select>';
  const select = document.querySelector('select')!;
  expect(resolveRuleValue(RULE_PROFILE, 'workAuthorization', extractSignals(select))).toBe('Yes');
});

it('does not upload the CV when an unrelated learned path reaches a file field', async () => {
  await new Promise<void>((resolve) =>
    chrome.storage.local.set(
      {
        learnedMappings: {
          [location.hostname]: { upload: { path: 'personal.firstName', count: 2 } },
        },
      },
      resolve,
    ),
  );
  const result = await fill('<label>Upload supplement<input type="file" name="upload"></label>');
  expect(document.querySelector('input')!.files?.length).toBe(0);
  expect(result.noReview).toBe(0);
});

it('does not fill an unrelated visible question from an internal name alone', async () => {
  const result = await fill(
    '<label>Describe your experience with design<input name="experience"></label>',
  );
  expect(document.querySelector('input')!.value).toBe('');
  expect(result.noReview).toBe(0);
  expect(resolveFieldsWithAI).toHaveBeenCalled();
});
it('honors an explicit request to omit the calling code without a sibling selector', async () => {
  await fill('<label>Local number<input></label>');
  expect(document.querySelector('input')!.value).toBe('2025550100');
});

it('preserves ISO option values when country labels are localized', async () => {
  const result = await fill(
    '<label>Country<select><option value="">Select</option><option value="TH">ประเทศไทย</option></select></label>',
  );
  expect(document.querySelector('select')!.value).toBe('TH');
  expect(result.noReview).toBe(1);
});

it('does not learn a match between two punctuation-only values', async () => {
  const profile = structuredClone(RULE_PROFILE);
  profile.personal.nickname = '----';
  await new Promise<void>((resolve) => chrome.storage.local.set({ profile }, resolve));
  await fill('<label>Unknown detail<input></label>');
  const element = document.querySelector('input')!;
  element.value = '____';
  element.dispatchEvent(new FocusEvent('blur'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(await getLearnedMappings()).toEqual({});
});

it('does not confuse a partial country name or two different countries', () => {
  const element = field(
    '<select aria-label="Authorized to work in Indiana"><option>Yes</option><option>No</option></select>',
  );
  // Indiana must not be identified as India. Conflicting saved countries stay unresolved.
  expect(resolveRuleValue(RULE_PROFILE, 'workAuthorization', extractSignals(element))).toBe('');
  element.setAttribute('aria-label', 'Authorized to work in United States and Thailand');
  expect(resolveRuleValue(RULE_PROFILE, 'workAuthorization', extractSignals(element))).toBe('');
  element.setAttribute('aria-label', 'Authorized to work in US');
  expect(resolveRuleValue(RULE_PROFILE, 'workAuthorization', extractSignals(element))).toBe('No');
});
it('keeps an explicitly matched salary row when its currency already fits', () => {
  const profile = structuredClone(RULE_PROFILE);
  profile.salary.expected.push({ amount: 7000, currency: 'USD', period: 'monthly' });
  const element = field('<label>Expected salary USD<input></label>');
  expect(ruleValuePath(profile, 'salary.expected.2.formatted', extractSignals(element))).toBe(
    'salary.expected.2.formatted',
  );
});

it('keeps companion fields aligned in composed scan order across shadow roots', async () => {
  document.body.innerHTML =
    '<label>Language<input id="language0"></label><div id="level-host"></div><div id="language-host"></div><label>Proficiency<input id="level1"></label>';
  document.querySelector('#level-host')!.attachShadow({ mode: 'open' }).innerHTML =
    '<label>Proficiency<input id="level0"></label>';
  document.querySelector('#language-host')!.attachShadow({ mode: 'open' }).innerHTML =
    '<label>Language<input id="language1"></label>';
  await scanAutofill('composed-rows');
  await executeAutofill('overwrite');
  expect(document.querySelector<HTMLInputElement>('#language0')!.value).toBe('English');
  expect(document.querySelector('#level-host')!.shadowRoot!.querySelector('input')!.value).toBe(
    'Native',
  );
  expect(document.querySelector('#language-host')!.shadowRoot!.querySelector('input')!.value).toBe(
    'Burmese',
  );
  expect(document.querySelector<HTMLInputElement>('#level1')!.value).toBe('Fluent');
});

