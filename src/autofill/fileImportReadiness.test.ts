// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { observeFileImport } from './fileImportReadiness';

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 100,
    height: 30,
  } as DOMRect);
  document.body.innerHTML = '<main><input type="file"><form><button>Next</button></form></main>';
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.innerHTML = '';
});
const input = () => document.querySelector('input')!;
const button = () => document.querySelector('button')!;

it('waits for an adjacent sole application form to finish importing', async () => {
  const observer = observeFileImport(input());
  button().disabled = true;
  let finished = false;
  const waiting = observer
    .wait(() => true)
    .then((ready) => {
      finished = true;
      return ready;
    });
  await vi.advanceTimersByTimeAsync(500);
  expect(finished).toBe(false);
  button().disabled = false;
  await vi.advanceTimersByTimeAsync(64);
  expect(await waiting).toBe(true);
  observer.dispose();
});

it('does not wait for an initially disabled validation button', async () => {
  button().disabled = true;
  const observer = observeFileImport(input());
  const waiting = observer.wait(() => true);
  await vi.advanceTimersByTimeAsync(64);
  expect(await waiting).toBe(true);
  observer.dispose();
});

it('ignores Job Buddy controls and progress inside its shadow root', async () => {
  const host = document.createElement('div');
  host.setAttribute('data-job-buddy-ui', '');
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = '<button>Fill Form</button>';
  document.querySelector('main')!.append(host);
  const observer = observeFileImport(input());
  shadow.querySelector('button')!.disabled = true;
  shadow.innerHTML += '<progress></progress>';
  const waiting = observer.wait(() => true);
  await vi.advanceTimersByTimeAsync(64);
  expect(await waiting).toBe(true);
  observer.dispose();
});

it('waits for a newly visible semantic progress indicator', async () => {
  const observer = observeFileImport(input());
  const progress = document.createElement('progress');
  document.querySelector('form')!.append(progress);
  let finished = false;
  const waiting = observer
    .wait(() => true)
    .then((ready) => {
      finished = true;
      return ready;
    });
  await vi.advanceTimersByTimeAsync(96);
  expect(finished).toBe(false);
  progress.remove();
  await vi.advanceTimersByTimeAsync(64);
  expect(await waiting).toBe(true);
  observer.dispose();
});

it('never uses an unrelated form or a whole document as an upload dependency', async () => {
  document.body.innerHTML = '<input type="file"><form><button>Next</button></form>';
  const observer = observeFileImport(input());
  button().disabled = true;
  expect(await observer.wait(() => true)).toBe(true);
  observer.dispose();
});

it('does not guess an adjacent form when several forms exist', async () => {
  document.querySelector('main')!.insertAdjacentHTML('beforeend', '<form></form>');
  const observer = observeFileImport(input());
  button().disabled = true;
  expect(await observer.wait(() => true)).toBe(true);
  observer.dispose();
});

it('stops promptly after cancellation', async () => {
  const observer = observeFileImport(input());
  button().disabled = true;
  let active = true;
  const waiting = observer.wait(() => active);
  active = false;
  await vi.advanceTimersByTimeAsync(32);
  expect(await waiting).toBe(false);
  observer.dispose();
});

it('bounds a stuck importer instead of allowing later writes to race it', async () => {
  const observer = observeFileImport(input());
  button().disabled = true;
  const waiting = observer.wait(() => true);
  await vi.advanceTimersByTimeAsync(10_032);
  expect(await waiting).toBe(false);
  observer.dispose();
});
