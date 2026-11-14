// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { pageActivity } from './pageActivity';

afterEach(() => {
  document.documentElement.removeAttribute('data-job-buddy-activity');
  document.body.innerHTML = '';
  vi.useRealTimers();
});

it('permits only one extension and run token, and never lets a loser release the winner', () => {
  const until = Date.now() + 60_000;
  expect(pageActivity('claim', 'live', 'live-run', until)).toBe(true);
  expect(pageActivity('claim', 'dev', 'dev-run', until)).toBe(false);
  expect(pageActivity('claim', 'live', 'other-run', until)).toBe(false);
  expect(pageActivity('claim', 'live', 'live-run', until)).toBe(true);
  expect(pageActivity('blocked', 'dev')).toBe(true);
  expect(pageActivity('blocked', 'live')).toBe(false);
  pageActivity('release', 'dev', 'dev-run');
  pageActivity('release', 'live', 'old-run');
  expect(pageActivity('blocked', 'dev')).toBe(true);
  pageActivity('release', 'live', 'live-run');
  expect(pageActivity('claim', 'dev', 'dev-run', until)).toBe(true);
});

it('recovers abandoned leases and ignores malformed page metadata', () => {
  vi.useFakeTimers();
  const until = Date.now() + 60_000;
  pageActivity('claim', 'live', 'abandoned', until);
  vi.advanceTimersByTime(60_001);
  expect(pageActivity('blocked', 'dev')).toBe(false);
  expect(pageActivity('claim', 'dev', 'new', Date.now() + 60_000)).toBe(true);
  document.documentElement.setAttribute('data-job-buddy-activity', '{broken');
  expect(pageActivity('claim', 'live', 'new', Date.now() + 60_000)).toBe(true);
});

it('detects a filling older widget and releases when its spinner disappears', () => {
  const host = document.createElement('div');
  host.setAttribute('data-job-buddy-ui', '');
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = '<button class="fill" disabled><span class="spin"></span>Filling…</button>';
  document.body.append(host);
  expect(pageActivity('blocked', 'dev')).toBe(true);
  expect(pageActivity('claim', 'dev', 'new', Date.now() + 60_000)).toBe(false);
  shadow.querySelector('.spin')?.remove();
  expect(pageActivity('claim', 'dev', 'new', Date.now() + 60_000)).toBe(true);
});

it('does not mistake a new widget disabled by a peer for another active run', () => {
  document.body.innerHTML = '<div data-job-buddy-ui data-job-buddy-owner="dev"></div>';
  expect(pageActivity('claim', 'live', 'live-run', Date.now() + 60_000)).toBe(true);
});

it('disables older floating fill and Undo controls while a current build owns the page', () => {
  const host = document.createElement('div');
  host.setAttribute('data-job-buddy-ui', '');
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = '<button class="fill">Fill Form</button><button class="undo">Undo</button><button class="more">More</button>';
  document.body.append(host);
  const fill = shadow.querySelector<HTMLButtonElement>('.fill')!;
  const undo = shadow.querySelector<HTMLButtonElement>('.undo')!;
  const more = shadow.querySelector<HTMLButtonElement>('.more')!;

  pageActivity('claim', 'dev', 'new-run', Date.now() + 60_000);
  expect([fill.disabled, undo.disabled, more.disabled]).toEqual([true, true, false]);
  expect(pageActivity('blocked', 'dev')).toBe(false);
  fill.disabled = false;
  pageActivity('blocked', 'dev');
  expect(fill.disabled).toBe(true);
  pageActivity('release', 'dev', 'new-run');
  expect([fill.disabled, undo.disabled]).toEqual([false, false]);
});

it('restores older controls on expiry and preserves a previously disabled control', () => {
  vi.useFakeTimers();
  const host = document.createElement('div');
  host.setAttribute('data-job-buddy-ui', '');
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = '<button class="fill">Fill Form</button><button class="undo" disabled>Undo</button>';
  document.body.append(host);
  const fill = shadow.querySelector<HTMLButtonElement>('.fill')!;
  const undo = shadow.querySelector<HTMLButtonElement>('.undo')!;

  pageActivity('claim', 'dev', 'abandoned', Date.now() + 60_000);
  expect(fill.disabled).toBe(true);
  vi.advanceTimersByTime(60_001);
  pageActivity('blocked', 'dev');
  expect([fill.disabled, undo.disabled]).toEqual([false, true]);
});
