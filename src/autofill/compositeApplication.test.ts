// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sameTelephone } from './phoneWidget';
import { isControlAvailable } from './dom';
import { extractSignals } from './signals';
import { resolveRuleValue, ruleValuePath } from './ruleValue';
import { sectionFamily } from './ruleContext';
import { scanForm } from './scanner';
import { mapField } from './mapper';
import { adjustWorkHistoryMatches } from './workHistoryResolution';
import { adjustEducationMatches } from './educationResolution';
import { adjustLanguageMatches } from './languageResolution';
import { RULE_PROFILE } from './ruleMatching.fixture';
import { languageChoiceAliases } from './languageChoices';
import { fillField, findBestMatch } from './filler';
import { allowedAIPath } from './aiSafety';

beforeEach(() =>
  vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockReturnValue({ width: 200, height: 40 } as DOMRect),
);
afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});
it('accepts national phone formatting only with the matching selected calling code', () => {
  document.body.innerHTML =
    '<div class="iti"><button class="iti__selected-country" aria-label="Change country, Thailand (+66)"></button><input type="tel"></div>';
  const e = document.querySelector('input')!;
  expect(sameTelephone(e, '81 234 5678', '+66 812345678')).toBe(true);
  expect(sameTelephone(e, '81 234 5679', '+66 812345678')).toBe(false);
  expect(sameTelephone(e, '0812345678', '+66 812345678')).toBe(false);
  document.querySelector('button')!.setAttribute('aria-label', 'United Kingdom (+44)');
  expect(sameTelephone(e, '81 234 5678', '+66 812345678')).toBe(false);
  document.querySelector('button')!.remove();
  expect(sameTelephone(e, '81 234 5678', '+66 812345678')).toBe(false);
});
it('permits read-only selection triggers while keeping plain read-only text unavailable', () => {
  document.body.innerHTML =
    '<input readonly role="combobox" aria-haspopup="listbox"><input readonly>';
  const [combo, text] = document.querySelectorAll('input');
  expect(isControlAvailable(combo)).toBe(true);
  expect(isControlAvailable(text)).toBe(false);
  combo.setAttribute('aria-disabled', 'true');
  expect(isControlAvailable(combo)).toBe(false);
});
it('separates Headline from the career summary without truncating either', () => {
  document.body.innerHTML = '<label>Headline (Optional)<input maxlength="255"></label>';
  const signals = extractSignals(document.querySelector('input')!);
  expect(ruleValuePath(RULE_PROFILE, 'professional.summary', signals)).toBe('workHistory.1.title');
  expect(resolveRuleValue(RULE_PROFILE, 'professional.summary', signals)).toBe('Senior');
  expect(resolveRuleValue(RULE_PROFILE, 'workHistory.1.title', signals, null)).toBe('Senior');
  expect(
    resolveRuleValue(
      { ...RULE_PROFILE, workHistory: [], derived: undefined },
      'professional.summary',
      signals,
    ),
  ).toBe('');
});
it('rejects overlong input and textarea answers before firing write events', async () => {
  document.body.innerHTML =
    '<input maxlength="5" value="old"><textarea maxlength="5">old</textarea>';
  for (const element of document.querySelectorAll<HTMLElement>('input,textarea')) {
    const listener = vi.fn();
    element.addEventListener('input', listener);
    expect(await fillField(element, 'too long')).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  }
});
it('composes a full address only for the represented question, preserving street-only fields', () => {
  document.body.innerHTML =
    '<label>Address (Optional)<input aria-describedby="help"></label><p id="help">Include your city, region, and country.</p>';
  const e = document.querySelector('input')!;
  const profile = {
    ...RULE_PROFILE,
    address: {
      street: '10 Test Road',
      city: 'Bangkok',
      state: 'Bangkok',
      postalCode: '10310',
      country: 'TH',
    },
  };
  expect(resolveRuleValue(profile, 'address.street', extractSignals(e))).toBe(
    '10 Test Road, Bangkok, 10310, Thailand',
  );
  e.autocomplete = 'street-address';
  expect(resolveRuleValue(profile, 'address.street', extractSignals(e))).toBe('10 Test Road');
});
it('keeps SVG fallback and validation icons out of labels and resolves both list sections', () => {
  document.body.innerHTML =
    '<form><div><div>Education (Optional)<button>Add Education</button></div><ul><li><label>*School<input id="school"><svg><title>SVGs not supported by this browser.</title></svg></label><label>Start date (Optional)<input id="school-date" placeholder="MM/YYYY"></label></li></ul></div><div><div>Experience (Optional)<button>Add Experience</button></div><ul><li><label>*Title<input id="title"><svg><title>SVGs not supported by this browser.</title></svg></label><label>Summary (Optional)<textarea id="work-summary"></textarea></label><label>Start date (Optional)<input id="work-date" placeholder="MM/YYYY"></label></li></ul></div><label>Summary<textarea id="summary"></textarea></label></form>';
  const scan = scanForm();
  const matches = scan.fields.map((element) => ({
    ...mapField(scan.signals(element), RULE_PROFILE, {}, 'example.test'),
    element,
  }));
  adjustEducationMatches(matches, RULE_PROFILE);
  adjustWorkHistoryMatches(matches, RULE_PROFILE);
  const path = (id: string) => matches.find((match) => match.element.id === id)!.fieldPath;
  expect(extractSignals(document.querySelector('#school')!).label).toBe('*School');
  expect(sectionFamily(document.querySelector('#school-date')!)).toBe('education');
  expect(sectionFamily(document.querySelector('#work-date')!)).toBe('workHistory');
  expect(path('school')).toBe('education.1.institution');
  expect(path('school-date')).toBe('education.1.startDate.formatted');
  expect(path('title')).toBe('workHistory.1.title');
  expect(path('work-summary')).toBe('workHistory.1.description');
  expect(path('summary')).toBe('professional.summary');
});
it('uses the named language rather than the first stored language and matches a supported tier', () => {
  document.body.innerHTML =
    '<label>What is your level of proficiency in English?<input readonly role="combobox"></label>';
  const element = document.querySelector('input')!;
  const profile = {
    ...RULE_PROFILE,
    languages: [
      { language: 'th', proficiency: 'native_bilingual' as const },
      { language: 'en', proficiency: 'full_professional' as const },
    ],
  };
  const matches = [{ ...mapField(extractSignals(element), profile, {}, 'example.test'), element }];
  adjustLanguageMatches(matches, profile);
  expect(matches[0].fieldPath).toBe('languages.1.proficiency');
  expect(matches[0].value).toBe('Fluent');
  const aliases = languageChoiceAliases(extractSignals(element), 'Fluent');
  expect(
    findBestMatch(
      ['None', 'Conversational', 'Professional', 'Native or bilingual'],
      'Fluent',
      (x) => x,
      (x) => x,
      aliases,
    ),
  ).toBe('Professional');
  expect(
    allowedAIPath(
      profile,
      { fieldId: 'english', type: 'select', label: 'Proficiency in English' },
      'languages.0.proficiency',
    ),
  ).toBe(false);
  adjustLanguageMatches(matches, { ...profile, languages: [profile.languages[0]] });
  expect(matches[0].value).toBeNull();
});

it.each([false, true])(
  'uses the UK authorization row independently of the US row, authorized=%s',
  (authorized) => {
    document.body.innerHTML =
      '<label>You must have the right to work in the UK for this role. We are unable to offer visa sponsorship now or in the future. Do you have the right to work in the UK and not require visa sponsorship now or at any point in the future?<input></label>';
    const profile = {
      ...RULE_PROFILE,
      workAuthorization: [
        { country: 'US', status: 'citizen_or_pr' as const },
        {
          country: 'GB',
          status: authorized ? ('citizen_or_pr' as const) : ('requires_sponsorship' as const),
        },
      ],
    };
    expect(
      resolveRuleValue(
        profile,
        'workAuthorization',
        extractSignals(document.querySelector('input')!),
      ),
    ).toBe(authorized ? 'Yes' : 'No');
  },
);

it('does not apply spoken-language tier aliases to programming proficiency', () => {
  document.body.innerHTML = '<label>Programming language proficiency<input></label>';
  expect(languageChoiceAliases(extractSignals(document.querySelector('input')!), 'Fluent')).toEqual(
    [],
  );
});

it('fills a choice list referenced by both aria-controls and aria-owns', async () => {
  document.body.innerHTML =
    '<label id="english-label">English proficiency</label><input readonly role="combobox" aria-labelledby="english-label" aria-controls="choices" aria-owns="choices"><ul id="choices" role="listbox" hidden><li role="option">Professional</li></ul>';
  const input = document.querySelector('input')!;
  const list = document.querySelector('ul')!;
  input.addEventListener('click', () => {
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  });
  list.querySelector('li')!.addEventListener('click', () => {
    input.value = 'Professional';
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
  });
  expect(await fillField(input, 'Fluent')).toBe(true);
  expect(input.value).toBe('Professional');
}, 10000);
