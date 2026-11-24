// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { geminiSeededChrome } from '@/src/testing/geminiChrome';
import { RULE_PROFILE } from './ruleMatching.fixture';
import { runAIAutofill } from './ai';
import { extractSignals } from './signals';
import { scanForm } from './scanner';
import { cancelAutofillRun, executeAutofill, scanAutofill, undoAutofill } from './index';
import { allowedAIPath, exactAIOption } from './aiSafety';
import type { AIFieldResponse, AIFieldPayload } from '../resume-ai/types';
import type { FillLogField } from './fillLog';

const profile = structuredClone(RULE_PROFILE);
profile.id = 'synthetic-private-id';
profile.personal.gender = 'synthetic-background-detail';
profile.documents.cv.file!.base64 = 'data:application/pdf;base64,U1lOVEhFVElD';
const fetchMock = vi.fn();
const response = (items: AIFieldResponse[]) => ({
  ok: true,
  status: 200,
  json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(items) }] } }] }),
});
const result = () => ({ noReview: 0, needReview: 0, lowConfidence: 1, noData: 0 });
function candidate() {
  const element = document.querySelector<HTMLElement>('input,select,textarea')!;
  return {
    type: 'text' as const,
    element,
    signals: extractSignals(element),
    originalState: 'lowConfidence' as const,
  };
}
function reply(path: string): AIFieldResponse[] {
  return [{ fieldId: 'field_001', profilePath: path, confidence: 'high' }];
}
function sentFields(call = 0): AIFieldPayload[] {
  const prompt = JSON.parse(fetchMock.mock.calls[call][1].body).contents[0].parts[0].text as string;
  return JSON.parse(prompt.slice(prompt.lastIndexOf('\n\n{') + 2)).fields;
}
beforeEach(() => {
  document.body.innerHTML = '';
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 100,
    height: 30,
  } as DOMRect);
  vi.stubGlobal('chrome', geminiSeededChrome(profile));
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(async () => {
  await undoAutofill();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('AI response boundaries', () => {
  it('does not borrow the entry of an adjacent current-status choice without a row assignment', async () => {
    document.body.innerHTML =
      '<fieldset><legend>Work History</legend><fieldset><legend>Currently working here</legend><label><input id="current" type="checkbox" checked>Yes</label></fieldset><fieldset><legend>Currently working here</legend><label><input id="past" type="checkbox">Yes</label></fieldset></fieldset>';
    const element = document.querySelector<HTMLInputElement>('#current')!;
    const record: FillLogField = {
      id: 'current',
      label: 'Currently working here',
      kind: 'checkbox',
      rule: { outcome: 'filled', profilePath: 'workHistory.1.isCurrent' },
      ai: { outcome: 'not_sent' },
      outcome: 'high_confidence',
      source: 'rules',
    };
    fetchMock.mockResolvedValue(
      response([{ fieldId: 'field_001', selectedOptions: ['option_001'], confidence: 'high' }]),
    );
    await runAIAutofill([], profile, result(), [], { fieldRecords: new Map([[element, record]]) });
    expect(sentFields()[0]).toMatchObject({ section: 'workHistory', profileEntryIndex: null });
    expect(document.querySelector<HTMLInputElement>('#past')!.checked).toBe(false);
  });
  it('keeps a resolved history row bound even when the portal has no section heading', async () => {
    document.body.innerHTML = '<form><label>Job detail<textarea></textarea></label></form>';
    const element = document.querySelector('textarea')!;
    const record: FillLogField = {
      id: 'detail',
      label: 'Job detail',
      kind: 'text',
      rule: { outcome: 'missing_data', profilePath: 'workHistory.1.description' },
      ai: { outcome: 'not_sent' },
      outcome: 'missing_data',
      source: null,
    };
    fetchMock.mockResolvedValue(response(reply('workHistory.0.title')));
    await runAIAutofill(
      [{ type: 'text', element, signals: extractSignals(element), originalState: 'noData' }],
      profile,
      result(),
      [],
      { fieldRecords: new Map([[element, record]]) },
    );
    expect(sentFields()[0]).toMatchObject({ section: 'workHistory', profileEntryIndex: 1 });
    expect(element.value).toBe('');
  });
  it('keeps partial repeated rows bound to their selected profile entry and leaves surplus rows empty', async () => {
    document.body.innerHTML =
      '<form><fieldset><legend>Work History</legend><div><input id="company0"><label>Achievements<textarea id="detail0"></textarea></label></div><div><input id="company1"><label>Achievements<textarea id="detail1"></textarea></label></div><div><input id="company2"><label>Job category<select id="detail2"><option value="">Choose</option><option value="yes">Engineering</option></select></label></div></fieldset></form>';
    const source = structuredClone(profile);
    source.workHistory[0].description = 'Old role detail';
    const records = new Map<HTMLElement, FillLogField>();
    for (const [row, index] of [1, 0, 2].entries())
      records.set(document.getElementById(`company${row}`)!, {
        id: `company${row}`,
        label: 'Company',
        kind: 'text',
        rule: { outcome: 'filled', profilePath: `workHistory.${index}.company` },
        ai: { outcome: 'not_sent' },
        outcome: 'high_confidence',
        source: 'rules',
      });
    const candidates = [...document.querySelectorAll<HTMLElement>('textarea,select')].map(
      (element) => ({
        type: 'text' as const,
        element,
        signals: extractSignals(element),
        originalState: 'noData' as const,
      }),
    );
    fetchMock.mockResolvedValue(
      response([
        { fieldId: 'field_001', profilePath: 'workHistory.0.description', confidence: 'high' },
        { fieldId: 'field_002', profilePath: 'workHistory.0.description', confidence: 'high' },
        { fieldId: 'field_003', selectedOption: 'option_001', confidence: 'high' },
      ]),
    );
    await runAIAutofill(candidates, source, result(), [], { fieldRecords: records });
    expect(sentFields().map((field) => field.profileEntryIndex)).toEqual([1, 0, null]);
    expect((document.querySelector('#detail0') as HTMLTextAreaElement).value).toBe('');
    expect((document.querySelector('#detail1') as HTMLTextAreaElement).value).toBe(
      'Old role detail',
    );
    expect((document.querySelector('#detail2') as HTMLSelectElement).value).toBe('');
  });
  it.each([
    'id',
    'documents.cv.file.base64',
    'documents.coverLetter.file.name',
    'personal.gender',
    '__proto__.firstName',
    'personal.constructor',
  ])('rejects excluded or unsafe path %s', async (path) => {
    document.body.innerHTML = '<label>Custom reference<input></label>';
    fetchMock.mockResolvedValue(response(reply(path)));
    const counts = result();
    await runAIAutofill([candidate()], profile, counts, []);
    expect(document.querySelector('input')!.value).toBe('');
    expect(counts.noReview).toBe(0);
  });
  it('allows legitimate virtual paths and refuses nonexistent entries', () => {
    const field: AIFieldPayload = { fieldId: 'x', type: 'text', label: 'Contact information' };
    for (const path of [
      'personal.phone.full',
      'address.countryName',
      'salary.expected.0.formatted',
      'workHistory.1.startDate.formatted',
      'languages.formatted',
    ])
      expect(allowedAIPath(profile, field, path)).toBe(true);
    expect(allowedAIPath(profile, field, 'workHistory.999.title')).toBe(false);
  });
  it('does not let another question in the batch authorize sensitive data', async () => {
    document.body.innerHTML =
      '<label>Custom reference<input id="reference"></label><label>Gender<input></label>';
    fetchMock.mockResolvedValue(response(reply('personal.gender')));
    const candidates = [...document.querySelectorAll('input')].map((element) => ({
      type: 'text' as const,
      element,
      signals: extractSignals(element),
      originalState: 'lowConfidence' as const,
    }));
    await runAIAutofill(candidates, profile, result(), []);
    expect(document.querySelector<HTMLInputElement>('#reference')!.value).toBe('');
  });
  it.each([
    ['Annual compensation USD', 'text', 'salary.expected.0.amount', '72,000 USD'],
    ['Desired compensation USD', 'number', 'salary.expected.0.formatted', '6000'],
    ['Employment start date', 'month', 'workHistory.1.startDate.formatted', '2020-01'],
    ['Authorized to work in Thailand', 'text', 'workAuthorization', 'Yes, authorized to work'],
    [
      'Authorized to work in Thailand',
      'text',
      'workAuthorization.0.status',
      'Yes, authorized to work',
    ],
  ])('formats %s for its actual input', async (label, type, path, expected) => {
    document.body.innerHTML = `<label>${label}<input type="${type}" required></label>`;
    fetchMock.mockResolvedValue(response(reply(path)));
    await runAIAutofill([candidate()], profile, result(), []);
    expect(document.querySelector('input')!.value).toBe(expected);
    expect(document.querySelector('input')!.checkValidity()).toBe(true);
  });
  it('rejects fuzzy and ambiguous options but accepts stable IDs', () => {
    expect(exactAIOption([{ label: 'Authorized', value: 'yes' }], 'Not authorized')).toBeNull();
    const options = [
      { id: 'option_001', label: '1', value: '0' },
      { id: 'option_002', label: '2', value: '1' },
    ];
    expect(exactAIOption(options, '1')).toBeNull();
    expect(exactAIOption(options, 'option_001')).toBe(options[0]);
  });
});

it.each([true, false])(
  'validates every AI option for a native multi-select (valid=%s)',
  async (valid) => {
    document.body.innerHTML =
      '<label>Communication choices<select multiple><option value="en">English</option><option value="my">Burmese</option><option value="fr" selected>French</option></select></label>';
    fetchMock.mockResolvedValue(
      response([
        {
          fieldId: 'field_001',
          selectedOptions: ['option_001', valid ? 'option_002' : 'unknown'],
          confidence: 'high',
        },
      ]),
    );
    const counts = result();
    await runAIAutofill([candidate()], profile, counts, [], { mode: 'overwrite' });
    expect(sentFields()[0].multiple).toBe(true);
    expect(
      [...document.querySelector('select')!.selectedOptions].map((option) => option.value),
    ).toEqual(valid ? ['en', 'my'] : ['fr']);
    expect(counts.noReview).toBe(valid ? 1 : 0);
  },
);

describe('AI choices and stale requests', () => {
  function choices() {
    document.body.innerHTML =
      '<fieldset><legend>Languages</legend><label><input id="old" type="checkbox" name="language" value="French" checked>French</label><label><input id="new" type="checkbox" name="language" value="English">English</label></fieldset>';
    return scanForm();
  }
  it.each([{ selectedOptions: ['option_002'] }, { selectedOptions: [] }])(
    'replaces the complete checkbox selection, including explicit none: %j',
    async ({ selectedOptions }) => {
      const groups = choices();
      fetchMock.mockResolvedValue(
        response([{ fieldId: 'field_001', selectedOptions, confidence: 'high' }]),
      );
      await runAIAutofill([], profile, result(), [], {
        mode: 'overwrite',
        checkboxGroups: groups.checkboxGroups,
        radioGroups: [],
      });
      expect(document.querySelector<HTMLInputElement>('#old')!.checked).toBe(false);
      expect(document.querySelector<HTMLInputElement>('#new')!.checked).toBe(
        selectedOptions.length > 0,
      );
    },
  );
  it('rejects an entire checkbox response if any selection is invalid', async () => {
    const groups = choices();
    fetchMock.mockResolvedValue(
      response([
        { fieldId: 'field_001', selectedOptions: ['English', 'Invented'], confidence: 'high' },
      ]),
    );
    await runAIAutofill([], profile, result(), [], {
      mode: 'overwrite',
      checkboxGroups: groups.checkboxGroups,
      radioGroups: [],
    });
    expect(document.querySelector<HTMLInputElement>('#old')!.checked).toBe(true);
    expect(document.querySelector<HTMLInputElement>('#new')!.checked).toBe(false);
  });
  it('preserves a radio choice made during overwrite', async () => {
    document.body.innerHTML =
      '<fieldset><legend>Custom choice</legend><label><input type="radio" name="choice" value="A">A</label><label><input id="manual" type="radio" name="choice" value="B">B</label></fieldset>';
    let release!: (value: unknown) => void;
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const groups = scanForm();
    const pending = runAIAutofill([], profile, result(), [], {
      mode: 'overwrite',
      radioGroups: groups.radioGroups,
      checkboxGroups: [],
    });
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    document.querySelector<HTMLInputElement>('#manual')!.checked = true;
    release(response([{ fieldId: 'field_001', selectedOption: 'option_001', confidence: 'high' }]));
    await pending;
    expect(document.querySelector<HTMLInputElement>('#manual')!.checked).toBe(true);
  });
  it('leaves a repurposed input untouched', async () => {
    document.body.innerHTML = '<label id="label">Given name<input></label>';
    let release!: (value: unknown) => void;
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const pending = runAIAutofill([candidate()], profile, result(), []);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    document.querySelector('#label')!.firstChild!.textContent = 'Emergency contact name';
    release(response(reply('personal.firstName')));
    await pending;
    expect(document.querySelector('input')!.value).toBe('');
  });
  it.each(['reset', 'replace', 'cancel'])(
    'aborts the provider and blocks old data after %s',
    async (action) => {
      document.body.innerHTML = '<label>Custom reference<input></label>';
      fetchMock.mockImplementation(() => new Promise(() => {}));
      await scanAutofill('stale-profile');
      const pending = executeAutofill('overwrite');
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
      const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
      if (action === 'cancel') cancelAutofillRun();
      else if (action === 'reset')
        await new Promise<void>((resolve) => chrome.storage.local.remove('profile', resolve));
      else
        await new Promise<void>((resolve) =>
          chrome.storage.local.set({ profile: { ...profile, id: 'replacement-person' } }, resolve),
        );
      await expect(pending).rejects.toThrow('autofill_failed');
      expect(signal.aborted).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(document.querySelector('input')!.value).toBe('');
    },
  );
  it('rejects a stale mode confirmation instead of returning a zero-field success', async () => {
    document.body.innerHTML = '<label>First name<input value="Existing"></label>';
    await scanAutofill('stale-confirmation');
    await new Promise<void>((resolve) =>
      chrome.storage.local.set({ profile: { ...profile, id: 'new-person' } }, resolve),
    );
    await expect(executeAutofill('overwrite')).rejects.toThrow('autofill_failed');
    expect(document.querySelector('input')!.value).toBe('Existing');
  });
  it('does not apply an AI choice after an unstructured prompt changes', async () => {
    document.body.innerHTML =
      '<p id="prompt">Preferred work location?</p><label><input type="radio" name="location" value="remote">Remote</label><label><input type="radio" name="location" value="onsite">Onsite</label>';
    let release!: (value: unknown) => void;
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const pending = runAIAutofill([], profile, result(), []);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    document.querySelector('#prompt')!.textContent = 'Preferred interview location?';
    release(response([{ fieldId: 'field_001', selectedOption: 'option_001', confidence: 'high' }]));
    await pending;
    expect(
      [...document.querySelectorAll<HTMLInputElement>('input')].some((element) => element.checked),
    ).toBe(false);
  });
  it('sends native types, section context, repeated indices and constraints', async () => {
    document.body.innerHTML =
      '<fieldset><legend>Education</legend><label>Start Date<input type="month"></label><label>Start Date<input type="month"></label></fieldset><fieldset><legend>Work History</legend><label>Start Date<input type="date" min="2000-01-01"></label></fieldset>';
    fetchMock.mockResolvedValue(response([]));
    const candidates = [...document.querySelectorAll('input')].map((element) => ({
      type: 'text' as const,
      element,
      signals: extractSignals(element),
      originalState: 'lowConfidence' as const,
    }));
    await runAIAutofill(candidates, profile, result(), []);
    expect(sentFields()).toMatchObject([
      { section: 'education', inputType: 'month', entryIndex: 0 },
      { section: 'education', inputType: 'month', entryIndex: 1 },
      { section: 'workHistory', inputType: 'date', constraints: { min: '2000-01-01' } },
    ]);
  });
});
