import { afterEach, describe, expect, it, vi } from 'vitest';
import { installDemoPresence, isDemoURL } from './presence';

afterEach(() => vi.unstubAllGlobals());

describe('demo presence scope', () => {
  it('allows only the hosted demo and known local preview paths', () => {
    for (const url of [
      'https://myowinthein.github.io/job-buddy/demo/',
      'https://myowinthein.github.io/job-buddy/demo/index.html?sample=1',
      'http://127.0.0.1:3000/docs/demo/',
      'http://localhost:4173/demo/',
      'http://127.0.0.1/job-buddy/demo/',
    ])
      expect(isDemoURL(new URL(url)), url).toBe(true);
    for (const url of [
      'https://myowinthein.github.io/',
      'https://myowinthein.github.io/other/demo/',
      'https://myowinthein.github.io/job-buddy/demo/other',
      'http://myowinthein.github.io/job-buddy/demo/',
      'https://myowinthein.github.io.example.test/job-buddy/demo/',
      'https://example.test/demo/',
      'http://127.0.0.1:3000/options.html',
    ])
      expect(isDemoURL(new URL(url)), url).toBe(false);
  });
});

function environment(href = 'https://myowinthein.github.io/job-buddy/demo/') {
  const url = new URL(href);
  const addEventListener = vi.fn();
  const postMessage = vi.fn();
  const target = { addEventListener, postMessage, top: undefined as unknown };
  target.top = target;
  vi.stubGlobal('window', target);
  vi.stubGlobal('location', url);
  vi.stubGlobal('chrome', { runtime: { id: 'synthetic-extension' } });
  return { target, url, addEventListener, postMessage };
}

it('returns only presence and a validated request identifier', () => {
  const { target, url, addEventListener, postMessage } = environment();
  installDemoPresence();
  expect(postMessage).toHaveBeenCalledWith(
    { channel: 'job-buddy-demo', type: 'presence-ready' },
    url.origin,
  );
  const receive = addEventListener.mock.calls[0][1];
  postMessage.mockClear();
  receive({
    source: target,
    origin: url.origin,
    data: {
      channel: 'job-buddy-demo',
      type: 'presence-request',
      requestId: 'request-123',
      action: 'AUTOFILL_FILL',
      profile: true,
    },
  });
  expect(postMessage.mock.calls).toEqual([
    [
      { channel: 'job-buddy-demo', type: 'presence-response', requestId: 'request-123' },
      url.origin,
    ],
  ]);
});

it('ignores foreign sources, invalid messages and invalidated extension contexts', () => {
  const { target, url, addEventListener, postMessage } = environment();
  installDemoPresence();
  const receive = addEventListener.mock.calls[0][1];
  postMessage.mockClear();
  const valid = {
    source: target,
    origin: url.origin,
    data: {
      channel: 'job-buddy-demo',
      type: 'presence-request',
      requestId: 'request-123',
    },
  };
  for (const event of [
    { ...valid, source: {} },
    { ...valid, origin: 'https://other.test' },
    { ...valid, data: null },
    { ...valid, data: { ...valid.data, channel: 'other' } },
    { ...valid, data: { ...valid.data, type: 'AUTOFILL_FILL' } },
    { ...valid, data: { ...valid.data, requestId: 'x'.repeat(65) } },
  ])
    receive(event);
  vi.stubGlobal('chrome', { runtime: {} });
  receive(valid);
  vi.stubGlobal('chrome', {
    get runtime() {
      throw new Error('Extension context invalidated');
    },
  });
  receive(valid);
  expect(postMessage).not.toHaveBeenCalled();
});

it('does not install on unrelated pages or embedded frames', () => {
  const elsewhere = environment('https://example.test/demo/');
  installDemoPresence();
  expect(elsewhere.addEventListener).not.toHaveBeenCalled();
  const embedded = environment();
  embedded.target.top = {};
  installDemoPresence();
  expect(embedded.addEventListener).not.toHaveBeenCalled();
});
