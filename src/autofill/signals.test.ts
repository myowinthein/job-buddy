// @vitest-environment jsdom
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { extractSignals } from './signals';

beforeEach(() => {
  document.body.innerHTML = '';
  // CSS.escape is not automatically a global in jsdom; stub it so the
  // label[for] resolution path in signals.ts doesn't throw and get swallowed.
  if (typeof CSS === 'undefined') {
    vi.stubGlobal('CSS', { escape: (s: string) => s });
  }
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
