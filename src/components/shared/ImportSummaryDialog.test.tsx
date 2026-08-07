// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ImportSummaryDialog from './ImportSummaryDialog';
import type { FieldChange } from '@/src/resume-ai/types';

afterEach(cleanup);

function change(status: FieldChange['status']): FieldChange {
  return {
    id: status, label: 'x', section: 'Personal',
    currentValue: null, suggestedValue: 'y',
    displayCurrent: '', displaySuggested: 'y',
    status, accepted: false,
  };
}

function renderDialog(changes: FieldChange[], overrides: Partial<{ isProcessing: boolean }> = {}) {
  const onAcceptAll = vi.fn();
  const onRejectAll = vi.fn();
  const onReview = vi.fn();
  render(
    <ImportSummaryDialog
      changes={changes}
      onAcceptAll={onAcceptAll}
      onRejectAll={onRejectAll}
      onReview={onReview}
      isProcessing={overrides.isProcessing}
    />,
  );
  return { onAcceptAll, onRejectAll, onReview };
}

describe('ImportSummaryDialog — counts and action buttons', () => {
  it('shows new/conflict/unchanged counts and wires each button', () => {
    const { onAcceptAll, onRejectAll, onReview } = renderDialog([change('new'), change('new'), change('conflict'), change('unchanged')]);

    expect(screen.getByText('2 new')).toBeTruthy();
    expect(screen.getByText('1 conflict')).toBeTruthy();
    expect(screen.getByText('1 match')).toBeTruthy();

    fireEvent.click(screen.getByText('Keep Current'));
    expect(onRejectAll).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Review →'));
    expect(onReview).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Accept All'));
    expect(onAcceptAll).toHaveBeenCalledTimes(1);
  });

  it('pluralizes singular counts correctly', () => {
    renderDialog([change('new'), change('conflict')]);
    expect(screen.getByText('1 new')).toBeTruthy();
    expect(screen.getByText('1 conflict')).toBeTruthy();
  });

  it('hides Review/Accept All when there is nothing actionable (only unchanged fields)', () => {
    renderDialog([change('unchanged')]);
    expect(screen.queryByText('Review →')).toBeNull();
    expect(screen.queryByText('Accept All')).toBeNull();
    expect(screen.getByText('Keep Current')).toBeTruthy(); // always present
  });

  it('shows "No changes found." when there is nothing at all', () => {
    renderDialog([]);
    expect(screen.getByText('No changes found.')).toBeTruthy();
  });
});

describe('ImportSummaryDialog — isProcessing state', () => {
  it('disables all buttons and relabels Accept All to "Saving…" while processing', () => {
    renderDialog([change('new')], { isProcessing: true });
    expect((screen.getByText('Keep Current') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByText('Saving…') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText('Accept All')).toBeNull();
  });
});
