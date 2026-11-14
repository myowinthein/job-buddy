// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { scanForm, questionLabel } from './scanner';
import { extractSignals } from './signals';
import { mapField } from './mapper';
import { resolveRuleValue } from './ruleValue';
import { aiQuestionAllowed } from './aiSafety';
import { fillField, resetDropdownBudget } from './filler';
import { RULE_PROFILE } from './ruleMatching.fixture';
import { callingCodeSibling } from './phoneResolution';
import type { FieldMatch } from './mapper';

beforeEach(() => {
  document.body.innerHTML = '';
  resetDropdownBudget();
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 100,
    height: 30,
  } as DOMRect);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('scans a separate question form and resolves the named country rather than the first entry', () => {
  document.body.innerHTML =
    '<form id="application"><label>First name<input id="first"></label><label>Resume<input type="file"></label></form><form action="#"><div><p>Are you authorized to work in Canada *</p><div><label>Select one<input id="canada" role="combobox"></label></div></div></form><form id="contact"><label>Email<input id="contact-email"></label></form>';
  const input = document.querySelector<HTMLInputElement>('#canada')!;
  const scan = scanForm({ scopeApplication: true });
  expect(scan.fields).toContain(input);
  expect(scan.fields).not.toContain(document.querySelector('#contact-email'));
  const signals = scan.signals(input);
  expect(signals.label).toBe('Select one');
  expect(signals.nearbyText).toBe('Are you authorized to work in Canada *');
  expect(questionLabel(input)).toBe(signals.nearbyText);
  const profile = {
    ...RULE_PROFILE,
    workAuthorization: [
      { country: 'US', status: 'citizen_or_pr' as const },
      { country: 'CA', status: 'requires_sponsorship' as const },
    ],
  };
  const match = mapField(signals, profile, {}, 'example.test');
  expect(match.fieldPath).toBe('workAuthorization');
  expect(resolveRuleValue(profile, match.fieldPath!, signals, match.value)).toBe('No');
});

it('does not cross another control or replace a meaningful choice label with preceding text', () => {
  document.body.innerHTML =
    '<form><p>Are you authorized to work in Canada?</p><input><div><label>Select one<input id="other" role="combobox"></label></div><p>Are you authorized to work in Canada?</p><label>Preferred language<input id="language" role="combobox"></label></form>';
  expect(questionLabel(document.querySelector('#other')!)).toBe('');
  expect(questionLabel(document.querySelector('#language')!)).toBe('');
});

it('keeps a generic consent dropdown out of both rule filling and AI', () => {
  document.body.innerHTML =
    '<form><div><p>By submitting this application, you consent to background verifications.</p><label>Select one<input id="consent" role="combobox"></label></div></form>';
  const input = document.querySelector<HTMLInputElement>('#consent')!;
  expect(mapField(extractSignals(input), RULE_PROFILE, {}, 'example.test').ruleBlocked).toBe(true);
  expect(aiQuestionAllowed(input)).toBe(false);
});

it('includes a hidden PDF input only through its unique visible upload surface', () => {
  document.body.innerHTML =
    '<form><div role="button" id="dropzone"><label><input id="cv" type="file" tabindex="-1" style="display:none" aria-label="Please upload your resume (preferably as a PDF file) *" accept="application/pdf"></label><p>Click or drag file to upload</p></div><input id="unrelated" type="file" tabindex="-1" style="display:none" aria-label="Resume"></form>';
  const input = document.querySelector<HTMLInputElement>('#cv')!;
  const scan = scanForm({ allowFileInputs: true });
  expect(scan.fields).toEqual([input]);
  const remove = document.createElement('button');
  remove.textContent = 'Remove file';
  document.querySelector('#dropzone')!.append(remove);
  expect(scanForm({ allowFileInputs: true }).fields).toEqual([input]);
  expect(mapField(scan.signals(input), RULE_PROFILE, {}, 'example.test').fieldPath).toBe(
    'documents.cv.file',
  );
  document.querySelector('#dropzone')!.setAttribute('aria-disabled', 'true');
  expect(scanForm({ allowFileInputs: true }).fields).toEqual([]);
  document.querySelector('#dropzone')!.removeAttribute('aria-disabled');
  document
    .querySelector('#dropzone')!
    .insertAdjacentHTML('beforeend', '<input type="file" style="display:none" tabindex="-1">');
  // The zero-size wrapping label cannot serve as a surface for the first input.
  vi.spyOn(input.parentElement!, 'getBoundingClientRect').mockReturnValue({
    width: 0,
    height: 0,
  } as DOMRect);
  expect(scanForm({ allowFileInputs: true }).fields).toEqual([]);
});

it.each([
  'Upload your passport',
  'Other certificates (not your resume)',
])('does not substitute a CV for %s', (label) => {
  document.body.innerHTML = '<label><input type="file" id="file"></label>';
  const input = document.querySelector<HTMLInputElement>('#file')!;
  input.setAttribute('aria-label', label);
  expect(mapField(extractSignals(input), RULE_PROFILE, {}, 'example.test').ruleBlocked).toBe(true);
});

it.each([
  ['Please upload your portfolio', 'portfolio'],
  ['Please upload your cover letter', 'coverLetter'],
] as const)('uses the matching uploaded document for %s', (label, kind) => {
  document.body.innerHTML = '<label><input type="file" id="file"></label>';
  const input = document.querySelector<HTMLInputElement>('#file')!;
  input.setAttribute('aria-label', label);
  const profile = structuredClone(RULE_PROFILE);
  profile.documents[kind] = { file: { name: `${kind}.pdf`, size: 3, base64: 'YWJj' } };
  const match = mapField(extractSignals(input), profile, {}, 'example.test');
  expect(match).toMatchObject({ fieldPath: `documents.${kind}.file`, value: `${kind}.pdf` });
});

it.each(['Please upload your resume', 'Please upload your résumé'])(
  'recognizes an explicit document aria-label alongside a generic visible label: %s',
  (question) => {
    document.body.innerHTML = '<label>Click or drag file to upload<input type="file"></label>';
    const input = document.querySelector('input')!;
    input.setAttribute('aria-label', question);
    expect(mapField(extractSignals(input), RULE_PROFILE, {}, 'example.test').fieldPath).toBe(
      'documents.cv.file',
    );
  },
);

it('does not borrow a calling-code field from another form or an ambiguous contact group', () => {
  document.body.innerHTML =
    '<form id="one"><input id="phone" type="tel"></form><form id="two"><input id="code"></form>';
  const phone: FieldMatch = {
    element: document.querySelector<HTMLElement>('#phone')!,
    fieldPath: 'personal.phone.full',
    confidence: 0.95,
    value: '+1 2025550100',
    matchLayer: 'autocomplete',
  };
  const code: FieldMatch = {
    element: document.querySelector<HTMLElement>('#code')!,
    fieldPath: 'personal.phone.callingCode',
    confidence: 0.85,
    value: '+1',
    matchLayer: 'dictionary_exact',
  };
  expect(callingCodeSibling(phone, [phone, code])).toBeNull();
  document.querySelector('#one')!.append(code.element!);
  expect(callingCodeSibling(phone, [phone, code])).toBe(code);
  const other = document.createElement('input');
  document.querySelector('#one')!.append(other);
  expect(callingCodeSibling(phone, [phone, code, { ...phone, element: other }])).toBeNull();
});

it('selects a country-qualified calling code without confusing countries sharing +1', async () => {
  document.body.innerHTML =
    '<label>Dial code<input id="dial" role="combobox" aria-controls="codes"></label><div id="codes" role="listbox"><div role="option">US +1</div><div role="option">CA +1</div></div>';
  const input = document.querySelector<HTMLInputElement>('#dial')!;
  const selected = vi.fn();
  for (const option of document.querySelectorAll<HTMLElement>('[role="option"]'))
    option.addEventListener('click', () => {
      selected(option.textContent);
      input.value = '+1';
      input.setAttribute('aria-expanded', 'false');
      option.setAttribute('aria-selected', 'true');
    });
  expect(await fillField(input, '+1', () => true, { callingCodeCountry: 'CA' })).toBe(true);
  expect(selected).toHaveBeenCalledExactlyOnceWith('CA +1');
});

it('does not choose another country when the saved calling-code country is absent', async () => {
  vi.useFakeTimers();
  document.body.innerHTML =
    '<label>Dial code<input id="dial" role="combobox" aria-controls="codes"></label><div id="codes" role="listbox"><div role="option">US +1</div></div>';
  const input = document.querySelector<HTMLInputElement>('#dial')!;
  const selected = vi.fn();
  document.querySelector('[role="option"]')!.addEventListener('click', selected);
  const pending = fillField(input, '+1', () => true, { callingCodeCountry: 'CA' });
  await vi.advanceTimersByTimeAsync(4100);
  expect(await pending).toBe(false);
  expect(selected).not.toHaveBeenCalled();
});
