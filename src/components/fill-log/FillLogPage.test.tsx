// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FillLogPage } from './FillLogPage';
import { loadFillLog, returnToForm } from '@/src/fill-log/client';
import type { FillLogField, FillLogSnapshot } from '@/src/autofill/fillLog';
import { createPreviewChrome } from '@/src/preview/chrome';
import { RETAINED_FILL_DETAILS } from '@/src/fill-log/retention';

vi.mock('@/src/fill-log/client', () => ({ loadFillLog: vi.fn(), returnToForm: vi.fn() }));

function snapshot(): FillLogSnapshot {
  const field = (id: string, label: string, extra: Partial<FillLogField> = {}): FillLogField => ({
    id,
    label,
    kind: 'text',
    outcome: 'high_confidence',
    source: 'rules',
    rule: {
      outcome: 'filled',
      layer: 'dictionary_exact',
      confidence: 0.9,
      profilePath: 'personal.firstName',
    },
    ai: { outcome: 'not_sent' },
    ...extra,
  });
  return {
    tabId: 10,
    frames: [
      {
        frameId: 0,
        log: {
          version: 1,
          runId: 'run',
          startedAt: 1,
          completedAt: 2,
          origin: 'https://example.test',
          status: 'completed',
          aiStatus: 'succeeded',
          fields: [
            field('field_001', 'Full name'),
            field('field_002', 'Summary', {
              outcome: 'review',
              source: 'ai',
              ai: { outcome: 'refined', confidence: 'low', profilePath: 'professional.summary' },
            }),
            field('field_003', 'Email', {
              outcome: 'kept',
              source: null,
              rule: { outcome: 'kept' },
            }),
            field('consent', 'Privacy consent', {
              outcome: 'excluded',
              source: null,
              reason: 'consent',
              kind: 'checkbox',
              rule: { outcome: 'not_applicable' },
            }),
          ],
        },
      },
      {
        frameId: 5,
        log: {
          version: 1,
          runId: 'run',
          startedAt: 1,
          completedAt: 2,
          origin: 'https://embedded.test',
          status: 'completed',
          aiStatus: 'succeeded',
          fields: [
            field('field_001', 'Location', {
              outcome: 'not_matched',
              source: null,
              rule: { outcome: 'not_matched' },
              ai: { outcome: 'no_response' },
            }),
            field('field_002', 'Resume', {
              outcome: 'failed',
              source: null,
              rule: { outcome: 'failed' },
              ai: { outcome: 'failed' },
            }),
            field('field_003', 'Pronouns', { outcome: 'manual', source: 'manual' }),
          ],
        },
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('chrome', createPreviewChrome({}));
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  vi.mocked(loadFillLog).mockResolvedValue(snapshot());
  vi.mocked(returnToForm).mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function showFields() {
  render(<FillLogPage tabId={10} />);
  await screen.findByRole('button', { name: 'All (7)' });
}
async function notify() {
  await act(
    async () =>
      new Promise<void>((resolve) =>
        chrome.storage.session.set({ [RETAINED_FILL_DETAILS]: { event: Math.random() } }, resolve),
      ),
  );
}

describe('Fill Details page', () => {
  it('shows one page with reconciled totals, colors, final sources and a separate AI handoff count', async () => {
    await showFields();
    const summary = screen.getByRole('region', { name: 'Fill summary' });
    for (const label of [
      'Detected (7)',
      'Filled (3)',
      'Not filled (2)',
      'Kept current (1)',
      'Skipped (1)',
    ])
      expect(within(summary).getByRole('button', { name: label })).toBeTruthy();
    for (const label of [
      'Green (2)',
      'Yellow (1)',
      'Red (2)',
      'Gray (0)',
      'Rules (1)',
      'AI (1)',
      'Manual (1)',
      'Sent to AI (3)',
    ])
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull();
    expect(screen.getByText('Full name').closest('details')?.open).toBe(false);
  });

  it('keeps core results collapsed and combines frame, control and per-type numbering in technical details', async () => {
    await showFields();
    const row = screen.getByText('Full name').closest('details')!;
    fireEvent.click(row.querySelector('summary')!);
    expect(row.open).toBe(true);
    expect(within(row).getByText('Main page: text_1')).toBeTruthy();
    expect(screen.getByText('Embedded frame 5: text_1')).toBeTruthy();
    expect(screen.queryByText('Field ID')).toBeNull();
    expect(screen.queryByText('Frame')).toBeNull();
    expect(screen.queryByText('0:field_001')).toBeNull();
    expect(within(row).getByText('Exact dictionary match')).toBeTruthy();
  });

  it('combines a selected outcome filter with searches over field titles', async () => {
    await showFields();
    fireEvent.click(screen.getByRole('button', { name: 'Red (2)' }));
    expect(screen.queryByText('Full name')).toBeNull();
    expect(screen.getByText('Location')).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'location' } });
    expect(screen.getByText('Location')).toBeTruthy();
    expect(screen.queryByText('Resume')).toBeNull();
    expect(screen.getByText('1 of 7 fields shown')).toBeTruthy();
  });

  it('shows kept and skipped reasons without counting them as unfilled', async () => {
    await showFields();
    fireEvent.click(screen.getByRole('button', { name: 'Skipped (1)' }));
    expect(screen.getByText('Privacy consent')).toBeTruthy();
    expect(screen.getByText('Consent is left for you to decide.')).toBeTruthy();
    expect(screen.queryByText('Location')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Kept current (1)' }));
    expect(screen.getByText('Email')).toBeTruthy();
    expect(screen.getByText('Kept your existing answer.')).toBeTruthy();
  });

  it('identifies learned fills separately and explains gray matches with readable profile names', async () => {
    const data = snapshot();
    data.frames[0].log.fields[0].rule.layer = 'learned';
    data.frames[0].log.fields.push({
      id: 'missing',
      label: 'Website',
      kind: 'text',
      source: null,
      outcome: 'missing_data',
      rule: { outcome: 'missing_data', layer: 'dictionary_exact', profilePath: 'links.linkedin' },
      ai: { outcome: 'not_sent' },
    });
    vi.mocked(loadFillLog).mockResolvedValue(data);
    render(<FillLogPage tabId={10} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Learned mappings (1)' }));
    expect(screen.getByText('Full name')).toBeTruthy();
    expect(screen.queryByText('Summary')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Gray (1)' }));
    expect(screen.getByText('Profile field: Links → LinkedIn')).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'links linkedin' } });
    expect(screen.getByText('Website')).toBeTruthy();
  });

  it('shows required markers, numeric rule scores and qualitative AI confidence without inventing percentages', async () => {
    const data = snapshot();
    data.frames[0].log.fields[0].required = true;
    vi.mocked(loadFillLog).mockResolvedValue(data);
    await showFields();
    const name = screen.getByText('Full name').closest('summary')!;
    expect(name.textContent).toContain('required');
    expect(name.textContent).toContain('90% match score');
    const ai = screen.getByText('Summary').closest('summary')!;
    expect(ai.textContent).toContain('AI');
    expect(ai.textContent).toContain('Needs review');
    expect(ai.textContent).not.toContain('%');
    const manual = screen.getByText('Pronouns').closest('summary')!;
    expect(manual.textContent).toContain('Confirmed by you');
    expect(manual.textContent).not.toContain('%');
  });

  it('preserves filters and search after an empty search result', async () => {
    await showFields();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'does not exist' } });
    expect(screen.getByText('No fields match this search or filter.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Return to Form' })).toBeTruthy();
  });

  it('keeps closed-form details with a neutral notice and no Return action', async () => {
    vi.mocked(loadFillLog).mockResolvedValue({ ...snapshot(), sourceClosed: true });
    await showFields();
    expect(screen.getByText('This form is closed. Showing its last fill details.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Return to Form' })).toBeNull();
  });

  it('returns to the report source after another form becomes selected', async () => {
    vi.mocked(loadFillLog).mockResolvedValue({ ...snapshot(), tabId: 20 });
    await showFields();
    fireEvent.click(screen.getByRole('button', { name: 'Return to Form' }));
    expect(returnToForm).toHaveBeenCalledWith(20);
  });

  it('reports return failures', async () => {
    vi.mocked(returnToForm).mockRejectedValueOnce(new Error('closed'));
    await showFields();
    fireEvent.click(screen.getByRole('button', { name: 'Return to Form' }));
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('Could not open the source form'),
    );
  });

  it('populates an already-open empty page on session updates without clicking View details', async () => {
    vi.mocked(loadFillLog).mockResolvedValue({ tabId: -1, frames: [] });
    render(<FillLogPage tabId={null} />);
    expect(await screen.findByText('No fill details yet')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Return to Form' })).toBeNull();
    vi.mocked(loadFillLog).mockResolvedValue(snapshot());
    await notify();
    expect(await screen.findByRole('button', { name: 'All (7)' })).toBeTruthy();
  });

  it('handles a closed source with no retained report', async () => {
    vi.mocked(loadFillLog).mockRejectedValue(new Error('closed'));
    render(<FillLogPage tabId={10} />);
    expect(await screen.findByText(/The source form is unavailable/)).toBeTruthy();
  });

  it('explains older scripts without incomplete zero totals', async () => {
    vi.mocked(loadFillLog).mockResolvedValue({ ...snapshot(), needsRefresh: true });
    render(<FillLogPage tabId={10} />);
    expect(await screen.findByText(/This form was filled with an earlier version/)).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Fill summary' })).toBeNull();
  });

  it('keeps AI failures and Undo visible with preserved results', async () => {
    const data = snapshot();
    data.frames.forEach((frame) => {
      frame.log.status = 'undone';
      frame.log.aiStatus = 'unavailable';
    });
    vi.mocked(loadFillLog).mockResolvedValue(data);
    await showFields();
    expect(screen.getByText(/AI assistance was unavailable for part or all/)).toBeTruthy();
    expect(screen.getByText(/These fills were undone/)).toBeTruthy();
  });

  it('keeps filled and modified times distinct and leaves filters intact during manual updates', async () => {
    vi.useFakeTimers();
    render(<FillLogPage tabId={10} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Red (2)' }));
    const data = snapshot();
    data.frames[1].log.fields[0].outcome = 'manual';
    data.frames[1].log.fields[0].source = 'manual';
    data.frames[1].log.modifiedAt = 2000;
    vi.mocked(loadFillLog).mockResolvedValue(data);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(screen.getByRole('button', { name: 'Red (1)' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.queryByText('Location')).toBeNull();
    expect(screen.getByText(/^Modified/)).toBeTruthy();
    expect(document.querySelectorAll('time')).toHaveLength(2);
  });
});
