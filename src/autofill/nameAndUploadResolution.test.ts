// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { RULE_PROFILE } from './ruleMatching.fixture';
import { extractSignals } from './signals';
import { mapField } from './mapper';
import { adjustNameMatches } from './nameResolution';
import { isControlAvailable, fileInputProxy } from './dom';

afterEach(() => {
  document.body.innerHTML = '';
});
const matches = () =>
  [...document.querySelectorAll('input')].map((element) => ({
    ...mapField(extractSignals(element), RULE_PROFILE, {}, 'example.test'),
    element,
  }));
it.each(['Import your documents', 'Upload your file', 'Importez vos documents'])(
  'trusts an exact CV identifier behind a generic action: %s',
  (label) => {
    document.body.innerHTML = `<form><label for="upload_cv">${label}</label><input type="file" id="upload_cv" name="upload_cv" style="display:none;opacity:0" accept="application/pdf"></form>`;
    const input = document.querySelector('input')!;
    document.querySelector('label')!.getBoundingClientRect = () =>
      ({ width: 100, height: 30 }) as DOMRect;
    expect(fileInputProxy(input)).toBe(document.querySelector('label'));
    expect(isControlAvailable(input)).toBe(true);
    expect(matches()[0]).toMatchObject({ fieldPath: 'documents.cv.file', value: 'sample.pdf' });
    expect(matches()[0].confidence).toBeGreaterThanOrEqual(0.6);
  },
);
it.each(['Passport', 'Work permit', 'Cover Letter', 'Portfolio'])(
  'does not use a stale CV identifier to override an explicit %s label',
  (label) => {
    document.body.innerHTML = `<label for="upload_cv">${label}</label><input type="file" id="upload_cv">`;
    const match = matches()[0];
    expect(match.fieldPath === 'documents.cv.file' && match.confidence >= 0.6).toBe(false);
  },
);
it('does not assign a document kind from a generic upload label alone', () => {
  document.body.innerHTML =
    '<label for="upload">Import your documents</label><input type="file" id="upload">';
  const match = matches()[0];
  expect(match.fieldPath?.startsWith('documents.') && match.confidence >= 0.6).not.toBe(true);
});
it('resolves translated Name / First name using an explicit last_name identifier', () => {
  document.body.innerHTML =
    '<form><label for="last_name">Name *</label><input id="last_name" name="last_name"><label for="first_name">First name *</label><input id="first_name" name="first_name"></form>';
  const fields = matches();
  expect(fields[0].fieldPath).toBe('derived.fullName');
  adjustNameMatches(fields, RULE_PROFILE);
  expect(fields[0]).toMatchObject({ fieldPath: 'personal.lastName', value: 'Sample' });
  expect(fields[1].fieldPath).toBe('personal.firstName');
});
it.each(['Full name', 'Legal name', 'Name'])(
  'keeps %s without explicit surname metadata as a full name',
  (label) => {
    document.body.innerHTML = `<form><label for="full_name">${label}</label><input id="full_name"><label for="first_name">First name</label><input id="first_name"></form>`;
    const fields = matches();
    const before = fields[0].fieldPath;
    adjustNameMatches(fields, RULE_PROFILE);
    expect(fields[0].fieldPath).toBe(before);
  },
);
it('does not borrow first-name evidence from another form or override confirmed mappings', () => {
  document.body.innerHTML =
    '<form><label for="last_name">Name</label><input id="last_name"></form><form><label for="first_name">First name</label><input id="first_name"></form>';
  const fields = matches();
  adjustNameMatches(fields, RULE_PROFILE);
  expect(fields[0].fieldPath).toBe('derived.fullName');
  fields[0].element.form!.append(fields[1].element);
  fields[0].matchLayer = 'learned';
  adjustNameMatches(fields, RULE_PROFILE);
  expect(fields[0].fieldPath).toBe('derived.fullName');
});
