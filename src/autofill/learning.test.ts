// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPreviewChrome } from '../preview/chrome';
import { RULE_PROFILE } from './ruleMatching.fixture';
import { learningValues, matchLearningValue } from './learningValues';
import { watchLearning } from './learning';
import { saveElementMappings } from './mappings';
import { mapField } from './mapper';
import { extractSignals } from './signals';
import { adjustEducationMatches } from './educationResolution';
vi.mock('./mappings', async (original) => ({
  ...(await original<typeof import('./mappings')>()),
  saveElementMappings: vi.fn().mockResolvedValue(undefined),
}));
let stop = () => {};
beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
  vi.stubGlobal('chrome', createPreviewChrome(RULE_PROFILE));
});
afterEach(() => {
  stop();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const flush = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve();
};
function field(html = '<label>Novel response<input id="q7"></label>', profile = RULE_PROFILE) {
  document.body.innerHTML = html;
  const element = document.querySelector<HTMLInputElement>('input,select')!;
  const listeners = vi.spyOn(element, 'addEventListener');
  stop = watchLearning(
    [element],
    profile,
    'example.test',
    { profileId: profile.id, revision: null },
    () => {},
  );
  const edit = (value: string, trusted = true) => {
    element.value = value;
    if (trusted) {
      for (const [type, callback] of listeners.mock.calls)
        if (type === 'input' && typeof callback === 'function')
          callback.call(element, { isTrusted: true } as Event);
    } else element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('blur'));
  };
  return { element, edit };
}

describe('safe value aliases', () => {
  it.each([
    ['+1 (202) 555-0100', 'personal.phone.full'],
    ['Thailand', 'address.country'],
    ['English', 'languages.0.language'],
    ['Native', 'languages.0.proficiency'],
    ['New Company', 'workHistory.1.company'],
    ['Senior', 'workHistory.1.title'],
    ['6,000 USD', 'salary.expected.0.formatted'],
    ['Alex Sample', 'derived.fullName'],
    ['ALEX@EXAMPLE.TEST', 'personal.email'],
  ])('matches %s to a unique canonical path', (value, path) => {
    expect(matchLearningValue(learningValues(RULE_PROFILE), value)).toBe(path);
  });
  it.each(['a.lex@example.test', 'alex+tag@example.test', 'https://github.example.test/a-lex'])(
    'does not remove meaningful punctuation from %s',
    (value) => {
      expect(matchLearningValue(learningValues(RULE_PROFILE), value)).toBeNull();
    },
  );
  it('does not collapse genuinely ambiguous fields', () => {
    const profile = { ...RULE_PROFILE, personal: { ...RULE_PROFILE.personal, nickname: 'Alex' } };
    expect(matchLearningValue(learningValues(profile), 'Alex')).toBeNull();
  });
});

describe('user learning lifecycle', () => {
  it('does not treat a placeholder option as a profile answer', async () => {
    const { edit } = field(
      '<label>Novel response<select><option value="">Choose</option><option value="764" selected>Thailand</option></select></label>',
      { ...RULE_PROFILE, personal: { ...RULE_PROFILE.personal, nickname: 'Choose' } },
    );
    edit('');
    await flush();
    expect(saveElementMappings).not.toHaveBeenCalled();
  });
  it('learns a real correction to an already-filled field', async () => {
    const { edit } = field('<label>Novel response<input id="q7" value="previous answer"></label>');
    edit('alex@example.test');
    await vi.waitFor(() => expect(saveElementMappings).toHaveBeenCalledOnce());
    expect(saveElementMappings).toHaveBeenCalledWith(
      'example.test',
      expect.objectContaining({ id: 'q7' }),
      'personal.email',
      expect.any(Object),
    );
  });
  it('keeps observing after an unrelated or cleared first edit', async () => {
    const { edit } = field();
    edit('still thinking');
    await flush();
    edit('');
    edit('alex@example.test');
    await vi.waitFor(() => expect(saveElementMappings).toHaveBeenCalledOnce());
  });
  it('ignores page-script input/blur and focus-only changes', async () => {
    const { element, edit } = field();
    edit('alex@example.test', false);
    element.focus();
    element.value = 'Sample';
    element.blur();
    await flush();
    expect(saveElementMappings).not.toHaveBeenCalled();
  });
  it('learns the visible selected option rather than its opaque submission code', async () => {
    const { edit } = field(
      '<label>Novel response<select id="q7"><option value="">Choose</option><option value="764">Thailand</option></select></label>',
    );
    edit('764');
    await vi.waitFor(() => expect(saveElementMappings).toHaveBeenCalledOnce());
    expect(vi.mocked(saveElementMappings).mock.calls[0][2]).toBe('address.country');
  });
  it('waits for valid final values and can learn after an invalid edit', async () => {
    const { edit } = field('<label>Novel response<input id="q7" type="email"></label>');
    edit('Alex');
    await flush();
    expect(saveElementMappings).not.toHaveBeenCalled();
    edit('alex@example.test');
    await vi.waitFor(() => expect(saveElementMappings).toHaveBeenCalledOnce());
  });
  it.each(['detach', 'reuse', 'readonly'] as const)(
    'does not learn from a %s control',
    async (action) => {
      const { element, edit } = field();
      if (action === 'detach') element.remove();
      else if (action === 'reuse') element.id = 'newquestion';
      else element.readOnly = true;
      edit('alex@example.test');
      await flush();
      expect(saveElementMappings).not.toHaveBeenCalled();
    },
  );
  it('does not count revisiting the same answer twice in one run as two confirmations', async () => {
    const { edit } = field();
    edit('alex@example.test');
    await flush();
    edit('');
    edit('alex@example.test');
    await flush();
    expect(saveElementMappings).toHaveBeenCalledOnce();
  });
  it('stops after profile replacement or reset even if the form stays open', async () => {
    const { edit } = field();
    await new Promise<void>((resolve) => chrome.storage.local.remove('profile', resolve));
    edit('alex@example.test');
    await flush();
    expect(saveElementMappings).not.toHaveBeenCalled();
  });
  it('does not let a pending observation read new field signals', async () => {
    const { element, edit } = field();
    edit('alex@example.test');
    element.id = 'newquestion';
    await flush();
    expect(saveElementMappings).not.toHaveBeenCalled();
  });
});

describe('learned reuse safety', () => {
  it('does not carry an identical description label into a different section', () => {
    document.body.innerHTML =
      '<fieldset><legend>Education</legend><label>Description<input></label></fieldset>';
    const match = mapField(
      extractSignals(document.querySelector('input')!),
      RULE_PROFILE,
      {
        'example.test': {
          description: {
            path: 'workHistory.1.description',
            count: 2,
            label: 'Description',
            question: 'Description',
          },
        },
      },
      'example.test',
    );
    expect(match.matchLayer).not.toBe('learned');
  });
  it.each(['personal.email', { path: 'personal.email', count: 2, label: 'Preferred name' }])(
    'does not reuse an internal key for a different question',
    (entry) => {
      document.body.innerHTML = '<label>Company<input id="q7"></label>';
      const match = mapField(
        extractSignals(document.querySelector('input')!),
        RULE_PROFILE,
        { 'example.test': { q7: entry } },
        'example.test',
      );
      expect(match.matchLayer).not.toBe('learned');
    },
  );
  it('does not let a common placeholder carry an unrelated answer', () => {
    document.body.innerHTML =
      '<label>Why this role?<input placeholder="Enter your answer"></label>';
    const match = mapField(
      extractSignals(document.querySelector('input')!),
      RULE_PROFILE,
      {
        'example.test': {
          enteryouranswer: { path: 'personal.firstName', count: 2, label: 'Preferred first name' },
        },
      },
      'example.test',
    );
    expect(match.matchLayer).not.toBe('learned');
  });
  it('assigns generic learned repeated labels to their actual rows', () => {
    document.body.innerHTML =
      '<fieldset><label>Institution<input id="one"></label></fieldset><fieldset><label>Institution<input id="two"></label></fieldset>';
    const matches = [...document.querySelectorAll('input')].map((element) => ({
      ...mapField(
        extractSignals(element),
        RULE_PROFILE,
        {
          'example.test': {
            institution: { path: 'education.1.institution', count: 2, label: 'Institution' },
          },
        },
        'example.test',
      ),
      element,
    }));
    adjustEducationMatches(matches, RULE_PROFILE);
    expect(matches.map((match) => match.value)).toEqual(['Old University', 'New University']);
  });
  it('preserves explicit entry choices and empty stale paths', () => {
    document.body.innerHTML = '<label>Institution<input></label>';
    for (const path of ['education.0.institution', 'education.50.institution']) {
      const match = mapField(
        extractSignals(document.querySelector('input')!),
        RULE_PROFILE,
        { 'example.test': { institution: { path, count: 2, scope: 'entry' } } },
        'example.test',
      );
      expect(match.fieldPath).toBe(path);
    }
  });
});
