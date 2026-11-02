// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createPreviewChrome } from '@/src/preview/chrome';
import { RULE_PROFILE } from '@/src/autofill/ruleMatching.fixture';
import { resolveProfileValue } from '@/src/autofill/resolver';
import { validateImportedProfile } from '@/src/utils/profileValidator';
import { saveProfile, getProfile, getLearnedMappings } from '@/src/utils/storage';
import type { Profile } from '@/src/types/profile';
import {
  scanAutofill,
  executeAutofill,
  getLastResult,
  getFillLog,
  undoAutofill,
} from '@/src/autofill/index';
import * as mapper from '@/src/autofill/mapper';
import { validateBackupData } from '@/src/utils/backupImport';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it('keeps mappings aligned when validation discards an education row', async () => {
  vi.stubEnv('DEV', false);
  vi.stubGlobal(
    'chrome',
    createPreviewChrome({ id: 'empty' }, undefined, { initialData: { learnedMappings: {} } }),
  );
  const raw = {
    ...RULE_PROFILE,
    education: [{ ...RULE_PROFILE.education[0], degree: 123 }, RULE_PROFILE.education[1]],
  };
  const entryIndices = {};
  const validated = validateImportedProfile(raw, { entryIndices });
  const backup = validateBackupData(
    {
      learnedMappings: {
        'example.test': {
          school: { path: 'education.0.institution', count: 2, scope: 'entry' },
          kept: { path: 'education.1.institution', count: 2, scope: 'entry' },
        },
      },
    },
    entryIndices,
  );
  expect(validated.sanitized.education).toHaveLength(1);
  expect(validated.invalidFields.some((field) => field.path.startsWith('education'))).toBe(true);
  await saveProfile(validated.sanitized as Profile, {
    incoming: backup.learnedMappings!,
    base: {},
    source: validated.sanitized,
  });
  const mappings = await getLearnedMappings();
  expect(mappings['example.test'].school).toMatchObject({
    path: 'education.0.institution',
    inactive: true,
  });
  expect(mappings['example.test'].kept).toMatchObject({
    path: 'education.0.institution',
    count: 2,
  });
  expect(resolveProfileValue((await getProfile())!, 'education.0.institution')).toBe(
    RULE_PROFILE.education[1].institution,
  );
});

it('retains partial counts, a completed ledger and Undo after a profile change cancels AI', async () => {
  vi.stubEnv('DEV', false);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 100,
    height: 30,
  } as DOMRect);
  vi.stubGlobal(
    'chrome',
    createPreviewChrome(RULE_PROFILE, undefined, {
      initialData: {
        profile: RULE_PROFILE,
        geminiApiKey: 'synthetic-key',
        geminiModel: 'gemini-3.8-flash',
        geminiDevDisabled: true,
      },
    }),
  );
  const fetchMock = vi.fn(() => new Promise(() => {}));
  vi.stubGlobal('fetch', fetchMock);
  document.body.innerHTML =
    '<label>First name<input id="first"></label><label>Custom reference<input id="custom"></label>';
  try {
    await scanAutofill('partial-cancel');
    const pending = executeAutofill('overwrite');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(document.querySelector<HTMLInputElement>('#first')!.value).toBe(
      RULE_PROFILE.personal.firstName,
    );
    await new Promise<void>((resolve) =>
      chrome.storage.local.set(
        {
          profile: { ...RULE_PROFILE, address: { ...RULE_PROFILE.address, city: 'Changed city' } },
        },
        resolve,
      ),
    );
    const result = await pending;
    expect(result.totalScanned).toBe(2);
    expect(result.noReview).toBe(1);
    expect(getLastResult()).toEqual(result);
    expect(getFillLog()?.status).toBe('completed');
    expect(await undoAutofill()).toBe(true);
    expect(document.querySelector<HTMLInputElement>('#first')!.value).toBe('');
  } finally {
    await undoAutofill();
  }
});

it.each(
  ['Nationality', 'Citizenship', 'Employment type', 'Emergency contact relationship'].flatMap(
    (question) => ['radio', 'checkbox'].map((kind) => ({ question, kind })),
  ),
)('keeps $kind $question manual', async ({ question, kind }) => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 100,
    height: 30,
  } as DOMRect);
  vi.stubGlobal(
    'chrome',
    createPreviewChrome(RULE_PROFILE, undefined, {
      initialData: {
        profile: RULE_PROFILE,
        geminiApiKey: 'synthetic-key',
        geminiModel: 'gemini-3.8-flash',
        geminiDevDisabled: true,
      },
    }),
  );
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify([
                  { fieldId: 'field_001', selectedOption: 'option_001', confidence: 'high' },
                ]),
              },
            ],
          },
        },
      ],
    }),
  });
  vi.stubGlobal('fetch', fetchMock);
  document.body.innerHTML = `<fieldset><legend>${question}</legend><label><input type="${kind}" name="nation" value="TH">Thai</label><label><input type="${kind}" name="nation" value="X">Other</label></fieldset>`;
  try {
    await scanAutofill('blocked-radio-probe');
    await executeAutofill('overwrite');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.querySelector<HTMLInputElement>('input')!.checked).toBe(false);
  } finally {
    await undoAutofill();
  }
});

it.each(['person-replaced', 'yellow-match'] as const)('silent refill %s', async (scenario) => {
  vi.stubEnv('DEV', false);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 100,
    height: 30,
  } as DOMRect);
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  const initial = { ...RULE_PROFILE, personal: { ...RULE_PROFILE.personal, nickname: '' } };
  vi.stubGlobal(
    'chrome',
    createPreviewChrome(initial, undefined, {
      initialData: {
        profile: initial,
        geminiApiKey: 'synthetic-key',
        geminiModel: 'gemini-3.8-flash',
        geminiDevDisabled: true,
      },
    }),
  );
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: '[]' }] } }] }),
    }),
  );
  if (scenario === 'yellow-match')
    vi.spyOn(mapper, 'mapField').mockReturnValue({
      fieldPath: 'personal.nickname',
      value: '',
      confidence: 0.7,
      matchLayer: 'context',
    });
  document.body.innerHTML = '<label>Nickname<input id="nickname"></label>';
  try {
    await scanAutofill('refill-probe');
    expect((await executeAutofill('overwrite')).noData).toBe(1);
    const replacement = {
      ...initial,
      id: scenario === 'person-replaced' ? 'different-person' : initial.id,
      personal: { ...initial.personal, nickname: 'New nickname' },
    };
    await new Promise<void>((resolve) =>
      chrome.storage.local.set({ profile: replacement }, resolve),
    );
    document.dispatchEvent(new Event('visibilitychange'));
    if (scenario === 'person-replaced') {
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(document.querySelector<HTMLInputElement>('#nickname')!.value).toBe('');
      expect(getLastResult()?.noReview).toBe(0);
    } else {
      await vi.waitFor(() =>
        expect(document.querySelector<HTMLInputElement>('#nickname')!.value).toBe('New nickname'),
      );
      expect(getLastResult()?.noReview).toBe(0);
      expect(getLastResult()?.needReview).toBe(1);
    }
  } finally {
    await undoAutofill();
  }
});

it('older unflagged historical mappings are dropped on backup validation', () => {
  const parsed = validateBackupData({
    learnedMappings: { 'example.test': { old: 'retired.oldField' } },
  });
  expect(parsed.learnedMappings).toEqual({});
  expect(parsed.invalidFields).toHaveLength(1);
});

it.each([
  'sponsorship',
  'cross-form-phone',
  'graduation-year',
  'hourly-salary',
  'consent-question',
] as const)('scan/rule candidate %s', async (scenario) => {
  vi.stubEnv('DEV', false);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 100,
    height: 30,
  } as DOMRect);
  const profile: Profile = {
    ...RULE_PROFILE,
    workAuthorization: [{ country: 'US', status: 'citizen_or_pr' }],
  };
  vi.stubGlobal(
    'chrome',
    createPreviewChrome(profile, undefined, {
      initialData: {
        profile,
        geminiApiKey: 'synthetic-key',
        geminiModel: 'gemini-3.8-flash',
        geminiDevDisabled: true,
      },
    }),
  );
  const replies =
    scenario === 'consent-question'
      ? [{ fieldId: 'field_001', selectedOption: 'option_001', confidence: 'high' }]
      : [];
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: JSON.stringify(replies) }] } }],
    }),
  });
  vi.stubGlobal('fetch', fetchMock);
  const markup = {
    sponsorship:
      '<label for="q">Work authorization</label><select id="q" aria-describedby="help"><option value="">Select</option><option>Yes</option><option>No</option></select><p id="help">Will you require sponsorship? We do not sponsor visas.</p>',
    'cross-form-phone':
      '<form><h2>Job application</h2><label>Phone<input id="q"></label></form><form><h2>Talent community upload resume</h2><label>Country code<input id="code"></label><label>Mobile<input id="mobile"></label></form>',
    'graduation-year':
      '<fieldset><legend>Education</legend><label>Year graduated<input id="q"></label></fieldset>',
    'hourly-salary':
      '<label for="q">Expected salary (per hour)</label><input id="q" name="expectedSalary">',
    'consent-question':
      '<form><h2>Job application</h2><p>Do you consent to us retaining your data?</p><label><input id="q" type="radio" name="gdpr_consent" value="yes">Yes</label><label><input type="radio" name="gdpr_consent" value="no">No</label></form>',
  };
  document.body.innerHTML = markup[scenario];
  try {
    await scanAutofill('rule-probe');
    const result = await executeAutofill('overwrite');
    if (scenario === 'consent-question') {
      expect(fetchMock).not.toHaveBeenCalled();
      expect(document.querySelector<HTMLInputElement>('#q')!.checked).toBe(false);
    } else {
      const expected = {
        sponsorship: 'No',
        'cross-form-phone': '+1 2025550100',
        'graduation-year': '',
        'hourly-salary': '',
      };
      expect(document.querySelector<HTMLInputElement>('#q')!.value).toBe(expected[scenario]);
      if (scenario === 'graduation-year' || scenario === 'hourly-salary')
        expect(result.noReview).toBe(0);
      else expect(result.noReview).toBeGreaterThan(0);
    }
  } finally {
    await undoAutofill();
  }
});
