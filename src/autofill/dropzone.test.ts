// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { dropzoneLabel, dropzoneSurface } from './dropzone';
import { controlForm, fileInputProxy, isControlAvailable } from './dom';
import { scanFields } from './scanner';
import { extractSignals } from './signals';
import { mapField } from './mapper';
import { likelyApplicationForm } from '../quick-fill/detect';
import { RULE_PROFILE } from './ruleMatching.fixture';
import { readFieldValue } from './fieldValue';

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 200,
    height: 40,
  } as DOMRect);
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
});
afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});
function fixture(label = 'Upload application files') {
  document.body.innerHTML = `<form><label>Vorname<input name="vorname"></label><label>E-Mail<input type="email" name="email"></label><label>Nachname<input name="nachname"></label><div class="dz-clickable">${label}</div><div class="previews"></div></form><input type="file" class="dz-hidden-input" tabindex="-1" style="visibility:hidden;width:0;height:0" accept="application/pdf">`;
  return document.querySelector<HTMLInputElement>('input[type=file]')!;
}
it.each([
  'Upload application files',
  'Upload Bewerbungsdateien',
  'Bewerbungsunterlagen',
  'Upload application documents',
])('recognizes a unique portalled application picker: %s', (label) => {
  const input = fixture(label);
  const surface = document.querySelector<HTMLElement>('.dz-clickable')!;
  expect(dropzoneSurface(input)).toBe(surface);
  expect(fileInputProxy(input)).toBe(surface);
  expect(controlForm(input)).toBe(document.querySelector('form'));
  expect(isControlAvailable(input)).toBe(true);
  expect(scanFields({ allowFileInputs: true, scopeApplication: true })).toContain(input);
  expect(mapField(extractSignals(input), RULE_PROFILE, {}, 'example.test')).toMatchObject({
    fieldPath: 'documents.cv.file',
    value: 'sample.pdf',
  });
  expect(likelyApplicationForm()).toBe(true);
});
it.each([
  'two pickers',
  'two surfaces',
  'hidden surface',
  'disabled surface',
  'no form',
  'ordinary hidden picker',
])('does not enable an ambiguous or unavailable picker: %s', (scenario) => {
  const input = fixture();
  const surface = document.querySelector<HTMLElement>('.dz-clickable')!;
  if (scenario === 'two pickers') document.body.append(input.cloneNode());
  if (scenario === 'two surfaces') surface.after(surface.cloneNode());
  if (scenario === 'hidden surface') surface.hidden = true;
  if (scenario === 'disabled surface') surface.setAttribute('aria-disabled', 'true');
  if (scenario === 'no form') document.body.append(surface);
  if (scenario === 'ordinary hidden picker') input.className = '';
  expect(fileInputProxy(input)).toBeUndefined();
  expect(scanFields({ allowFileInputs: true })).not.toContain(input);
});
it('uses the specific document label instead of assuming every Dropzone asks for a CV', () => {
  const input = fixture('Cover letter');
  expect(mapField(extractSignals(input), RULE_PROFILE, {}, 'example.test').fieldPath).toBe(
    'documents.coverLetter.file',
  );
});
it('keeps widget identity stable and treats an existing queue as filled', () => {
  const input = fixture();
  document
    .querySelector('.dz-clickable')!
    .insertAdjacentHTML(
      'beforeend',
      '<div class="dz-preview"><span data-dz-name>earlier.pdf</span></div>',
    );
  expect(dropzoneLabel(input)).toBe('Upload application files');
  expect(readFieldValue(input)).toBe('selected file');
});
