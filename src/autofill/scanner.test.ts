// @vitest-environment jsdom
import { beforeEach, describe, it, expect } from 'vitest';
import { scanFields } from './scanner';

// jsdom does not run CSS layout, so offsetParent is always null and
// getBoundingClientRect always returns zeros. Override both at the prototype
// level so elements appended to the body pass the visibility checks.
beforeEach(() => {
  document.body.innerHTML = '';

  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get() { return document.body; },
  });
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value() { return { width: 100, height: 40, top: 0, left: 0, bottom: 40, right: 100 }; },
  });
});

function addInput(attrs: Record<string, string> = {}): HTMLInputElement {
  const el = document.createElement('input');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  return el;
}

describe('scanFields', () => {
  it('includes a standard visible text input', () => {
    addInput({ type: 'text', name: 'username' });
    expect(scanFields()).toHaveLength(1);
  });

  it('includes a textarea', () => {
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    expect(scanFields()).toHaveLength(1);
  });

  it('includes a select element', () => {
    const sel = document.createElement('select');
    document.body.appendChild(sel);
    expect(scanFields()).toHaveLength(1);
  });

  it('excludes hidden input type', () => {
    addInput({ type: 'hidden' });
    expect(scanFields()).toHaveLength(0);
  });

  it('excludes submit input type', () => {
    addInput({ type: 'submit' });
    expect(scanFields()).toHaveLength(0);
  });

  it('excludes button input type', () => {
    addInput({ type: 'button' });
    expect(scanFields()).toHaveLength(0);
  });

  it('excludes checkbox input type', () => {
    addInput({ type: 'checkbox' });
    expect(scanFields()).toHaveLength(0);
  });

  it('excludes radio input type', () => {
    addInput({ type: 'radio' });
    expect(scanFields()).toHaveLength(0);
  });

  it('excludes file inputs by default', () => {
    addInput({ type: 'file' });
    expect(scanFields()).toHaveLength(0);
  });

  it('includes file inputs when allowFileInputs is true', () => {
    addInput({ type: 'file' });
    expect(scanFields({ allowFileInputs: true })).toHaveLength(1);
  });

  it('excludes file inputs with tabindex="-1" even when allowFileInputs is true', () => {
    addInput({ type: 'file', tabindex: '-1' });
    expect(scanFields({ allowFileInputs: true })).toHaveLength(0);
  });

  it('excludes disabled inputs', () => {
    const el = addInput({ type: 'text' });
    el.disabled = true;
    expect(scanFields()).toHaveLength(0);
  });

  it('excludes readonly inputs', () => {
    const el = addInput({ type: 'text' });
    (el as HTMLInputElement).readOnly = true;
    expect(scanFields()).toHaveLength(0);
  });

  it('excludes inputs inside a [hidden] ancestor', () => {
    const wrapper = document.createElement('div');
    wrapper.setAttribute('hidden', '');
    const el = document.createElement('input');
    wrapper.appendChild(el);
    document.body.appendChild(wrapper);
    expect(scanFields()).toHaveLength(0);
  });

  it('excludes inputs inside an aria-hidden="true" ancestor', () => {
    const wrapper = document.createElement('div');
    wrapper.setAttribute('aria-hidden', 'true');
    const el = document.createElement('input');
    wrapper.appendChild(el);
    document.body.appendChild(wrapper);
    expect(scanFields()).toHaveLength(0);
  });
});
