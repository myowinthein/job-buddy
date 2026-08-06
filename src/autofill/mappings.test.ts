// @vitest-environment jsdom
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { saveElementMappings, refreshLearnedLabels } from './mappings';
import { extractSignals } from './signals';
import type { LearnedMappings } from '../types/storage';

// In-memory store to capture saveLearnedMapping calls
const savedMappings: Array<{ domain: string; signal: string; path: string; label?: string }> = [];

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get(key: string, cb: (r: Record<string, unknown>) => void) { cb({}); },
      set(_items: Record<string, unknown>, cb: () => void) { cb(); },
      remove(_keys: string[], cb: () => void) { cb(); },
    },
  },
  runtime: { lastError: null },
});

// Spy on the actual saveLearnedMapping by capturing calls at the chrome layer
vi.mock('../utils/storage', async (importOriginal) => {
  const original = await importOriginal<typeof import('../utils/storage')>();
  return {
    ...original,
    saveLearnedMapping: vi.fn(async (domain: string, signal: string, path: string, label?: string) => {
      savedMappings.push({ domain, signal, path, label });
    }),
  };
});

beforeEach(() => {
  document.body.innerHTML = '';
  savedMappings.length = 0;
  vi.clearAllMocks();
  vi.stubGlobal('CSS', { escape: (s: string) => s });
});

function makeInput(attrs: Record<string, string> = {}): HTMLInputElement {
  const el = document.createElement('input');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  return el;
}

describe('saveElementMappings', () => {
  it('saves a mapping for each non-empty normalised signal on the element', async () => {
    const el = makeInput({ name: 'firstName', id: 'field-first' });
    await saveElementMappings('example.com', el, 'personal.firstName');

    const domains  = savedMappings.map((m) => m.domain);
    const signals  = savedMappings.map((m) => m.signal);
    const paths    = savedMappings.map((m) => m.path);

    expect(domains.every((d) => d === 'example.com')).toBe(true);
    expect(paths.every((p) => p === 'personal.firstName')).toBe(true);
    // name="firstName" normalises to "firstname"; id="field-first" to "fieldfirst"
    expect(signals).toContain('firstname');
    expect(signals).toContain('fieldfirst');
  });

  it('skips empty signals and saves nothing for a bare element', async () => {
    const el = makeInput(); // no name, id, placeholder, aria-label, label, nearbyText
    await saveElementMappings('example.com', el, 'personal.firstName');
    expect(savedMappings).toHaveLength(0);
  });

  it('normalises signals before saving (lowercased, non-alphanumeric stripped)', async () => {
    const el = makeInput({ name: 'First Name' });
    await saveElementMappings('example.com', el, 'personal.firstName');
    expect(savedMappings.some((m) => m.signal === 'firstname')).toBe(true);
  });

  it('includes label text resolved from a <label for> element', async () => {
    const el = makeInput({ type: 'text', id: 'field-email' });
    const label = document.createElement('label');
    label.setAttribute('for', 'field-email');
    label.textContent = 'Email Address';
    document.body.appendChild(label);

    await saveElementMappings('example.com', el, 'personal.email');
    expect(savedMappings.some((m) => m.signal === 'emailaddress')).toBe(true);
  });

  it('passes the best available label through for every saved signal, unnormalised', async () => {
    const el = makeInput({ id: 'field-email', name: 'email', placeholder: 'you@example.com' });
    const label = document.createElement('label');
    label.setAttribute('for', 'field-email');
    label.textContent = 'Email Address';
    document.body.appendChild(label);

    await saveElementMappings('example.com', el, 'personal.email');

    // Label wins over name/id/placeholder per bestLabel's priority order, and
    // is passed as-is (with spacing/casing intact) even though the signal
    // keys themselves are normalised.
    expect(savedMappings.every((m) => m.label === 'Email Address')).toBe(true);
    expect(savedMappings.length).toBeGreaterThan(0);
  });

  it('omits the label when only an id is present and there is no nearby text either', async () => {
    const el = makeInput({ id: 'q_47' });
    await saveElementMappings('example.com', el, 'personal.email');
    expect(savedMappings.length).toBeGreaterThan(0);
    expect(savedMappings.every((m) => m.label === undefined)).toBe(true);
  });

  it('falls back to nearby text for the label when only an id is present (e.g. a custom ATS question)', async () => {
    const wrapper = document.createElement('div');
    wrapper.className = 'form-field';
    const question = document.createElement('p');
    question.textContent = 'Question 3: describe your experience';
    const el = document.createElement('input');
    el.setAttribute('id', 'qa-1205750-3'); // auto-generated id, not human-readable
    wrapper.append(question, el);
    document.body.appendChild(wrapper);

    await saveElementMappings('example.com', el, 'links.portfolio');
    expect(savedMappings.length).toBeGreaterThan(0);
    expect(savedMappings.every((m) => m.label === 'Question 3: describe your experience')).toBe(true);
  });

  it('saves to the correct domain', async () => {
    const el = makeInput({ name: 'city' });
    await saveElementMappings('jobs.co.uk', el, 'address.city');
    expect(savedMappings.every((m) => m.domain === 'jobs.co.uk')).toBe(true);
  });

  it('does not save a mapping for nearbyText, even when it is the only signal present', async () => {
    const wrapper = document.createElement('div');
    wrapper.className = 'form-field';
    const span = document.createElement('span');
    span.textContent = 'Contact Number';
    const el = document.createElement('input'); // no name, id, placeholder, aria-label, or <label for>
    wrapper.append(span, el);
    document.body.appendChild(wrapper);

    await saveElementMappings('example.com', el, 'personal.phone.number');
    expect(savedMappings).toHaveLength(0);
  });
});

describe('refreshLearnedLabels', () => {
  it('backfills a missing label on an existing counted entry and reports a change', () => {
    const el = makeInput({ id: 'field-email' });
    const label = document.createElement('label');
    label.setAttribute('for', 'field-email');
    label.textContent = 'Email Address';
    document.body.appendChild(label);
    const signals = extractSignals(el);

    const mappings: LearnedMappings = {
      'example.com': { 'fieldemail': { path: 'personal.email', count: 1 } },
    };
    const changed = refreshLearnedLabels('example.com', signals, mappings);

    expect(changed).toBe(true);
    expect(mappings['example.com']['fieldemail']).toEqual({
      path: 'personal.email', count: 1, label: 'Email Address',
    });
  });

  it('does not touch count or path when refreshing the label', () => {
    const el = makeInput({ id: 'field-email' });
    const label = document.createElement('label');
    label.setAttribute('for', 'field-email');
    label.textContent = 'Updated Label';
    document.body.appendChild(label);
    const signals = extractSignals(el);

    const mappings: LearnedMappings = {
      'example.com': { 'fieldemail': { path: 'personal.email', count: 2, label: 'Old Label' } },
    };
    refreshLearnedLabels('example.com', signals, mappings);

    expect(mappings['example.com']['fieldemail']).toEqual({
      path: 'personal.email', count: 2, label: 'Updated Label',
    });
  });

  it('returns false and does not mutate when the label is already up to date', () => {
    const el = makeInput({ id: 'field-email' });
    const label = document.createElement('label');
    label.setAttribute('for', 'field-email');
    label.textContent = 'Email Address';
    document.body.appendChild(label);
    const signals = extractSignals(el);

    const mappings: LearnedMappings = {
      'example.com': { 'fieldemail': { path: 'personal.email', count: 2, label: 'Email Address' } },
    };
    expect(refreshLearnedLabels('example.com', signals, mappings)).toBe(false);
  });

  it('leaves a legacy string entry untouched', () => {
    const el = makeInput({ id: 'field-email' });
    const label = document.createElement('label');
    label.setAttribute('for', 'field-email');
    label.textContent = 'Email Address';
    document.body.appendChild(label);
    const signals = extractSignals(el);

    const mappings: LearnedMappings = { 'example.com': { 'fieldemail': 'personal.email' } };
    expect(refreshLearnedLabels('example.com', signals, mappings)).toBe(false);
    expect(mappings['example.com']['fieldemail']).toBe('personal.email');
  });

  it('returns false when the domain has no learned mappings at all', () => {
    const el = makeInput({ name: 'email' });
    const signals = extractSignals(el);
    const mappings: LearnedMappings = {};
    expect(refreshLearnedLabels('example.com', signals, mappings)).toBe(false);
  });

  it('returns false when no signal on the field matches an existing entry', () => {
    const el = makeInput({ name: 'unrelatedfield' });
    const signals = extractSignals(el);
    const mappings: LearnedMappings = {
      'example.com': { 'fieldemail': { path: 'personal.email', count: 2 } },
    };
    expect(refreshLearnedLabels('example.com', signals, mappings)).toBe(false);
  });
});
