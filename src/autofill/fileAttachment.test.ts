// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { hasFileAttachment } from './fileAttachment';
import { readFieldValue } from './fieldValue';
import { fillFileField } from './filler';

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 200,
    height: 40,
  } as DOMRect);
});
afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

it('retains a locally displayed attachment after the native picker is cleared', async () => {
  document.body.innerHTML =
    '<form><ui-upload><div class="has-value"><div><font>resume.pdf</font><font>resume.pdf</font></div><input type="file"></div></ui-upload></form>';
  const input = document.querySelector('input')!;
  const changed = vi.fn();
  input.addEventListener('change', changed);
  expect(input.files!.length).toBe(0);
  expect(readFieldValue(input)).toBe('selected file');
  expect(
    await fillFileField(input, {
      name: 'resume.pdf',
      size: 3,
      base64: 'data:application/pdf;base64,YWJj',
    }),
  ).toBe(true);
  expect(changed).not.toHaveBeenCalled();
  expect(hasFileAttachment(input, 'other.pdf')).toBe(false);
  input.parentElement!.classList.remove('has-value');
  expect(hasFileAttachment(input, 'resume.pdf')).toBe(false);
});

it('does not borrow a neighboring upload or a shared wrapper value', () => {
  document.body.innerHTML =
    '<div class="has-value"><div><span>resume.pdf</span><input type="file" id="cv"></div><div><input type="file" id="other"></div></div>';
  expect(hasFileAttachment(document.querySelector('#other')!, 'resume.pdf')).toBe(false);
});

it('does not treat a hidden attachment surface as a retained answer', () => {
  document.body.innerHTML =
    '<div class="has-value" hidden><span>resume.pdf</span><input type="file"></div>';
  expect(hasFileAttachment(document.querySelector('input')!, 'resume.pdf')).toBe(false);
});
