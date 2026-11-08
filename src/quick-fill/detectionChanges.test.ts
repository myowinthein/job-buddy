// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { affectsApplicationDetection, DETECTION_ATTRIBUTES } from './detectionChanges';

let observer: MutationObserver;
const roots = new Set<ShadowRoot>();
beforeEach(() => {
  observer?.disconnect();
  roots.clear();
  document.body.innerHTML =
    '<div id="decoration"><span>12:00</span></div><form><label>Name<input name="name"></label><input name="email"><input name="resume"></form>';
  observer = new MutationObserver(() => {});
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeOldValue: true,
    attributeFilter: DETECTION_ATTRIBUTES,
  });
});
const changed = () => affectsApplicationDetection(observer.takeRecords(), roots);

describe('Quick Fill detection invalidation', () => {
  it('ignores unrelated class, style and decorative content updates', () => {
    const decoration = document.querySelector('#decoration')!;
    decoration.className = 'active';
    decoration.setAttribute('style', 'opacity: 0.5');
    decoration.querySelector('span')!.textContent = '12:01';
    decoration.append(document.createElement('span'));
    expect(changed()).toBe(false);
    document.querySelector('form')!.append(document.createElement('span'));
    expect(changed()).toBe(false);
    document.querySelector('input')!.style.backgroundColor = 'green';
    expect(changed()).toBe(false);
    document.querySelector('form')!.style.display = 'none';
    expect(changed()).toBe(true);
    document.querySelector('form')!.style.display = '';
    expect(changed()).toBe(true);
  });

  it('notices added and removed controls and changes to their visibility or labels', () => {
    const input = document.createElement('input');
    document.querySelector('form')!.append(input);
    expect(changed()).toBe(true);
    input.remove();
    expect(changed()).toBe(true);
    document.querySelector('form')!.className = 'hidden';
    expect(changed()).toBe(true);
    document.querySelector('label')!.firstChild!.textContent = 'Full name';
    expect(changed()).toBe(true);
    document.querySelector('input')!.setAttribute('aria-label', 'Full name');
    expect(changed()).toBe(true);
    document.querySelector('input')!.setAttribute('disabled', '');
    expect(changed()).toBe(true);
    document.querySelector('input')!.setAttribute('type', 'hidden');
    expect(changed()).toBe(true);
    const custom = document.createElement('div');
    custom.setAttribute('role', 'textbox');
    document.body.append(custom);
    expect(changed()).toBe(true);
    custom.setAttribute('role', 'button');
    expect(changed()).toBe(true);
  });

  it('notices remote label text, section headings, form signals and frame changes', () => {
    document.body.insertAdjacentHTML(
      'beforeend',
      '<label for="first">First name</label><h2>Contact</h2>',
    );
    expect(changed()).toBe(true);
    document.querySelector('label[for]')!.textContent = 'Applicant name';
    expect(changed()).toBe(true);
    document.querySelector('h2')!.textContent = 'Job application';
    expect(changed()).toBe(true);
    document.querySelector('form')!.setAttribute('aria-label', 'Job application');
    expect(changed()).toBe(true);
    document.body.append(document.createElement('iframe'));
    expect(changed()).toBe(true);
  });

  it('discovers inserted shadow hosts and invalidates a known shadow form when its ancestor hides', () => {
    const wrapper = document.createElement('div');
    const host = wrapper.appendChild(document.createElement('div'));
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<input name="email">';
    document.body.append(wrapper);
    expect(changed()).toBe(true);
    roots.add(root);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    root.append(document.createElement('input'));
    expect(changed()).toBe(true);
    wrapper.hidden = true;
    expect(changed()).toBe(true);
  });

  it('ignores Job Buddy widget insertion and its own mutations', () => {
    const widget = document.createElement('div');
    widget.setAttribute('data-job-buddy-ui', '');
    widget.innerHTML = '<input><button>Fill Form</button>';
    document.body.append(widget);
    widget.className = 'active';
    widget.querySelector('button')!.textContent = 'Filling';
    expect(changed()).toBe(false);
  });
});
