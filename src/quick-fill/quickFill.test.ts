// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { likelyApplicationForm } from './detect';
import { normalizePreferences } from './preferences';
import { quickFillSenderTab } from './background';
import { quickFillSummary } from './status';
import { scanFields, scanAriaFields } from '@/src/autofill/scanner';
import { QuickFillWidget } from './widget';

beforeEach(() => {
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
  expect(normalizePreferences(undefined)).toEqual({ enabled: true, disabledSites: [] });
  expect(
    normalizePreferences({
      enabled: false,
      disabledSites: ['example.test', 2, 'example.test'],
      position: { x: 99, y: -1 },
    }),
  ).toEqual({ enabled: false, disabledSites: ['example.test'], position: { x: 1, y: 0 } });
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
