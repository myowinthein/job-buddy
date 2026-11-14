// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { likelyApplicationForm } from './detect';
import { normalizePreferences } from './preferences';
import { quickFillSenderTab } from './background';
import { quickFillSummary } from './status';
import { scanFields, scanAriaFields } from '@/src/autofill/scanner';
import { QuickFillWidget } from './widget';
import { pageActivity } from '@/src/autofill/pageActivity';

beforeEach(() => {
  document.documentElement.removeAttribute('data-job-buddy-activity');
  document.body.innerHTML = '';
  vi.stubGlobal('chrome', { runtime: { id: 'job-buddy' } });
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([
    {} as DOMRect,
  ] as unknown as DOMRectList);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 120,
    height: 32,
    top: 0,
    left: 0,
    bottom: 32,
    right: 120,
    x: 0,
    y: 0,
    toJSON() {},
  });
});

it('disables Fill Form and Undo for a competing run while keeping existing results visible', () => {
  const widget = new QuickFillWidget({ fill() {}, undo() {}, details() {}, hide() {}, disableSite() {}, settings() {}, position() {} });
  try {
    widget.render({ stage: 'completed', results: [{ noReview: 1, totalScanned: 1 }] } as never);
    pageActivity('claim', 'other-extension', 'run', Date.now() + 60_000);
    widget.setBlocked(true);
    const root = widget.host.shadowRoot!;
    expect(root.querySelector<HTMLButtonElement>('.fill')?.disabled).toBe(true);
    expect(root.querySelector<HTMLButtonElement>('.undo')?.disabled).toBe(true);
    expect(root.querySelector('.spin')).toBeNull();
    expect(root.querySelector('.status')?.hasAttribute('hidden')).toBe(false);
    pageActivity('release', 'other-extension', 'run');
    widget.setBlocked(false);
    expect(root.querySelector<HTMLButtonElement>('.fill')?.disabled).toBe(false);
  } finally { widget.destroy(); }
});

describe('local application detection', () => {
  it('requires identity and career signals in the same group', () => {
    document.body.innerHTML =
      '<form><label>Full name<input name="name"></label><input type="email" name="email"><label>Resume<input type="file" name="resume"></label></form>';
    expect(likelyApplicationForm()).toBe(true);
    document.body.innerHTML =
      '<form><input name="name"><input type="email" name="email"><textarea name="message"></textarea></form>';
    expect(likelyApplicationForm()).toBe(false);
    document.body.innerHTML +=
      '<form><input name="resume"><input name="salary"><input name="portfolio"></form>';
    expect(likelyApplicationForm()).toBe(false);
  });
  it('finds open-shadow forms but excludes the quick action itself', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML =
      '<form><input name="firstName"><input name="email"><input name="resume"></form>';
    expect(likelyApplicationForm()).toBe(true);
    host.setAttribute('data-job-buddy-ui', '');
    expect(likelyApplicationForm()).toBe(false);
    expect(scanFields()).toHaveLength(0);
    shadow.innerHTML = '<input role="combobox" name="resume">';
    expect(scanAriaFields()).toHaveLength(0);
  });
});
it('rejects forged and child-frame tab control and derives the real source tab', () => {
  const sender = {
    id: 'job-buddy',
    frameId: 0,
    url: 'https://example.test/jobs',
    tab: { id: 17 },
  } as chrome.runtime.MessageSender;
  expect(quickFillSenderTab(sender)).toBe(17);
  expect(quickFillSenderTab({ ...sender, id: 'other' })).toBeNull();
  expect(quickFillSenderTab({ ...sender, frameId: 3 })).toBeNull();
  expect(quickFillSenderTab({ ...sender, tab: undefined })).toBeNull();
  expect(quickFillSenderTab({ ...sender, url: 'chrome://extensions' })).toBeNull();
});
it('bounds positions and preserves disabled preferences without accepting invalid data', () => {
  expect(normalizePreferences(undefined)).toEqual({
    enabled: true,
    fillMode: 'overwrite',
    disabledSites: [],
  });
  expect(
    normalizePreferences({
      enabled: false,
      disabledSites: ['example.test', 2, 'example.test'],
      position: { x: 99, y: -1 },
    }),
  ).toEqual({
    enabled: false,
    fillMode: 'overwrite',
    disabledSites: ['example.test'],
    position: { x: 1, y: 0 },
  });
});
it('defaults to empty and existing fields and preserves either explicit mode', () => {
  for (const fillMode of [undefined, null, '', 'all', true])
    expect(normalizePreferences({ fillMode }).fillMode).toBe('overwrite');
  expect(normalizePreferences({ fillMode: 'merge' }).fillMode).toBe('merge');
  expect(normalizePreferences({ fillMode: 'overwrite' }).fillMode).toBe('overwrite');
});
it('reports partial AI failure and counts review outcomes without counting kept answers as fills', () => {
  const summary = quickFillSummary({
    results: [
      { totalScanned: 3, noReview: 1, needReview: 1, noData: 1, kept: 4, aiStatus: 'succeeded' },
      { totalScanned: 1, noReview: 1, aiStatus: 'unavailable' },
    ],
  } as never);
  expect(summary).toEqual({
    filled: 3,
    review: true,
    text: 'AI was unavailable. Basic autofill ran.',
  });
});
it('ignores synthetic page clicks on all privileged widget actions', () => {
  const actions = {
    fill: vi.fn(),
    undo: vi.fn(),
    details: vi.fn(),
    hide: vi.fn(),
    disableSite: vi.fn(),
    settings: vi.fn(),
    position: vi.fn(),
  };
  const widget = new QuickFillWidget(actions);
  const root = widget.host.shadowRoot!;
  root.querySelectorAll<HTMLButtonElement>('button').forEach((button) => button.click());
  for (const action of Object.values(actions)) expect(action).not.toHaveBeenCalled();
  widget.destroy();
});

it.each(['profile_setup_required', 'ai_setup_required', 'autofill_failed', 'page_changed'])(
  'presents %s as a simple status message', error => {
    const widget = new QuickFillWidget({ fill() {}, undo() {}, details() {}, hide() {}, disableSite() {}, settings() {}, position() {} });
    try {
      widget.render({ stage: 'error', error } as never);
      const root = widget.host.shadowRoot!;
      const setup = error.endsWith('setup_required');
      expect(root.querySelector('.status')?.hasAttribute('data-banner')).toBe(false);
      expect(root.querySelector('.status')?.getAttribute('data-tone')).toBe(setup ? 'setup' : 'error');
      expect(root.querySelector(`p[role="${setup ? 'status' : 'alert'}"]`)).not.toBeNull();
      expect(root.querySelector('.message-icon')).toBeNull();
    } finally { widget.destroy(); }
  },
);

it('restores polite status announcements when a later fill completes', () => {
  const widget = new QuickFillWidget({ fill() {}, undo() {}, details() {}, hide() {}, disableSite() {}, settings() {}, position() {} });
  try {
    widget.render({ stage: 'error', error: 'autofill_failed' } as never);
    widget.render({ stage: 'completed', results: [{ noReview: 1, totalScanned: 1 }] } as never);
    const root = widget.host.shadowRoot!;
    expect(root.querySelector('.status')?.hasAttribute('data-banner')).toBe(false);
    expect(root.querySelector('p[role="status"]')?.textContent).toBe('1 field filled');
    expect((root.querySelector('.undo') as HTMLButtonElement).hidden).toBe(false);
  } finally { widget.destroy(); }
});

it('announces direct widget errors without losing previous Undo', () => {
  const widget = new QuickFillWidget({ fill() {}, undo() {}, details() {}, hide() {}, disableSite() {}, settings() {}, position() {} });
  try {
    widget.render({ stage: 'completed', results: [{ noReview: 1, totalScanned: 1 }] } as never);
    widget.error('Could not open settings.');
    const root = widget.host.shadowRoot!;
    expect(root.querySelector('.status')?.hasAttribute('data-banner')).toBe(false);
    expect(root.querySelector('p[role="alert"]')?.textContent).toBe('Could not open settings.');
    expect((root.querySelector('.undo') as HTMLButtonElement).hidden).toBe(false);
  } finally { widget.destroy(); }
});

it.each([
  [1, '1 needs attention'],
  [2, '2 need attention'],
])('keeps filled counts separate from %i attention outcomes', (count, wording) => {
  const result = {
    stage: 'completed',
    results: [
      { totalScanned: 11 + Number(count), noReview: 11, noData: count, aiStatus: 'not_needed' },
    ],
  } as never;
  const summary = quickFillSummary(result);
  expect(summary.text).toBe(`11 filled, ${wording}`);
  expect(summary.attentionText).toBe(wording);
  const widget = new QuickFillWidget({
    fill() {},
    undo() {},
    details() {},
    hide() {},
    disableSite() {},
    settings() {},
    position() {},
  });
  widget.render(result);
  const message = widget.host.shadowRoot!.querySelector('[role="status"]')!;
  expect(message.textContent).toBe(`11 filled, ${wording}`);
  expect(message.querySelector('.attention')?.textContent).toBe(wording);
  expect(message.firstElementChild?.textContent).toBe('11 filled');
  widget.destroy();
});

it.each([
  ['existing answers kept', { totalScanned: 5, kept: 5 }, true],
  ['no fillable fields', { totalScanned: 0 }, true],
  ['no fields filled', { totalScanned: 1 }, true],
  ['unfilled field needing input', { totalScanned: 1, noData: 1 }, false],
])('shows details only when useful after %s', (_label, result, hidden) => {
  const widget = new QuickFillWidget({
    fill: vi.fn(),
    undo: vi.fn(),
    details: vi.fn(),
    hide: vi.fn(),
    disableSite: vi.fn(),
    settings: vi.fn(),
    position: vi.fn(),
  });
  const root = widget.host.shadowRoot!;
  // A later empty result must also clear details from a previous successful fill.
  widget.render({ stage: 'completed', results: [{ totalScanned: 1, noReview: 1 }] } as never);
  expect(root.querySelector<HTMLButtonElement>('.details')!.hidden).toBe(false);
  widget.render({ stage: 'completed', results: [result] } as never);
  expect(root.querySelector<HTMLButtonElement>('.details')!.hidden).toBe(hidden);
  expect(root.querySelector<HTMLButtonElement>('.undo')!.hidden).toBe(true);
  widget.destroy();
});

it.each(['merge', 'overwrite'] as const)('keeps confirmation quiet in %s mode', (fillMode) => {
  const widget = new QuickFillWidget({
    fill() {}, undo() {}, details() {}, hide() {}, disableSite() {}, settings() {}, position() {},
  });
  try {
    widget.preferences({ enabled: true, disabledSites: [], fillMode }, false);
    widget.render({ stage: 'confirming' } as never);
    const root = widget.host.shadowRoot!;
    expect(root.querySelector('.label')?.textContent).toBe('Fill Form');
    expect(root.querySelector<HTMLElement>('.status')?.hidden).toBe(true);
    expect(root.querySelector<HTMLButtonElement>('.fill')?.disabled).toBe(false);
  } finally { widget.destroy(); }
});

it('distinguishes starting and scanning from filling in the primary button', () => {
  const widget = new QuickFillWidget({
    fill() {},
    undo() {},
    details() {},
    hide() {},
    disableSite() {},
    settings() {},
    position() {},
  });
  try {
    const root = widget.host.shadowRoot!;
    const button = root.querySelector<HTMLButtonElement>('.fill')!;
    widget.render(null, true);
    expect(button.textContent).toContain('Scanning…');
    expect(button.disabled).toBe(true);
    widget.render({ stage: 'scanning' } as never);
    expect(button.textContent).toContain('Scanning…');
    expect(button.querySelector('.spin')).not.toBeNull();
    widget.render({ stage: 'filling' } as never);
    expect(button.textContent).toContain('Filling…');
    expect(button.disabled).toBe(true);
    widget.render(null);
    expect(button.textContent).toContain('Fill Form');
    expect(button.disabled).toBe(false);
    expect(button.querySelector('.spin')).toBeNull();
  } finally {
    widget.destroy();
  }
});
