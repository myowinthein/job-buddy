// @vitest-environment jsdom
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { extractSignals, displayLabel } from './signals';
import type { FieldSignals } from './signals';

beforeEach(() => {
  document.body.innerHTML = '';
  // CSS.escape is not reliably available in jsdom; always stub it so the
  // label[for] resolution path in signals.ts is exercised rather than
  // silently swallowed by the try/catch in getLabelText.
  vi.stubGlobal('CSS', { escape: (s: string) => s });
});

function input(attrs: Record<string, string> = {}): HTMLInputElement {
  const el = document.createElement('input');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  return el;
}

describe('extractSignals', () => {
  it('reads the name attribute', () => {
    const el = input({ name: 'firstName' });
    expect(extractSignals(el).name).toBe('firstName');
  });

  it('reads the id attribute', () => {
    const el = input({ id: 'field-email' });
    expect(extractSignals(el).id).toBe('field-email');
  });

  it('reads the placeholder attribute', () => {
    const el = input({ placeholder: 'Enter your city' });
    expect(extractSignals(el).placeholder).toBe('Enter your city');
  });

  it('reads the autocomplete attribute', () => {
    const el = input({ autocomplete: 'given-name' });
    expect(extractSignals(el).autocomplete).toBe('given-name');
  });

  it('reads the aria-label attribute', () => {
    const el = input({ 'aria-label': 'Email address' });
    expect(extractSignals(el).ariaLabel).toBe('Email address');
  });

  it('resolves label text from a <label for="id"> element', () => {
    const el = input({ type: 'text', id: 'field-name' });
    const label = document.createElement('label');
    label.setAttribute('for', 'field-name');
    label.textContent = 'Full Name';
    document.body.appendChild(label);
    expect(extractSignals(el).label).toBe('Full Name');
  });

  it('resolves label text from a parent <label> element', () => {
    const label = document.createElement('label');
    label.textContent = 'Phone ';
    const el = document.createElement('input');
    label.appendChild(el);
    document.body.appendChild(label);
    expect(extractSignals(el).label).toBe('Phone');
  });

  it('excludes a wrapped <select>\'s option text from the parent <label> (accessible calling-code dropdown)', () => {
    // Reproduces a real bug: <label>Phone<select>…every country option…</select></label>
    // caused .textContent to concatenate all 200+ option strings into the label signal.
    const label = document.createElement('label');
    label.append('Phone');
    const select = document.createElement('select');
    for (const [text, value] of [['United States', '1'], ['United Kingdom', '44'], ['Canada', '1']] as const) {
      const opt = document.createElement('option');
      opt.textContent = text;
      opt.value = value;
      select.appendChild(opt);
    }
    label.appendChild(select);
    document.body.appendChild(label);
    expect(extractSignals(select).label).toBe('Phone');
  });

  it('excludes a nested <select>\'s option text from a <label for> element too', () => {
    const el = input({ type: 'text', id: 'field-name' });
    const label = document.createElement('label');
    label.setAttribute('for', 'field-name');
    label.append('Full Name');
    // Some accessible-forms markup wraps an unrelated control inside the same
    // label as the one it's `for` — its option text must not leak in either.
    const select = document.createElement('select');
    for (const text of ['United States', 'United Kingdom', 'Canada']) {
      const opt = document.createElement('option');
      opt.textContent = text;
      select.appendChild(opt);
    }
    label.appendChild(select);
    document.body.appendChild(label);
    expect(extractSignals(el).label).toBe('Full Name');
  });

  it('returns empty label when no label is associated', () => {
    const el = input({ type: 'text', name: 'unlabelled' });
    expect(extractSignals(el).label).toBe('');
  });

  it('reads nearbyText from a label inside a known wrapper', () => {
    const wrapper = document.createElement('div');
    wrapper.className = 'form-field';
    const span = document.createElement('span');
    span.textContent = 'City';
    const el = document.createElement('input');
    wrapper.appendChild(span);
    wrapper.appendChild(el);
    document.body.appendChild(wrapper);
    expect(extractSignals(el).nearbyText).toBe('City');
  });

  it('excludes a nested <select>\'s option text from nearbyText too', () => {
    const wrapper = document.createElement('div');
    wrapper.className = 'form-field';
    const span = document.createElement('span');
    span.append('Phone Code');
    const select = document.createElement('select');
    for (const text of ['United States', 'United Kingdom', 'Canada']) {
      const opt = document.createElement('option');
      opt.textContent = text;
      select.appendChild(opt);
    }
    span.appendChild(select); // the matched <span> itself wraps the control
    const el = document.createElement('input');
    wrapper.append(span, el);
    document.body.appendChild(wrapper);
    expect(extractSignals(el).nearbyText).toBe('Phone Code');
  });

  it('returns empty nearbyText when no wrapper matches', () => {
    const el = input({ type: 'text' });
    expect(extractSignals(el).nearbyText).toBe('');
  });

  it('returns the element itself on the signals object', () => {
    const el = input({ type: 'text' });
    expect(extractSignals(el).element).toBe(el);
  });

  it('reads type from the element', () => {
    const el = input({ type: 'email' });
    expect(extractSignals(el).type).toBe('email');
  });
});

// ── ARIA-aware extraction (non-native elements) ─────────────────────────────

function div(attrs: Record<string, string> = {}): HTMLDivElement {
  const el = document.createElement('div');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  return el;
}

describe('extractSignals — aria-labelledby resolution', () => {
  it('resolves a single aria-labelledby ID to its text content', () => {
    const label = document.createElement('span');
    label.id = 'lbl-1';
    label.textContent = 'Email Address';
    document.body.appendChild(label);

    const el = div({ 'aria-labelledby': 'lbl-1' });
    expect(extractSignals(el).ariaLabel).toBe('Email Address');
  });

  it('joins multiple space-separated aria-labelledby IDs with a space', () => {
    const a = document.createElement('span');
    a.id = 'lbl-a';
    a.textContent = 'Phone';
    const b = document.createElement('span');
    b.id = 'lbl-b';
    b.textContent = 'Number';
    document.body.appendChild(a);
    document.body.appendChild(b);

    const el = div({ 'aria-labelledby': 'lbl-a lbl-b' });
    expect(extractSignals(el).ariaLabel).toBe('Phone Number');
  });

  it('returns empty string when aria-labelledby targets do not exist', () => {
    const el = div({ 'aria-labelledby': 'missing-id' });
    expect(extractSignals(el).ariaLabel).toBe('');
  });

  it('prefers explicit aria-label over aria-labelledby when both are present', () => {
    const label = document.createElement('span');
    label.id = 'lbl-x';
    label.textContent = 'Via Labelledby';
    document.body.appendChild(label);

    const el = div({ 'aria-label': 'Via Aria-Label', 'aria-labelledby': 'lbl-x' });
    expect(extractSignals(el).ariaLabel).toBe('Via Aria-Label');
  });
});

describe('extractSignals — aria-placeholder fallback', () => {
  it('reads aria-placeholder when the element has no native placeholder', () => {
    const el = div({ 'aria-placeholder': 'Enter your name' });
    expect(extractSignals(el).placeholder).toBe('Enter your name');
  });

  it('prefers native placeholder over aria-placeholder', () => {
    const el = input({ type: 'text', placeholder: 'Native', 'aria-placeholder': 'Aria' });
    expect(extractSignals(el).placeholder).toBe('Native');
  });
});

describe('extractSignals — ARIA-derived type', () => {
  it('uses role as type for a non-native element', () => {
    const el = div({ role: 'combobox' });
    expect(extractSignals(el).type).toBe('combobox');
  });

  it('uses "textbox" for contenteditable when there is no role', () => {
    const el = div({ contenteditable: 'true' });
    expect(extractSignals(el).type).toBe('textbox');
  });

  it('falls back to the lowercased tag name for non-native elements without role or contenteditable', () => {
    const el = div();
    expect(extractSignals(el).type).toBe('div');
  });
});

describe('extractSignals — autocomplete on non-native elements', () => {
  it('reads the autocomplete attribute from a non-native element', () => {
    const el = div({ autocomplete: 'given-name' });
    expect(extractSignals(el).autocomplete).toBe('given-name');
  });
});

function signals(overrides: Partial<FieldSignals> = {}): FieldSignals {
  return {
    element: document.createElement('input'),
    type: 'text', name: '', id: '', placeholder: '', autocomplete: '',
    ariaLabel: '', label: '', nearbyText: '',
    ...overrides,
  };
}

describe('displayLabel', () => {
  it('prefers label/ariaLabel/placeholder/name over nearbyText', () => {
    expect(displayLabel(signals({ label: 'First Name', nearbyText: 'Ignored' }))).toBe('First Name');
  });

  it('falls back to nearbyText when label/ariaLabel/placeholder/name are all empty', () => {
    expect(displayLabel(signals({ nearbyText: 'Question 3: describe your experience' })))
      .toBe('Question 3: describe your experience');
  });

  it('returns undefined when every signal, including nearbyText, is empty', () => {
    expect(displayLabel(signals())).toBeUndefined();
  });

  it('truncates to 120 characters', () => {
    const long = 'x'.repeat(200);
    const result = displayLabel(signals({ nearbyText: long }));
    expect(result).toHaveLength(120);
  });
});
