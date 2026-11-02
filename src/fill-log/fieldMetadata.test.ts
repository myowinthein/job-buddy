// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { reportTitle, requiredField } from './fieldMetadata';

it('reads native, ARIA and visible required markers without changing matching signals', () => {
  const input = document.createElement('input');
  expect(requiredField([input], 'Name')).toBe(false);
  input.required = true;
  expect(requiredField([input], 'Name')).toBe(true);
  input.required = false;
  expect(requiredField([input], 'Name *')).toBe(true);
  expect(requiredField([input], '* Name')).toBe(true);
  const group = document.createElement('div');
  group.setAttribute('aria-required', 'true');
  expect(requiredField([input], 'Options', group)).toBe(true);
  input.setAttribute('aria-required', 'true');
  expect(requiredField([input], 'Name')).toBe(true);
});
it('keeps readable titles and gives machine-generated choice names a human fallback', () => {
  expect(reportTitle('Full Name *', 'text', 1)).toBe('Full Name');
  expect(reportTitle('451492a9-786b-4d6f-afe3-1447c9e63811_e292ab29', 'radio', 2)).toBe(
    'Radio question 2',
  );
  expect(reportTitle('I agree', 'checkbox', 1)).toBe('I agree');
});
