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
  const onDismiss = vi.fn();
  const view = render(
    <ImportSummaryDialog
      changes={changes}
      onAcceptAll={onAcceptAll}
      onRejectAll={onRejectAll}
      onReview={onReview}
      onDismiss={onDismiss}
      isProcessing={overrides.isProcessing}
    />,
  );
  return { onAcceptAll, onRejectAll, onReview, onDismiss, ...view };
}

describe('ImportSummaryDialog — counts and action buttons', () => {
  it('shows new/conflict/unchanged counts and wires each button', () => {
    const { onAcceptAll, onRejectAll, onReview } = renderDialog([change('new'), change('new'), change('conflict'), change('unchanged')]);

    expect(screen.getByText('2 New')).toBeTruthy();
    expect(screen.getByText('1 Changed')).toBeTruthy();
    expect(screen.getByText('1 Unchanged')).toBeTruthy();

    fireEvent.click(screen.getByText('Keep Current'));
    expect(onRejectAll).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Review Changes'));
    expect(onReview).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Import All'));
    expect(onAcceptAll).toHaveBeenCalledTimes(1);
  });

  it('pluralizes singular counts correctly', () => {
    renderDialog([change('new'), change('conflict')]);
    expect(screen.getByText('1 New')).toBeTruthy();
    expect(screen.getByText('1 Changed')).toBeTruthy();
  });

  it('hides Review/Import All when there is nothing actionable (only unchanged fields)', () => {
    renderDialog([change('unchanged')]);
    expect(screen.queryByText('Review Changes')).toBeNull();
    expect(screen.queryByText('Import All')).toBeNull();
    expect(screen.getByText('Done')).toBeTruthy();
  });

  it('shows "No Changes Found" when there is nothing at all', () => {
    renderDialog([]);
    expect(screen.getByText('No Changes Found')).toBeTruthy();
  });
});

describe('ImportSummaryDialog — isProcessing state', () => {
  it('disables all buttons and relabels Import All to "Saving…" while processing', () => {
    renderDialog([change('new')], { isProcessing: true });
    expect((screen.getByText('Keep Current') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByText('Saving…') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText('Import All')).toBeNull();
  });
});

describe('ImportSummaryDialog — backdrop and Escape dismissal (parity with ImportReviewScreen)', () => {
  it('calls onDismiss when the backdrop is clicked, but not when the dialog body is clicked', () => {
    const { onAcceptAll, onRejectAll, onDismiss } = renderDialog([change('new')]);
    fireEvent.click(screen.getByText('Import All'));
    expect(onAcceptAll).toHaveBeenCalledTimes(1);
    expect(onRejectAll).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Import All').closest('.fixed')!);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onRejectAll).not.toHaveBeenCalled();
  });

  it('calls onDismiss on Escape', () => {
    const { onRejectAll, onDismiss } = renderDialog([change('new')]);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onRejectAll).not.toHaveBeenCalled();
  });

  it('ignores Escape while isProcessing is true, same as the backdrop click', () => {
    const { onRejectAll, onDismiss } = renderDialog([change('new')], { isProcessing: true });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onRejectAll).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Saving…').closest('.fixed')!);
    expect(onRejectAll).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

 it('moves focus into the dialog, traps Tab, and restores its opener', () => {
  render(<button>Choose File</button>);
  const opener = screen.getByText('Choose File');
  opener.focus();
  const view = renderDialog([change('new')]);
  const dialog = screen.getByRole('dialog');
  expect(document.activeElement).toBe(dialog);
  fireEvent.keyDown(dialog, {key:'Tab'});
  expect(document.activeElement).toBe(screen.getByText('Keep Current'));
  fireEvent.keyDown(document.activeElement!, {key:'Tab',shiftKey:true});
  expect(document.activeElement).toBe(screen.getByText('Import All'));
  view.unmount();
  expect(document.activeElement).toBe(opener);
});

it.each(['new', 'conflict'] as const)('shows only nonzero statuses for %s details', (status) => {
  renderDialog([change(status)]);
  expect(screen.getByText(status === 'new' ? '1 New' : '1 Changed')).toBeTruthy();
  expect(screen.queryByText(/0 (New|Changed|Unchanged)/)).toBeNull();
  expect(screen.queryByText(status === 'new' ? /Changed/ : /New/)).toBeNull();
  expect(screen.queryByText(/Unchanged/)).toBeNull();
});
