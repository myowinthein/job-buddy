// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { likelyApplicationForm } from './detect';

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([
    {} as DOMRect,
  ] as unknown as DOMRectList);
});
afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});
function form(identifier: string) {
  return `<form><label>Name<input id="last_name" name="last_name"></label><label>First name<input id="first_name" name="first_name"></label><label>Email<input type="email" name="email"></label><label for="${identifier}">Import your documents</label><input type="file" id="${identifier}" name="${identifier}" style="display:none"></form>`;
}
it.each(['upload_cv', 'uploadResume', 'CVUpload', 'attachment[cv]', 'cv_attachment'])(
  'recognizes career words in %s behind a generic upload label',
  (identifier) => {
    document.body.innerHTML = form(identifier);
    expect(likelyApplicationForm()).toBe(true);
  },
);
it.each(['upload_documents', 'upload_cvv', 'cvvalue', 'mycvattachment', 'preview'])(
  'does not turn the ordinary contact/upload identifier %s into career evidence',
  (identifier) => {
    document.body.innerHTML = form(identifier);
    expect(likelyApplicationForm()).toBe(false);
  },
);
it('does not borrow a resume identifier from another form', () => {
  document.body.innerHTML =
    form('upload_documents') + '<form><input type="file" id="upload_cv" name="upload_cv"></form>';
  expect(likelyApplicationForm()).toBe(false);
});
it('detects identifier words inside an open shadow form while excluding the widget', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = form('upload_cv');
  expect(likelyApplicationForm()).toBe(true);
  host.setAttribute('data-job-buddy-ui', '');
  expect(likelyApplicationForm()).toBe(false);
});
