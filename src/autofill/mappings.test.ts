// @vitest-environment jsdom
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { saveElementMappings } from './mappings';

// In-memory store to capture saveLearnedMapping calls
const savedMappings: Array<{ domain: string; signal: string; path: string }> = [];

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
    saveLearnedMapping: vi.fn(async (domain: string, signal: string, path: string) => {
      savedMappings.push({ domain, signal, path });
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

  it('saves to the correct domain', async () => {
    const el = makeInput({ name: 'city' });
    await saveElementMappings('jobs.co.uk', el, 'address.city');
    expect(savedMappings.every((m) => m.domain === 'jobs.co.uk')).toBe(true);
  });
});
