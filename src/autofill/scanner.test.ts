// @vitest-environment jsdom
import { beforeEach, describe, it, expect } from 'vitest';
import { scanFields, scanAriaFields, getAriaElementType, scanRadioGroups, scanCheckboxGroups } from './scanner';

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

// ── scanRadioGroups ───────────────────────────────────────────────────────────

function addRadio(name: string, value: string, id?: string): HTMLInputElement {
  const el = document.createElement('input');
  el.type = 'radio';
  el.name = name;
  el.value = value;
  if (id) el.id = id;
  document.body.appendChild(el);
  return el;
}

function addCheckbox(attrs: { name?: string; value?: string; id?: string } = {}): HTMLInputElement {
  const el = document.createElement('input');
  el.type = 'checkbox';
  if (attrs.name)  el.name = attrs.name;
  if (attrs.value) el.value = attrs.value;
  if (attrs.id)    el.id = attrs.id;
  document.body.appendChild(el);
  return el;
}

// Wraps a checkbox in a <label> with trailing text. Uses the closest('label')
// path in getOptionLabel — jsdom lacks CSS.escape, so the label[for] path is
// unavailable in this environment.
function addWrappedCheckbox(name: string, value: string, labelText: string): HTMLInputElement {
  const label = document.createElement('label');
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  if (name) cb.name = name;
  cb.value = value;
  label.appendChild(cb);
  label.appendChild(document.createTextNode(labelText));
  document.body.appendChild(label);
  return cb;
}

describe('scanRadioGroups', () => {
  it('groups radios that share a name', () => {
    addRadio('gender', 'male');
    addRadio('gender', 'female');
    const groups = scanRadioGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe('gender');
    expect(groups[0].options).toHaveLength(2);
  });

  it('filters out radio groups with fewer than 2 options', () => {
    addRadio('single', 'only');
    expect(scanRadioGroups()).toHaveLength(0);
  });

  it('ignores radios with no name', () => {
    const a = document.createElement('input');
    a.type = 'radio';
    a.value = 'x';
    document.body.appendChild(a);
    const b = document.createElement('input');
    b.type = 'radio';
    b.value = 'y';
    document.body.appendChild(b);
    expect(scanRadioGroups()).toHaveLength(0);
  });

  it('reads option labels from a wrapping <label> element', () => {
    // Wrapping-label path (el.closest('label')) avoids CSS.escape, which jsdom
    // does not implement — the label[for] path is unavailable in this env.
    const l1 = document.createElement('label');
    const r1 = document.createElement('input');
    r1.type = 'radio'; r1.name = 'pref'; r1.value = 'yes';
    l1.appendChild(r1);
    l1.appendChild(document.createTextNode('Yes please'));
    const l2 = document.createElement('label');
    const r2 = document.createElement('input');
    r2.type = 'radio'; r2.name = 'pref'; r2.value = 'no';
    l2.appendChild(r2);
    l2.appendChild(document.createTextNode('No thanks'));
    document.body.appendChild(l1);
    document.body.appendChild(l2);

    const groups = scanRadioGroups();
    const labels = groups[0].options.map((o) => o.label);
    expect(labels).toContain('Yes please');
    expect(labels).toContain('No thanks');
  });

  it('uses the fieldset legend as the group label (getGroupLegend)', () => {
    const fieldset = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = 'Preferred contact method';
    fieldset.appendChild(legend);
    const r1 = document.createElement('input');
    r1.type = 'radio'; r1.name = 'contact'; r1.value = 'email';
    const r2 = document.createElement('input');
    r2.type = 'radio'; r2.name = 'contact'; r2.value = 'phone';
    fieldset.appendChild(r1);
    fieldset.appendChild(r2);
    document.body.appendChild(fieldset);

    const groups = scanRadioGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0].groupLabel).toBe('Preferred contact method');
  });

  it('falls back to the name when there is no legend', () => {
    addRadio('country', 'th');
    addRadio('country', 'sg');
    const groups = scanRadioGroups();
    expect(groups[0].groupLabel).toBe('country');
  });
});

// ── scanCheckboxGroups ────────────────────────────────────────────────────────

describe('scanCheckboxGroups', () => {
  it('flags a consent checkbox whose label contains "agree"', () => {
    addWrappedCheckbox('accept1', 'yes', 'I agree to the processing of my data');
    const groups = scanCheckboxGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0].isConsent).toBe(true);
  });

  it('flags a consent checkbox via "terms" / "privacy" in the label', () => {
    addWrappedCheckbox('accept2', 'yes', 'I accept the terms and the privacy policy');
    const groups = scanCheckboxGroups();
    expect(groups[0].isConsent).toBe(true);
  });

  it('does not flag a plain non-consent checkbox', () => {
    addWrappedCheckbox('remember', 'yes', 'Remember my choice');
    const groups = scanCheckboxGroups();
    expect(groups[0].isConsent).toBe(false);
  });

  it('gives anonymous checkboxes (no name) distinct synthetic keys', () => {
    addCheckbox({ value: 'a' }); // no name
    addCheckbox({ value: 'b' }); // no name
    const groups = scanCheckboxGroups();
    // Two separate groups because each anonymous checkbox gets its own key.
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.name === '')).toBe(true);
  });

  it('groups named checkboxes that share a name into one group', () => {
    addCheckbox({ name: 'skills', value: 'js' });
    addCheckbox({ name: 'skills', value: 'ts' });
    const groups = scanCheckboxGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0].options).toHaveLength(2);
  });

  it('uses the fieldset legend as the checkbox group label', () => {
    const fieldset = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = 'Select your skills';
    fieldset.appendChild(legend);
    const c1 = document.createElement('input');
    c1.type = 'checkbox'; c1.name = 'sk'; c1.value = 'a';
    fieldset.appendChild(c1);
    document.body.appendChild(fieldset);

    const groups = scanCheckboxGroups();
    expect(groups[0].groupLabel).toBe('Select your skills');
  });
});
