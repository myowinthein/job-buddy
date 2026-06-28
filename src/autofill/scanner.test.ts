// @vitest-environment jsdom
import { beforeEach, describe, it, expect } from 'vitest';
import { scanFields, scanAriaFields, getAriaElementType } from './scanner';

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

  it('includes input[type="button"][aria-haspopup="listbox"] as an ARIA combobox (Revolut pattern)', () => {
    const el = document.createElement('input');
    el.type = 'button';
    el.setAttribute('aria-haspopup', 'listbox');
    document.body.appendChild(el);
    // Must NOT be excluded by the button type filter.
    expect(scanFields()).toContain(el);
  });

  it('still excludes input[type="button"] without aria-haspopup', () => {
    addInput({ type: 'button' });
    expect(scanFields()).toHaveLength(0);
  });

  it('excludes a text input that is a descendant of a non-native [role="combobox"]', () => {
    const combobox = document.createElement('div');
    combobox.setAttribute('role', 'combobox');
    const input = document.createElement('input');
    input.type = 'text';
    combobox.appendChild(input);
    document.body.appendChild(combobox);
    // The outer combobox is handled by scanAriaFields(); the inner input should be suppressed.
    expect(scanFields()).toHaveLength(0);
  });
});

describe('scanAriaFields', () => {
  function makeVisible(el: HTMLElement): HTMLElement {
    document.body.appendChild(el);
    return el;
  }

  it('finds a div with role="textbox"', () => {
    const el = document.createElement('div');
    el.setAttribute('role', 'textbox');
    makeVisible(el);
    expect(scanAriaFields()).toContain(el);
  });

  it('finds a div with contenteditable="true"', () => {
    const el = document.createElement('div');
    el.setAttribute('contenteditable', 'true');
    makeVisible(el);
    expect(scanAriaFields()).toContain(el);
  });

  it('finds a button with aria-haspopup="listbox"', () => {
    const el = document.createElement('button');
    el.setAttribute('aria-haspopup', 'listbox');
    makeVisible(el);
    expect(scanAriaFields()).toContain(el);
  });

  it('finds a div with role="combobox"', () => {
    const el = document.createElement('div');
    el.setAttribute('role', 'combobox');
    makeVisible(el);
    expect(scanAriaFields()).toContain(el);
  });

  it('does not include native <input> elements even with ARIA roles', () => {
    const el = document.createElement('input');
    el.setAttribute('role', 'textbox');
    makeVisible(el);
    // Native inputs are already handled by scanFields()
    expect(scanAriaFields()).not.toContain(el);
  });

  it('does not include elements with aria-disabled="true"', () => {
    const el = document.createElement('div');
    el.setAttribute('role', 'combobox');
    el.setAttribute('aria-disabled', 'true');
    makeVisible(el);
    expect(scanAriaFields()).not.toContain(el);
  });

  it('does not include elements inside aria-hidden="true" ancestors', () => {
    const wrapper = document.createElement('div');
    wrapper.setAttribute('aria-hidden', 'true');
    const el = document.createElement('div');
    el.setAttribute('role', 'textbox');
    wrapper.appendChild(el);
    document.body.appendChild(wrapper);
    expect(scanAriaFields()).not.toContain(el);
  });

  it('deduplicates elements that match multiple selectors', () => {
    // A div with both role="combobox" AND aria-haspopup="listbox"
    const el = document.createElement('div');
    el.setAttribute('role', 'combobox');
    el.setAttribute('aria-haspopup', 'listbox');
    makeVisible(el);
    const results = scanAriaFields();
    expect(results.filter((r) => r === el)).toHaveLength(1);
  });
});

describe('getAriaElementType', () => {
  it('returns "text" for role="textbox"', () => {
    const el = document.createElement('div');
    el.setAttribute('role', 'textbox');
    expect(getAriaElementType(el)).toBe('text');
  });

  it('returns "text" for contenteditable="true"', () => {
    const el = document.createElement('div');
    el.setAttribute('contenteditable', 'true');
    expect(getAriaElementType(el)).toBe('text');
  });

  it('returns "select" for role="combobox"', () => {
    const el = document.createElement('div');
    el.setAttribute('role', 'combobox');
    expect(getAriaElementType(el)).toBe('select');
  });

  it('returns "select" for aria-haspopup="listbox"', () => {
    const el = document.createElement('button');
    el.setAttribute('aria-haspopup', 'listbox');
    expect(getAriaElementType(el)).toBe('select');
  });

  it('returns null for an unrelated element', () => {
    const el = document.createElement('div');
    expect(getAriaElementType(el)).toBeNull();
  });
});
