// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fileInputProxy } from './dom';
import { scanFields } from './scanner';
import { extractSignals } from './signals';
import { mapField } from './mapper';
import { RULE_PROFILE } from './ruleMatching.fixture';

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

function chooser(label = 'Upload CV') {
  document.body.innerHTML = `<form><div role="group" aria-label="CV (required)"><div><button type="button">Add file</button><input type="file" multiple aria-label="${label}" style="display:none" accept=".pdf,.docx"></div></div></form>`;
  return document.querySelector<HTMLInputElement>('input')!;
}
it('scans a hidden file input behind its visible Add file control and uses its explicit CV label', () => {
  const input = chooser();
  expect(fileInputProxy(input)).toBe(input.parentElement);
  expect(scanFields({ allowFileInputs: true })).toEqual([input]);
  expect(mapField(extractSignals(input), RULE_PROFILE, {}, 'example.test')).toMatchObject({
    fieldPath: 'documents.cv.file',
    value: 'sample.pdf',
  });
});
it.each([
  'disabled chooser',
  'hidden chooser',
  'another editor',
  'two file inputs',
  'unrelated action',
])('rejects an unavailable or ambiguous Add file widget: %s', (scenario) => {
  const input = chooser();
  const button = document.querySelector('button')!;
  if (scenario === 'disabled chooser') button.disabled = true;
  if (scenario === 'hidden chooser') button.style.display = 'none';
  if (scenario === 'another editor') input.parentElement!.append(document.createElement('input'));
  if (scenario === 'two file inputs') input.parentElement!.append(input.cloneNode());
  if (scenario === 'unrelated action') button.textContent = 'Add employee';
  expect(fileInputProxy(input)).toBeUndefined();
  expect(scanFields({ allowFileInputs: true })).not.toContain(input);
});
it('does not infer CV for an Other upload alongside the CV question', () => {
  chooser();
  const other = document.createElement('div');
  other.setAttribute('role', 'group');
  other.setAttribute('aria-label', 'Other (Optional)');
  other.innerHTML =
    '<div><button type="button">Add file</button><input type="file" aria-label="Upload Other" style="display:none"></div>';
  document.querySelector('form')!.append(other);
  const input = other.querySelector<HTMLInputElement>('input')!;
  expect(scanFields({ allowFileInputs: true })).toContain(input);
  expect(mapField(extractSignals(input), RULE_PROFILE, {}, 'example.test').fieldPath).not.toBe(
    'documents.cv.file',
  );
});
