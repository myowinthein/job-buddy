// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { likelyApplicationForm } from './detect';

beforeEach(() => {
  document.body.innerHTML = '';
  document.title = 'Test page';
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 100,
    height: 30,
  } as DOMRect);
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
