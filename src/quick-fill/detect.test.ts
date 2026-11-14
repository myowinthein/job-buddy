// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { likelyApplicationForm, createApplicationFormDetector } from './detect';

beforeEach(() => {
  history.replaceState(null, '', '/');
  document.body.innerHTML = '';
  document.title = 'Test page';
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 100,
    height: 30,
  } as DOMRect);
});

it.each([false, true])(
  'recognizes an early application step with a form=%s and no resume controls',
  (form) => {
    history.replaceState(null, '', '/apply/personal-details');
    const controls =
      '<label>First name<input name="firstName"></label><label>Email<input type="email" name="email"></label>';
    document.body.innerHTML = `<h1>Let’s put a name to your application</h1>${form ? `<form>${controls}</form>` : controls}`;
    expect(likelyApplicationForm()).toBe(true);
  },
);

it('keeps the button on later wizard steps, then forgets the flow outside its route', () => {
  const detect = createApplicationFormDetector();
  history.replaceState(null, '', '/jobs/123/apply/personal-details');
  document.body.innerHTML = '<h1>Your application</h1><input name="firstName"><input name="email">';
  expect(detect()).toBe(true);
  document.body.innerHTML = '<h1>Your location</h1><input name="city">';
  expect(detect()).toBe(true);
  history.replaceState(null, '', '/jobs/123/apply/skills');
  document.body.innerHTML = '<h1>Your skills</h1><textarea name="skills"></textarea>';
  expect(detect()).toBe(true);
  history.replaceState(null, '', '/jobs/456/apply/skills');
  expect(detect()).toBe(false);
  history.replaceState(null, '', '/contact');
  expect(detect()).toBe(false);
});

it('does not combine independent forms under an application page heading', () => {
  history.replaceState(null, '', '/apply/details');
  document.body.innerHTML =
    '<h1>Your application</h1><form><input name="name"><input name="email"><textarea name="message"></textarea></form><form><input name="resume"><input name="salary"></form>';
  expect(likelyApplicationForm()).toBe(false);
});

it('does not show on sign-in, contact, completed or unrelated forms in a confirmed flow', () => {
  const detect = createApplicationFormDetector();
  history.replaceState(null, '', '/apply/details');
  document.body.innerHTML = '<h1>Your application</h1><input name="firstName"><input name="email">';
  expect(detect()).toBe(true);
  document.body.innerHTML = '<h1>Sign in</h1><input type="password">';
  expect(detect()).toBe(false);
  document.body.innerHTML =
    '<h1>Contact us</h1><input name="name"><input name="email"><textarea></textarea>';
  expect(detect()).toBe(false);
  document.body.innerHTML = '<h1>Application completed</h1>';
  expect(detect()).toBe(false);
  document.body.innerHTML =
    '<h1>Your application</h1><form aria-label="Contact form"><input name="name"><input name="email"><textarea></textarea></form><form aria-label="Sign in"><input type="password"></form>';
  expect(detect()).toBe(false);
});
afterEach(() => vi.restoreAllMocks());

function componentFields(parent: Element, labels: string[]) {
  for (const [index, label] of labels.entries()) {
    const host = document.createElement('test-field');
    host.setAttribute('label', label);
    host.attachShadow({ mode: 'open' }).innerHTML = `<input id="control-${index}">`;
    parent.append(host);
  }
}

it.each(['form', 'div role="form"', 'main', 'div role="main"'])(
  'recognizes related field components inside %s without input names',
  (markup) => {
    document.body.innerHTML = `<${markup}></${markup.split(' ')[0]}>`;
    componentFields(document.body.firstElementChild!, ['Full name', 'Email', 'LinkedIn']);
    expect(likelyApplicationForm()).toBe(true);
  },
);

it('uses a local resume heading as career evidence without changing the input label', () => {
  document.body.innerHTML =
    '<main><div><h3>Resume</h3><test-dropzone></test-dropzone></div></main>';
  componentFields(document.querySelector('main')!, ['Full name', 'Email']);
  document.querySelector('test-dropzone')!.attachShadow({ mode: 'open' }).innerHTML =
    '<label>Choose a file<input type="file"></label>';
  expect(likelyApplicationForm()).toBe(true);
});

it('preserves document-title evidence for native fields inside a form-free main region', () => {
  document.title = 'Job application';
  document.body.innerHTML =
    '<main><input name="name"><input name="email"><textarea name="message"></textarea></main>';
  expect(likelyApplicationForm()).toBe(true);
  document.title = 'Contact';
  expect(likelyApplicationForm()).toBe(false);
});

it('does not combine unrelated native or shadow forms inside the same main region', () => {
  document.body.innerHTML = '<main><form id="contact"></form><form id="career"></form></main>';
  componentFields(document.querySelector('#contact')!, ['Full name', 'Email', 'Message']);
  componentFields(document.querySelector('#career')!, ['Resume', 'Salary', 'Portfolio']);
  expect(likelyApplicationForm()).toBe(false);
  const main = document.querySelector('main')!;
  main.replaceChildren();
  for (const labels of [
    ['Full name', 'Email', 'Message'],
    ['Resume', 'Salary', 'Portfolio'],
  ]) {
    const host = document.createElement('test-form');
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<form></form>';
    componentFields(root.querySelector('form')!, labels);
    main.append(host);
  }
  expect(likelyApplicationForm()).toBe(false);
});

it('does not borrow career evidence from a sidebar or an independent shadow widget', () => {
  document.body.innerHTML = '<main></main><aside></aside>';
  componentFields(document.querySelector('main')!, ['Full name', 'Email', 'Message']);
  componentFields(document.querySelector('aside')!, ['Resume', 'Salary', 'Portfolio']);
  expect(likelyApplicationForm()).toBe(false);
  document.body.innerHTML = '<test-contact></test-contact><test-career></test-career>';
  for (const [index, labels] of [
    ['Full name', 'Email', 'Message'],
    ['Resume', 'Salary', 'Portfolio'],
  ].entries()) {
    const root = document.body.children[index].attachShadow({ mode: 'open' });
    root.innerHTML = '<div></div>';
    componentFields(root.querySelector('div')!, labels);
  }
  expect(likelyApplicationForm()).toBe(false);
});

it('keeps a plain contact form excluded and ignores Job Buddy controls', () => {
  document.body.innerHTML = '<main></main>';
  componentFields(document.querySelector('main')!, ['Full name', 'Email', 'Message']);
  expect(likelyApplicationForm()).toBe(false);
  const widget = document.createElement('test-widget');
  widget.setAttribute('data-job-buddy-ui', '');
  const root = widget.attachShadow({ mode: 'open' });
  root.innerHTML = '<div></div>';
  componentFields(root.querySelector('div')!, ['Full name', 'Email', 'LinkedIn']);
  document.querySelector('main')!.append(widget);
  expect(likelyApplicationForm()).toBe(false);
});
