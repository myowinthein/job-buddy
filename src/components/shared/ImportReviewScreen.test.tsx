// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ImportReviewScreen from './ImportReviewScreen';
import type { FieldChange } from '@/src/resume-ai/types';

afterEach(cleanup);

function newField(id: string, label: string, accepted = false): FieldChange {
  return {
    id, label, section: 'Personal',
    currentValue: null, suggestedValue: 'x',
    displayCurrent: '', displaySuggested: `suggested-${id}`,
    status: 'new', accepted,
  };
}

function conflictField(id: string, accepted = false): FieldChange {
  return {
    id, label: `Field ${id}`, section: 'Personal',
    currentValue: 'old', suggestedValue: 'new',
    displayCurrent: `current-${id}`, displaySuggested: `suggested-${id}`,
    status: 'conflict', accepted,
  };
}

function unchangedField(id: string): FieldChange {
  return {
    id, label: `Field ${id}`, section: 'Personal',
    currentValue: 'same', suggestedValue: 'same',
    displayCurrent: 'same', displaySuggested: 'same',
    status: 'unchanged', accepted: false,
  };
}

function renderScreen(changes: FieldChange[], overrides: Partial<{ isSaving: boolean }> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onBack = vi.fn();
  render(
    <ImportReviewScreen
      changes={changes}
      onSave={onSave}
      onBack={onBack}
      isSaving={overrides.isSaving}
    />,
  );
  return { onSave, onBack };
}

describe('ImportReviewScreen — accept-all new fields', () => {
  it('accepts every "new" field without touching conflicts', () => {
    const { onSave } = renderScreen([
      newField('a', 'First Name', false),
      newField('b', 'Last Name', false),
      conflictField('c', false),
    ]);

    fireEvent.click(screen.getByText('Accept All New Fields'));
    fireEvent.click(screen.getByText('Save Selected'));

    const saved = onSave.mock.calls[0][0] as FieldChange[];
    expect(saved.find((c) => c.id === 'a')?.accepted).toBe(true);
    expect(saved.find((c) => c.id === 'b')?.accepted).toBe(true);
    expect(saved.find((c) => c.id === 'c')?.accepted).toBe(false); // conflict untouched
  });

  it('hides the Accept All button when there are no new fields', () => {
    renderScreen([conflictField('c')]);
    expect(screen.queryByText('Accept All New Fields')).toBeNull();
  });
});

describe('ImportReviewScreen — individual toggle for new fields', () => {
  it('toggles a single new field\'s accepted state via its checkbox', () => {
    const { onSave } = renderScreen([newField('a', 'First Name', false)]);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByText('Save Selected'));

    const saved = onSave.mock.calls[0][0] as FieldChange[];
    expect(saved[0].accepted).toBe(true);
  });
});

describe('ImportReviewScreen — conflict resolution radios', () => {
  it('defaults conflict radios to match each field\'s current accepted state', () => {
    renderScreen([conflictField('c', false)]);
    const [keepCurrent, useSuggested] = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(keepCurrent.checked).toBe(true);
    expect(useSuggested.checked).toBe(false);
  });

  it('choosing "Use suggested" sets accepted true; "Keep current" sets it false', () => {
    const { onSave } = renderScreen([conflictField('c', false)]);
    const [keepCurrent, useSuggested] = screen.getAllByRole('radio');

    fireEvent.click(useSuggested);
    fireEvent.click(screen.getByText('Save Selected'));
    expect((onSave.mock.calls[0][0] as FieldChange[])[0].accepted).toBe(true);

    onSave.mockClear();
    fireEvent.click(keepCurrent);
    fireEvent.click(screen.getByText('Save Selected'));
    expect((onSave.mock.calls[0][0] as FieldChange[])[0].accepted).toBe(false);
  });
});

describe('ImportReviewScreen — section grouping and empty state', () => {
  it('omits unchanged fields from display and hides sections with only unchanged fields', () => {
    renderScreen([unchangedField('a'), newField('b', 'Last Name')]);
    expect(screen.queryByText('Field a')).toBeNull();
    expect(screen.getByText('Last Name')).toBeTruthy();
  });

  it('shows "No changes to review." when every field is unchanged', () => {
    renderScreen([unchangedField('a'), unchangedField('b')]);
    expect(screen.getByText('No changes to review.')).toBeTruthy();
  });

  it('shows New/Conflicts counts in the header badge', () => {
    renderScreen([newField('a', 'A'), newField('b', 'B'), conflictField('c')]);
    expect(screen.getByText('New 2')).toBeTruthy();
    expect(screen.getByText('Conflicts 1')).toBeTruthy();
  });
});

describe('ImportReviewScreen — backdrop and saving state', () => {
  it('calls onBack when the backdrop is clicked, but not when the dialog body is clicked', () => {
    const { onBack } = renderScreen([newField('a', 'A')]);
    fireEvent.click(screen.getByText('Save Selected'));
    expect(onBack).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Save Selected').closest('.fixed')!);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('disables Back/Save and shows "Saving…" while isSaving is true', () => {
    renderScreen([newField('a', 'A')], { isSaving: true });
    expect((screen.getByText('Back') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Saving…')).toBeTruthy();
    expect((screen.getByText('Saving…').closest('button') as HTMLButtonElement).disabled).toBe(true);
  });
});
