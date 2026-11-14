// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApplicationFormDetector, likelyApplicationForm } from './detect';

const permission =
  '<label>Are you NOW legally authorized to work in the country where the position is located?<select><option>Please Select</option><option>Yes</option><option>No</option></select></label>';
const sponsorship =
  '<label>Do you now, or will you in the future, require sponsorship for an employment visa?<select><option>Please Select</option><option>Yes</option><option>No</option></select></label>';
beforeEach(() => {
  history.replaceState(null, '', '/us/en/apply?step=3');
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
});
afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  history.replaceState(null, '', '/');
});

it('recognizes a fresh questionnaire without name/email fields or an application heading', () => {
  document.body.innerHTML = `<main><h1>Senior Software Engineer</h1><form><legend>You are applying for -</legend>${permission}${sponsorship}</form></main>`;
  expect(createApplicationFormDetector()()).toBe(true);
  // A new document or refreshed content script does not rely on the old detector.
  expect(createApplicationFormDetector()()).toBe(true);
});
it('does not combine the questions across independent forms', () => {
  document.body.innerHTML = `<form>${permission}</form><form>${sponsorship}</form>`;
  expect(likelyApplicationForm()).toBe(false);
});
it('requires a separate control for each question', () => {
  document.body.innerHTML =
    '<form><label>Are you authorized to work or do you require sponsorship?<select><option>Yes</option></select></label><input name="message"></form>';
  expect(likelyApplicationForm()).toBe(false);
});
it.each(['nav', 'header', 'footer', 'aside'])('ignores a questionnaire inside %s', (tag) => {
  document.body.innerHTML = `<${tag}><form>${permission}${sponsorship}</form></${tag}>`;
  expect(likelyApplicationForm()).toBe(false);
});
it.each(['Contact form', 'Search', 'Sign in'])(
  'does not override an auxiliary form labelled %s',
  (purpose) => {
    document.body.innerHTML = `<form aria-label="${purpose}">${permission}${sponsorship}</form>`;
    expect(likelyApplicationForm()).toBe(false);
  },
);
it('does not infer an application from a general information page', () => {
  history.replaceState(null, '', '/visa-information');
  document.body.innerHTML = `<form>${permission}${sponsorship}</form>`;
  expect(likelyApplicationForm()).toBe(false);
});
it('does not borrow the sponsorship wording from nearby policy prose', () => {
  document.body.innerHTML = `<form>${permission}<p>We offer employment visa sponsorship.</p><label>Message<textarea></textarea></label></form>`;
  expect(likelyApplicationForm()).toBe(false);
});
