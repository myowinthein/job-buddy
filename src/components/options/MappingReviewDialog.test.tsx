// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MappingReviewDialog } from './MappingReviewDialog';
import { getGeminiSettings } from '@/src/utils/storage';
import { reviewMappingsWithAI } from '@/src/resume-ai/gemini';
import { applyMappingReview } from '@/src/utils/learnedMappingReview';
import { RULE_PROFILE } from '@/src/autofill/ruleMatching.fixture';
import type { LearnedMappings } from '@/src/types/storage';
import type { MappingReviewItem } from '@/src/learned-mappings/review';
import { feedback } from '@/src/ui/feedback';

vi.mock('@/src/utils/storage', () => ({ getGeminiSettings: vi.fn() }));
vi.mock('@/src/resume-ai/gemini', () => ({ reviewMappingsWithAI: vi.fn() }));
vi.mock('@/src/utils/learnedMappingReview', () => ({ applyMappingReview: vi.fn() }));

function mappings(count = 2): LearnedMappings {
  const result: LearnedMappings = {};
  for (let index = 0; index < count; index++) {
    const site = index % 2 ? 'second.example' : 'first.example';
    result[site] ??= {};
    result[site][`salary${index}`] = {
      path: 'salary.current.amount',
      count: 2,
      label: `Expected salary ${index}`,
      question: `What is your expected salary for role ${index}?`,
    };
  }
  return result;
}

const assessment = (items: MappingReviewItem[]) => ({
  assessments: items.map((item) => ({
    id: item.id,
    verdict: 'change' as const,
    path: 'salary.expected.0.amount',
    reason: 'The question asks for expected salary.',
  })),
  model: 'gemini-3.8-flash' as const,
});

function pendingReview() {
  let resolve!: (value: ReturnType<typeof assessment>) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<ReturnType<typeof assessment>>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function open(data = mappings()) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const onGoToApiKey = vi.fn();
  return {
    ...render(
      <MappingReviewDialog
        profile={RULE_PROFILE}
        mappings={data}
        onClose={onClose}
        onSaved={onSaved}
        onGoToApiKey={onGoToApiKey}
      />,
    ),
    onClose,
    onSaved,
    onGoToApiKey,
  };
}

async function start() {
  const button = await screen.findByRole('button', { name: 'Analyze Mappings' });
  fireEvent.click(button);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('chrome', {
    storage: { onChanged: { addListener: vi.fn(), removeListener: vi.fn() } },
  });
  vi.mocked(getGeminiSettings).mockResolvedValue({
    apiKey: 'sample-key',
    model: 'gemini-3.8-flash',
    preference: 'auto',
    revision: 'sample',
    verifiedAt: 1,
  });
  vi.mocked(reviewMappingsWithAI).mockImplementation(async (_key, _model, items) =>
    assessment(items),
  );
  vi.mocked(applyMappingReview).mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('starts with a compact site picker and the review action in the footer', async () => {
  open();
  const button = await screen.findByRole('button', { name: 'Analyze Mappings' });
  expect(button.closest('footer')).not.toBeNull();
  expect(screen.getByRole('dialog').className).toContain('max-w-lg');
  expect(screen.getByRole('group', { name: 'Sites to review' })).toBeTruthy();
  expect(screen.getByRole('checkbox', { name: 'All sites' })).toHaveProperty('checked', true);
  expect(screen.getByText('2 of 2 selected')).toBeTruthy();
  expect(screen.queryByText(/Reviewed/)).toBeNull();
  expect(screen.queryByRole('button', { name: /Apply Changes/ })).toBeNull();
  expect(reviewMappingsWithAI).not.toHaveBeenCalled();
});

it('shows analysis separately and then opens results for explicit application', async () => {
  const pending = pendingReview();
  vi.mocked(reviewMappingsWithAI).mockReturnValueOnce(pending.promise);
  const view = open();
  await start();
  expect(await screen.findByRole('heading', { name: 'Analyzing Mappings' })).toBeTruthy();
  expect(screen.getByRole('dialog').className).toContain('max-w-sm');
  expect(screen.getByText('Reviewed 0 of 2 mappings.')).toBeTruthy();
  expect(screen.getByText('From 2 selected sites')).toBeTruthy();
  const header = screen.getByRole('heading', { name: 'Analyzing Mappings' }).closest('header');
  expect(header?.className).toContain('text-center');
  expect(header?.querySelector('p')).toBeNull();
  expect(header?.className).not.toContain('border-b');
  expect(screen.getByRole('button', { name: 'Cancel' }).closest('footer')?.className).not.toContain(
    'border-t',
  );
  expect(screen.queryByRole('group', { name: 'Sites to review' })).toBeNull();
  await waitFor(() => expect(reviewMappingsWithAI).toHaveBeenCalledTimes(1));
  const items = vi.mocked(reviewMappingsWithAI).mock.calls[0][2];
  await act(async () => pending.resolve(assessment(items)));
  expect(screen.getByRole('dialog').className).toContain('max-w-3xl');
  expect(screen.getByText('Reviewed 2 of 2 mappings.')).toBeTruthy();
  expect(screen.getAllByText('Better match found')).toHaveLength(2);
  expect(applyMappingReview).not.toHaveBeenCalled();
  let finishApply!: () => void;
  vi.mocked(applyMappingReview).mockReturnValueOnce(new Promise<void>((resolve) => {
    finishApply = resolve;
  }));
  fireEvent.click(screen.getByRole('button', { name: 'Apply Changes (2)' }));
  const applying = screen.getByRole('button', { name: 'Apply Changes (2)' });
  expect(applying).toHaveProperty('disabled', true);
  expect(applying.getAttribute('aria-busy')).toBe('true');
  expect(view.onSaved).not.toHaveBeenCalled();
  await act(async () => finishApply());
  await waitFor(() => expect(view.onSaved).toHaveBeenCalledTimes(1));
  expect(applyMappingReview).toHaveBeenCalledWith(
    RULE_PROFILE,
    expect.any(Object),
    items,
    Object.fromEntries(
      items.map((item) => [item.id, { action: 'change', path: 'salary.expected.0.amount' }]),
    ),
  );
});

it('retains mapping choices after a failed apply and retries without analyzing again', async () => {
  vi.mocked(applyMappingReview).mockRejectedValueOnce(new Error('synthetic storage failure'));
  const view = open();
  await start();
  await screen.findByRole('button', { name: 'Apply Changes (2)' });
  fireEvent.change(screen.getByLabelText('Action for Expected salary 0'), {
    target: { value: 'keep' },
  });
  const items = vi.mocked(reviewMappingsWithAI).mock.calls[0][2];
  const decisions = Object.fromEntries(items.map((item) => [
    item.id,
    item.domain === 'first.example'
      ? { action: 'keep' }
      : { action: 'change', path: 'salary.expected.0.amount' },
  ]));
  fireEvent.click(screen.getByRole('button', { name: 'Apply Changes (1)' }));

  expect(await screen.findByRole('alert')).toHaveProperty('textContent', feedback.sectionSaveFailed);
  expect(view.onSaved).not.toHaveBeenCalled();
  expect(view.onClose).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Action for Expected salary 0')).toHaveProperty('value', 'keep');
  expect(screen.getByText('Reviewed 2 of 2 mappings.')).toBeTruthy();
  const retry = screen.getByRole('button', { name: 'Apply Changes (1)' });
  expect(retry).toHaveProperty('disabled', false);
  expect(applyMappingReview).toHaveBeenCalledWith(RULE_PROFILE, expect.any(Object), items, decisions);

  fireEvent.click(retry);
  await waitFor(() => expect(view.onSaved).toHaveBeenCalledTimes(1));
  expect(applyMappingReview).toHaveBeenCalledTimes(2);
  expect(vi.mocked(applyMappingReview).mock.calls[1]).toEqual(
    vi.mocked(applyMappingReview).mock.calls[0],
  );
  expect(reviewMappingsWithAI).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('alert')).toBeNull();
  expect(view.onClose).not.toHaveBeenCalled();
});

it('reviews only selected sites', async () => {
  const pending = pendingReview();
  vi.mocked(reviewMappingsWithAI).mockReturnValueOnce(pending.promise);
  open();
  await screen.findByRole('button', { name: 'Analyze Mappings' });
  fireEvent.click(screen.getByRole('checkbox', { name: 'second.example' }));
  await start();
  expect(await screen.findByText('Reviewed 0 of 1 mapping.')).toBeTruthy();
  expect(screen.getByText('From 1 selected site')).toBeTruthy();
  await waitFor(() => expect(reviewMappingsWithAI).toHaveBeenCalledTimes(1));
  await act(async () =>
    pending.resolve(assessment(vi.mocked(reviewMappingsWithAI).mock.calls[0][2])),
  );
  await screen.findByText('Reviewed 1 of 1 mapping.');
  expect(
    vi
      .mocked(reviewMappingsWithAI)
      .mock.calls[0][2].every((item) => item.domain === 'first.example'),
  ).toBe(true);
});

it('preserves selections while searching and selects all sites across search results', async () => {
  open();
  const search = await screen.findByRole('searchbox', { name: 'Search sites' });
  const all = screen.getByRole('checkbox', { name: 'All sites' });
  fireEvent.click(all);
  expect(screen.getByText('0 of 2 selected')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Analyze Mappings' })).toHaveProperty('disabled', true);
  fireEvent.change(search, { target: { value: 'FIRST' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'first.example' }));
  fireEvent.change(search, { target: { value: 'second' } });
  expect(screen.getByText('1 of 2 selected')).toBeTruthy();
  expect(all).toHaveProperty('indeterminate', true);
  fireEvent.change(search, { target: { value: 'no-match' } });
  expect(screen.getByText('No sites found.')).toBeTruthy();
  fireEvent.click(all);
  fireEvent.change(search, { target: { value: '' } });
  expect(screen.getByRole('checkbox', { name: 'first.example' })).toHaveProperty('checked', true);
  expect(screen.getByRole('checkbox', { name: 'second.example' })).toHaveProperty('checked', true);
  expect(screen.getByText('2 of 2 selected')).toBeTruthy();
});

it('retains completed batches during a failure and retries only unfinished mappings', async () => {
  vi.mocked(reviewMappingsWithAI).mockImplementationOnce(async (_key, _model, items) =>
    assessment(items),
  );
  vi.mocked(reviewMappingsWithAI).mockRejectedValueOnce(new Error('Service unavailable.'));
  open(mappings(21));
  await start();
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Service unavailable.');
  expect(screen.getByRole('alert').className).toContain('border-amber-500');
  expect(screen.getByRole('progressbar').compareDocumentPosition(screen.getByRole('alert')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByText('Reviewed 20 of 21 mappings.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Review Completed' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Apply Changes/ })).toBeNull();
  const failed = vi.mocked(reviewMappingsWithAI).mock.calls[1][2];
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await screen.findByText('Reviewed 21 of 21 mappings.');
  expect(vi.mocked(reviewMappingsWithAI).mock.calls[2][2]).toEqual(failed);
});

it('allows applying completed findings after a partial failure', async () => {
  vi.mocked(reviewMappingsWithAI).mockImplementationOnce(async (_key, _model, items) =>
    assessment(items),
  );
  vi.mocked(reviewMappingsWithAI).mockRejectedValueOnce(new Error('Service unavailable.'));
  open(mappings(21));
  await start();
  fireEvent.click(await screen.findByRole('button', { name: 'Review Completed' }));
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByRole('button', { name: 'Apply Changes (20)' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Analyze Mappings' })).toBeNull();
});

it('cancels a request and starts fresh when reopened', async () => {
  const pending = pendingReview();
  vi.mocked(reviewMappingsWithAI).mockReturnValueOnce(pending.promise);
  const view = open();
  await start();
  await waitFor(() => expect(reviewMappingsWithAI).toHaveBeenCalledTimes(1));
  const args = vi.mocked(reviewMappingsWithAI).mock.calls[0];
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(args[4].aborted).toBe(true);
  expect(view.onClose).toHaveBeenCalledTimes(1);
  view.unmount();
  await act(async () => pending.resolve(assessment(args[2])));
  open();
  await screen.findByRole('group', { name: 'Sites to review' });
  expect(screen.queryByText(/Better match found|Reviewed/)).toBeNull();
  expect(applyMappingReview).not.toHaveBeenCalled();
  await start();
  await screen.findByRole('button', { name: 'Apply Changes (2)' });
  expect(reviewMappingsWithAI).toHaveBeenCalledTimes(2);
});

it('offers Done when no corrections are suggested', async () => {
  vi.mocked(reviewMappingsWithAI).mockImplementation(async (_key, _model, items) => ({
    ...assessment(items),
    assessments: items.map((item) => ({
      id: item.id,
      verdict: 'correct',
      path: null,
      reason: 'Matches.',
    })),
  }));
  const view = open();
  await start();
  const message = await screen.findByText('No changes suggested for the reviewed mappings.');
  expect(message.closest('[role=status]')!.className).toContain('border-green-500');
  expect(screen.queryByRole('button', { name: /Apply Changes/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  expect(view.onClose).toHaveBeenCalledTimes(1);
});

it('keeps missing-key guidance in setup and opens Settings', async () => {
  vi.mocked(getGeminiSettings).mockResolvedValue({
    apiKey: null,
    model: null,
    preference: 'auto',
    revision: null,
    verifiedAt: null,
  });
  const view = open();
  expect(await screen.findByText(feedback.mappingReviewKeyRequired)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Analyze Mappings' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Go to Settings/ }));
  expect(view.onGoToApiKey).toHaveBeenCalledTimes(1);
});

it.each([
  ['rate_limit', feedback.mappingReviewLimitFallback],
  ['timeout', feedback.mappingReviewTimeoutFallback],
  ['unavailable', feedback.mappingReviewUnavailableFallback],
] as const)(
  'shows the shared resume-style %s fallback while analysis is pending',
  async (reason, message) => {
    const pending = pendingReview();
    vi.mocked(reviewMappingsWithAI).mockImplementationOnce(
      (_key, _model, _items, _catalog, _signal, onAttempt) => {
        onAttempt?.('gemini-3.5-flash-lite', reason);
        return pending.promise;
      },
    );
    const view = open();
    await start();
    const notice = await screen.findByText(message);
    expect(screen.getByText(/Trying Gemini/).parentElement).toBe(notice.parentElement);
    expect(notice.parentElement!.className).toContain('text-xs');
    expect(notice.parentElement!.className).toContain('text-center');
    expect(notice.parentElement!.className).toContain('text-amber-700');
    expect(screen.queryByRole('alert')).toBeNull();
    view.unmount();
    await act(async () => pending.resolve(assessment([])));
  },
);

it('blocks stale results when profile data changes during analysis', async () => {
  const pending = pendingReview();
  vi.mocked(reviewMappingsWithAI).mockReturnValueOnce(pending.promise);
  const view = open();
  await start();
  await waitFor(() => expect(reviewMappingsWithAI).toHaveBeenCalledTimes(1));
  const args = vi.mocked(reviewMappingsWithAI).mock.calls[0];
  act(() =>
    vi
      .mocked(chrome.storage.onChanged.addListener)
      .mock.calls[0][0]({ learnedMappings: { newValue: {} } }, 'local'),
  );
  expect(args[4].aborted).toBe(true);
  expect(screen.getByRole('alert').textContent).toBe(feedback.mappingReviewChanged);
  expect(screen.getByRole('alert').className).toContain('border-amber-500');
  expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  view.unmount();
  await act(async () => pending.resolve(assessment(args[2])));
});

it('keeps all current mappings and restores suggestions across hidden and paginated findings', async () => {
  open(mappings(21));
  await start();
  const apply = await screen.findByRole('button', { name: 'Apply Changes (21)' });
  const suggestions = screen.getByRole('button', { name: 'Use Suggestions' });
  const keep = screen.getByRole('button', { name: 'Keep All Current' });
  expect(suggestions).toHaveProperty('disabled', true);
  expect(suggestions.closest('header')).not.toBeNull();
  fireEvent.click(keep);
  expect(screen.getByRole('button', { name: 'Apply Changes' })).toHaveProperty('disabled', true);
  expect(keep).toHaveProperty('disabled', true);
  expect(suggestions).toHaveProperty('disabled', false);
  fireEvent.click(suggestions);
  expect(apply).toHaveProperty('disabled', false);
  expect(suggestions).toHaveProperty('disabled', true);
  fireEvent.click(apply);
  await waitFor(() => expect(applyMappingReview).toHaveBeenCalledOnce());
  const decisions = vi.mocked(applyMappingReview).mock.calls[0][3];
  expect(Object.values(decisions)).toHaveLength(21);
  expect(
    Object.values(decisions).every(
      (choice) => choice.action === 'change' && choice.path === 'salary.expected.0.amount',
    ),
  ).toBe(true);
});

it('opens one site at a time and preserves choices while switching sites', async () => {
  open();
  await start();
  await screen.findByRole('button', { name: 'Apply Changes (2)' });
  const first = screen.getByRole('button', { name: 'first.example' });
  const second = screen.getByRole('button', { name: 'second.example' });
  expect(first.getAttribute('aria-expanded')).toBe('true');
  expect(second.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(second);
  expect(first.getAttribute('aria-expanded')).toBe('false');
  expect(second.getAttribute('aria-expanded')).toBe('true');
  fireEvent.change(screen.getByLabelText('Action for Expected salary 1'), {
    target: { value: 'keep' },
  });
  fireEvent.click(first);
  expect(second.getAttribute('aria-expanded')).toBe('false');
  expect(screen.getByRole('button', { name: 'Apply Changes (1)' })).toBeTruthy();
  fireEvent.click(second);
  expect(screen.getByLabelText('Action for Expected salary 1')).toHaveProperty('value', 'keep');
});

it('shows a gray spinner while AI settings load', () => {
  vi.mocked(getGeminiSettings).mockReturnValue(new Promise(() => {}));
  open();
  const message = screen.getByRole('status');
  expect(message.textContent).toBe('Loading AI settings…');
  expect(message.className).toContain('text-gray-500');
  expect(message.querySelector('.animate-spin')).not.toBeNull();
});

it('uses the shared error banner for settings failures with a working retry', async () => {
  vi.mocked(getGeminiSettings).mockRejectedValueOnce(new Error('storage failed'));
  open();
  const alert = await screen.findByRole('alert');
  expect(alert.className).toContain('border-red-500');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByRole('button', { name: 'Analyze Mappings' })).toBeTruthy();
});


it('shows a linked Gemini error above the review progress', async () => {
  vi.mocked(reviewMappingsWithAI).mockRejectedValueOnce(new Error('This key cannot access Gemini. Check its permissions in Google AI Studio.'));
  open();
  await start();
  const alert = await screen.findByRole('alert');
  expect(alert.closest('.review-dialog-body')?.firstElementChild).toBe(alert.parentElement);
  const link = alert.querySelector('a');
  expect(link?.getAttribute('href')).toBe('https://aistudio.google.com/api-keys');
  expect(link?.getAttribute('target')).toBe('_blank');
});
