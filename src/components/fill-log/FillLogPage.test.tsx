// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FillLogPage } from './FillLogPage';
import { loadFillLog, returnToForm } from '@/src/fill-log/client';
import type { FillLogField, FillLogSnapshot } from '@/src/autofill/fillLog';

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
  vi.mocked(loadFillLog).mockResolvedValue(snapshot());
  vi.mocked(returnToForm).mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
async function showFields() {
  render(<FillLogPage tabId={10} />);
  fireEvent.click(await screen.findByRole('tab', { name: 'Fields' }));
}

describe('Fill Details page', () => {
  it('shows all-frame totals and explains overlapping rule and AI stages', async () => {
    render(<FillLogPage tabId={10} />);
    const overview = await screen.findByRole('tabpanel', { name: 'Overview' });
    expect(within(overview).getByText('7')).toBeTruthy();
    expect(within(overview).getByText('Refined by AI')).toBeTruthy();
    expect(within(overview).getByText(/Processing-stage counts can overlap/)).toBeTruthy();
    expect(screen.getByText('https://example.test', { selector: 'header span' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull();
  });

  it('shows fields from multiple frames with stable qualified IDs', async () => {
    await showFields();
    expect(screen.getByText('Full name')).toBeTruthy();
    expect(screen.getByText('Location')).toBeTruthy();
    expect(screen.getByText('0:field_001')).toBeTruthy();
    expect(screen.getByText('5:field_001')).toBeTruthy();
    expect(screen.getByText('No response for this field')).toBeTruthy();
  });

  it('filters attention items and searches field names', async () => {
    await showFields();
    fireEvent.click(screen.getByRole('button', { name: 'Needs attention (3)' }));
    expect(screen.queryByText('Full name')).toBeNull();
    expect(screen.getByText('Summary')).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'location' } });
    expect(screen.getByText('Location')).toBeTruthy();
    expect(screen.queryByText('Summary')).toBeNull();
    expect(screen.getByText('1 field shown')).toBeTruthy();
  });

  it('keeps existing and consent answers out of the attention filter', async () => {
    await showFields();
    fireEvent.click(screen.getByRole('button', { name: 'Excluded (1)' }));
    expect(screen.getByText('Privacy consent')).toBeTruthy();
    expect(screen.getByText('Consent is left for you to decide.')).toBeTruthy();
    expect(screen.queryByText('Location')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Kept current (1)' }));
    expect(screen.getByText('Email')).toBeTruthy();
    expect(screen.queryByText('Privacy consent')).toBeNull();
  });

  it('shows an empty search result without losing the source log', async () => {
    await showFields();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'does not exist' } });
    expect(screen.getByText('No fields match this search or filter.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Return to Form' })).toBeTruthy();
  });

  it('keeps closed-form details visible with a neutral notice and no Return to Form action', async () => {
    vi.mocked(loadFillLog).mockResolvedValue({ ...snapshot(), sourceClosed: true });
    await showFields();
    expect(screen.getByText('This form is closed. Showing its last fill details.')).toBeTruthy();
    expect(screen.getByText('Full name')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Return to Form' })).toBeNull();
  });

  it('supports keyboard tab navigation', async () => {
    render(<FillLogPage tabId={10} />);
    const overview = await screen.findByRole('tab', { name: 'Overview' });
    fireEvent.keyDown(overview, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Fields' }));
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(overview.getAttribute('aria-selected')).toBe('true');
  });

  it('uses the original source when returning to the form', async () => {
    render(<FillLogPage tabId={10} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Return to Form' }));
    expect(returnToForm).toHaveBeenCalledWith(10);
  });

  it('reports return failures', async () => {
    vi.mocked(returnToForm).mockRejectedValueOnce(new Error('closed'));
    render(<FillLogPage tabId={10} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Return to Form' }));
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('Could not open the source form'),
    );
  });

  it('shows a clear empty state after the source reloads', async () => {
    vi.mocked(loadFillLog).mockResolvedValue({ tabId: 10, frames: [] });
    render(<FillLogPage tabId={10} />);
    expect(await screen.findByText(/No fill details are available yet/)).toBeTruthy();
  });

  it('handles closed source tabs', async () => {
    vi.mocked(loadFillLog).mockRejectedValue(new Error('closed'));
    render(<FillLogPage tabId={10} />);
    expect(await screen.findByText(/The source form is unavailable/)).toBeTruthy();
  });

  it('explains an older form script instead of presenting incomplete zero totals', async () => {
    vi.mocked(loadFillLog).mockResolvedValue({ ...snapshot(), needsRefresh: true });
    render(<FillLogPage tabId={10} />);
    expect(await screen.findByText(/This form was filled with an earlier version/)).toBeTruthy();
    expect(screen.queryByText('Detected')).toBeNull();
    expect(screen.getByRole('button', { name: 'Return to Form' })).toBeTruthy();
  });

  it('does not query an unrelated active tab without a source ID', () => {
    render(<FillLogPage tabId={null} />);
    expect(loadFillLog).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Return to Form' })).toBeNull();
  });

  it('keeps AI-failure feedback visible with preserved results', async () => {
    const data = snapshot();
    data.frames[0].log.aiStatus = 'unavailable';
    vi.mocked(loadFillLog).mockResolvedValue(data);
    render(<FillLogPage tabId={10} />);
    expect(await screen.findByText(/AI assistance was unavailable for part or all/)).toBeTruthy();
    expect(screen.getByText('Filled by rules')).toBeTruthy();
  });

  it('marks an undone run without claiming its values are still on the page', async () => {
    const data = snapshot();
    data.frames.forEach((frame) => {
      frame.log.status = 'undone';
    });
    vi.mocked(loadFillLog).mockResolvedValue(data);
    render(<FillLogPage tabId={10} />);
    expect(await screen.findByText(/These fills were undone/)).toBeTruthy();
  });

  it('refreshes final outcomes without losing field filters', async () => {
    vi.useFakeTimers();
    render(<FillLogPage tabId={10} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Fields' }));
    fireEvent.click(screen.getByRole('button', { name: 'Needs attention (3)' }));
    const data = snapshot();
    data.frames[1].log.fields[0].outcome = 'manual';
    vi.mocked(loadFillLog).mockResolvedValue(data);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(
      screen.getByRole('button', { name: 'Needs attention (2)' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(screen.queryByText('Location')).toBeNull();
  });
});
