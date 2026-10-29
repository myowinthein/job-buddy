// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
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

describe('ImportReviewScreen — multiline value rendering', () => {
  it('preserves multiline prose without adding bullet points', () => {
    const field = newField('summary', 'Career Summary');
    field.displaySuggested = 'Led the platform team.\nShipped three major releases.\nMentored junior engineers.';
    renderScreen([field]);

    expect(screen.getByText(/Led the platform team/).tagName).toBe('P');
    expect(screen.getByText(/Led the platform team/).textContent).toBe(field.displaySuggested);
  });

  it('renders a single-line value as a plain paragraph, not a one-item list', () => {
    const field = newField('summary', 'Career Summary');
    field.displaySuggested = 'A one-line summary.';
    renderScreen([field]);
    expect(screen.getByText('A one-line summary.').tagName).toBe('P');
  });
});

describe('ImportReviewScreen — accept-all new fields', () => {
  it('selects new and changed details together', () => {
    const { onSave } = renderScreen([
      newField('a', 'First Name', false),
      newField('b', 'Last Name', false),
      conflictField('c', false),
    ]);

    fireEvent.click(screen.getByText('Select All'));
    fireEvent.click(screen.getByRole('button', {name:/^Import Selected/}));

    const saved = onSave.mock.calls[0][0] as FieldChange[];
    expect(saved.find((c) => c.id === 'a')?.accepted).toBe(true);
    expect(saved.find((c) => c.id === 'b')?.accepted).toBe(true);
    expect(saved.find((c) => c.id === 'c')?.accepted).toBe(true);
  });

  it('offers bulk selection when only changed details exist', () => {
    renderScreen([conflictField('c')]);
    expect(screen.getByText('Select All')).toBeTruthy();
    expect(screen.getByText('Clear Selection')).toBeTruthy();
  });
});

describe('ImportReviewScreen — individual toggle for new fields', () => {
  it('toggles a single new field\'s accepted state via its checkbox', () => {
    const { onSave } = renderScreen([newField('a', 'First Name', false)]);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', {name:/^Import Selected/}));

    const saved = onSave.mock.calls[0][0] as FieldChange[];
    expect(saved[0].accepted).toBe(true);
  });
});

describe('ImportReviewScreen — conflict resolution radios', () => {
  it('defaults conflict radios to match each field\'s current accepted state', () => {
    renderScreen([conflictField('c', false)]);
    const [useSuggested, keepCurrent] = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(keepCurrent.checked).toBe(true);
    expect(useSuggested.checked).toBe(false);
  });

  it('choosing "Use suggested" sets accepted true; "Keep current" sets it false', () => {
    const { onSave } = renderScreen([conflictField('c', false)]);
    const [useSuggested, keepCurrent] = screen.getAllByRole('radio');

    fireEvent.click(useSuggested);
    fireEvent.click(screen.getByRole('button', {name:/^Import Selected/}));
    expect((onSave.mock.calls[0][0] as FieldChange[])[0].accepted).toBe(true);

    onSave.mockClear();
    fireEvent.click(keepCurrent);
    fireEvent.click(screen.getByRole('button', {name:/^Import Selected/}));
    expect(onSave).not.toHaveBeenCalled();
    expect((screen.getByRole('button', {name:/^Import Selected/}) as HTMLButtonElement).disabled).toBe(true);
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
    expect(screen.getByText('0 of 3 selected')).toBeTruthy();
    expect(screen.getAllByText('New')).toHaveLength(2);
    expect(screen.getByText('Changed')).toBeTruthy();
  });
});

describe('ImportReviewScreen — backdrop and saving state', () => {
  it('calls onBack when the backdrop is clicked, but not when the dialog body is clicked', () => {
    const { onBack } = renderScreen([newField('a', 'A')]);
    fireEvent.click(screen.getByRole('button', {name:/^Import Selected/}));
    expect(onBack).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', {name:/^Import Selected/}).closest('.fixed')!);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('disables Back/Save and shows "Saving…" while isSaving is true', () => {
    renderScreen([newField('a', 'A')], { isSaving: true });
    expect((screen.getByText('Back') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Saving…')).toBeTruthy();
    expect((screen.getByText('Saving…').closest('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('calls onBack on Escape', () => {
    const { onBack } = renderScreen([newField('a', 'A')]);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('ignores Escape while isSaving is true, same as the backdrop click', () => {
    const { onBack } = renderScreen([newField('a', 'A')], { isSaving: true });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onBack).not.toHaveBeenCalled();
  });
});


describe('ImportReviewScreen — save isolation', () => {
  it('blocks header close and freezes choices while saving, then allows dismissal afterward', () => {
    const onBack = vi.fn();
    const onSave = vi.fn();
    const changes = [newField('a', 'A'), conflictField('b')];
    const view = render(<ImportReviewScreen changes={changes} onSave={onSave} onBack={onBack} isSaving />);
    fireEvent.click(screen.getByText('×'));
    expect(onBack).not.toHaveBeenCalled();
    expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(true);
    for (const radio of screen.getAllByRole('radio')) expect((radio as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByText('Select All') as HTMLButtonElement).disabled).toBe(true);
    view.rerender(<ImportReviewScreen changes={changes} onSave={onSave} onBack={onBack} isSaving={false} />);
    fireEvent.click(screen.getByText('×'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

it('shows legacy professional fields and any future section instead of hiding selected changes', () => {
  const legacy = {...newField('summary','Career Summary'),section:'Professional'};
  const future = {...newField('future','Future detail'),section:'Future Section'};
  renderScreen([legacy,future]);
  expect(screen.getByRole('heading',{name:/^Work History/})).toBeTruthy();
  expect(screen.getByText('Career Summary')).toBeTruthy();
  expect(screen.getByRole('heading',{name:/^Future Section/})).toBeTruthy();
  expect(screen.queryByText('Future detail')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Future Section' }));
  expect(screen.getByText('Future detail')).toBeTruthy();
  expect(screen.queryByText('Career Summary')).toBeNull();
});

 it('shows one section at a time and preserves choices across sections and bulk actions', () => {
  const { onSave } = renderScreen([
    conflictField('name'),
    {...conflictField('summary'), section: 'Work History'},
  ]);
  expect(screen.getByRole('button', {name: 'Personal'}).getAttribute('aria-expanded')).toBe('true');
  expect(screen.queryByRole('group', {name: 'Field summary'})).toBeNull();
  fireEvent.click(screen.getByText('Select All'));
  fireEvent.click(screen.getByRole('button', {name: 'Work History'}));
  expect(screen.queryByRole('group', {name: 'Field name'})).toBeNull();
  fireEvent.click(screen.getByRole('radio', {name: /^Keep Current/}));
  fireEvent.click(screen.getByRole('button', {name: 'Personal'}));
  expect((screen.getByRole('radio', {name: /^Imported/}) as HTMLInputElement).checked).toBe(true);
  expect(screen.getByText('1 of 2 selected')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', {name: /^Import Selected/}));
  expect(onSave.mock.calls[0][0].map((change: FieldChange) => change.accepted)).toEqual([true,false]);
});

it('shows complete incoming and current values in reading order', () => {
  renderScreen([conflictField('summary', true)]);
  const group = screen.getByRole('group', {name: 'Field summary'});
  const choices = within(group).getAllByRole('radio');
  expect(choices[0].closest('label')!.textContent).toBe('Importedsuggested-summary');
  expect(choices[1].closest('label')!.textContent).toBe('Keep Currentcurrent-summary');
});
