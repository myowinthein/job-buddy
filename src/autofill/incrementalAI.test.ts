// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { geminiSeededChrome } from '../testing/geminiChrome';
import { RULE_PROFILE } from './ruleMatching.fixture';
import { runAIAutofill } from './ai';
import { extractSignals } from './signals';
import { resetWriteSession } from './writeSession';
import type { FillLogField } from './fillLog';
import type { AIFieldResponse } from '../resume-ai/types';

const reply = (answers: AIFieldResponse[]) => ({
  ok: true,
  status: 200,
  json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(answers) }] } }] }),
});
beforeEach(() => {
  resetWriteSession();
  vi.stubGlobal('chrome', geminiSeededChrome(RULE_PROFILE));
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 100,
    height: 30,
  } as DOMRect);
  document.body.innerHTML = `<form>${Array.from({ length: 21 }, (_, i) => `<div><label for="q${i}">Applicant detail ${i + 1}</label><input id="q${i}"></div>`).join('')}</form>`;
});
afterEach(() => {
  resetWriteSession();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

function setup() {
  const elements = [...document.querySelectorAll('input')];
  const records = new Map(
    elements.map((element, i): [HTMLElement, FillLogField] => [
      element,
      {
        id: `field_${i + 1}`,
        label: `Applicant detail ${i + 1}`,
        kind: 'text',
        rule: { outcome: 'not_matched' },
        ai: { outcome: 'not_sent' },
        outcome: 'not_matched',
        source: null,
      },
    ]),
  );
  const candidates = elements.map((element) => ({
    type: 'text' as const,
    element,
    signals: extractSignals(element),
    originalState: 'lowConfidence' as const,
  }));
  const response = (fieldId: string): AIFieldResponse[] => [
    { fieldId, profilePath: 'personal.firstName', confidence: 'high' },
  ];
  let finish!: (value: ReturnType<typeof reply>) => void;
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(reply(response('field_001')))
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
  vi.stubGlobal('fetch', fetchMock);
  return {
    elements,
    records,
    candidates,
    fetchMock,
    finish: () => finish(reply(response('field_021'))),
  };
}

it('writes a completed batch immediately and keeps a manual edit made before the later response', async () => {
  const { elements, records, candidates, fetchMock, finish } = setup();
  const written = vi.fn();
  const pending = runAIAutofill(
    candidates,
    RULE_PROFILE,
    { noReview: 0, needReview: 0, lowConfidence: 21, noData: 0 },
    [],
    { fieldRecords: records, onTextFilled: written },
  );
  await vi.waitFor(() => expect(elements[0].value).toBe(RULE_PROFILE.personal.firstName));
  await vi.waitFor(() => expect(records.get(elements[0])?.source).toBe('ai'));
  expect(fetchMock).toHaveBeenCalledTimes(2);
  elements[20].value = 'Manual answer';
  finish();
  await pending;
  expect(elements[20].value).toBe('Manual answer');
  expect(records.get(elements[0])?.source).toBe('ai');
  expect(records.get(elements[20])?.source).toBe('manual');
  expect(written).toHaveBeenCalledOnce();
});

it('keeps an accepted batch and its record when cancellation aborts a later request', async () => {
  const { elements, records, candidates } = setup();
  const controller = new AbortController();
  const pending = runAIAutofill(
    candidates,
    RULE_PROFILE,
    { noReview: 0, needReview: 0, lowConfidence: 21, noData: 0 },
    [],
    { fieldRecords: records, signal: controller.signal },
  );
  await vi.waitFor(() => expect(elements[0].value).toBe(RULE_PROFILE.personal.firstName));
  await vi.waitFor(() => expect(records.get(elements[0])?.source).toBe('ai'));
  controller.abort();
  await pending;
  expect(records.get(elements[0])).toMatchObject({ source: 'ai', ai: { outcome: 'filled' } });
  expect(records.get(elements[20])?.ai).toMatchObject({
    outcome: 'skipped',
    skipReason: 'cancelled',
  });
  expect(elements[20].value).toBe('');
});
