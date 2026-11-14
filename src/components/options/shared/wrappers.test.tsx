// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { AddEntryButton } from './AddEntryButton';
import { FormField } from './FormField';
import { SaveButton } from './SaveButton';
import { RemoveButton } from './RemoveButton';
import { ConfirmRemoveButton } from './ConfirmRemoveButton';

afterEach(cleanup);

describe('AddEntryButton', () => {
  it('renders the given label and calls onClick', () => {
    const onClick = vi.fn();
    render(<AddEntryButton onClick={onClick} label="+ Add Entry" />);
    fireEvent.click(screen.getByText('+ Add Entry'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('defaults to the dashed variant class and switches to pill when requested', () => {
    const { rerender } = render(<AddEntryButton onClick={vi.fn()} label="Add" />);
    expect(screen.getByText('Add').className).toContain('border-dashed');

    rerender(<AddEntryButton onClick={vi.fn()} label="Add" variant="pill" />);
    expect(screen.getByText('Add').className).not.toContain('border-dashed');
  });
});

describe('FormField', () => {
  it('renders the label, required asterisk, and children', () => {
    render(<FormField label="Email" required><input /></FormField>);
    expect(screen.getByText('Email')).toBeTruthy();
    expect(screen.getByText('*')).toBeTruthy();
    expect(screen.getByRole('textbox')).toBeTruthy();
  });

  it('omits the asterisk when not required', () => {
    render(<FormField label="Nickname"><input /></FormField>);
    expect(screen.queryByText('*')).toBeNull();
  });

  it('shows the hint when there is no error', () => {
    render(<FormField label="Email" hint="We'll never share this"><input /></FormField>);
    expect(screen.getByText("We'll never share this")).toBeTruthy();
  });

  it('shows the error instead of the hint when both are present', () => {
    render(<FormField label="Email" hint="hint text" error="Invalid email"><input /></FormField>);
    expect(screen.getByText('Invalid email')).toBeTruthy();
    expect(screen.queryByText('hint text')).toBeNull();
  });
});

describe('SaveButton', () => {
  it('shows the label and is enabled when not saving', () => {
    const onClick = vi.fn();
    render(<SaveButton onClick={onClick} saving={false} label="Save Profile" />);
    const button = screen.getByText('Save Profile') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('shows "Saving…" and is disabled while saving', () => {
    render(<SaveButton onClick={vi.fn()} saving={true} label="Save Profile" />);
    const button = screen.getByText('Saving…') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.queryByText('Save Profile')).toBeNull();
  });
});

describe('RemoveButton', () => {
  it('defaults to "Remove" as both title and aria-label, and calls onClick', () => {
    const onClick = vi.fn();
    render(<RemoveButton onClick={onClick} />);
    const button = screen.getByTitle('Remove');
    expect(button.getAttribute('aria-label')).toBe('Remove');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('uses a custom title when provided', () => {
    render(<RemoveButton onClick={vi.fn()} title="Delete this learned input" />);
    expect(screen.getByTitle('Delete this learned input')).toBeTruthy();
  });
});

it('locks inline deletion while saving and restores its trigger after failure', () => {
  const remove = vi.fn();
  const view = render(<ConfirmRemoveButton title="Delete mapping" onConfirm={remove} />);
  fireEvent.click(screen.getByRole('button', { name: 'Delete mapping' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(remove).toHaveBeenCalledOnce();
  view.rerender(<ConfirmRemoveButton title="Delete mapping" onConfirm={remove} disabled busy />);
  const pending = screen.getByRole('button', { name: 'Deleting…' });
  expect(pending).toHaveProperty('disabled', true);
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveProperty('disabled', true);
  fireEvent.click(pending);
  fireEvent.mouseDown(document.body);
  expect(screen.getByRole('button', { name: 'Deleting…' })).toBeTruthy();
  expect(remove).toHaveBeenCalledOnce();
  view.rerender(<ConfirmRemoveButton title="Delete mapping" onConfirm={remove} />);
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Delete mapping' }));
});

it('keeps compact confirmation inline and returns focus after cancellation', async () => {
  const remove = vi.fn();
  render(<ConfirmRemoveButton compact onConfirm={remove} />);
  const trigger = screen.getByRole('button', { name: 'Remove entry' });
  fireEvent.click(trigger);
  expect(trigger.parentElement?.parentElement?.contains(screen.getByRole('button', { name: 'Cancel' }))).toBe(true);
  fireEvent.keyDown(screen.getByRole('button', { name: 'Cancel' }), { key: 'Escape' });
  await waitFor(() => expect(document.activeElement).toBe(trigger));
  expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();

  fireEvent.click(trigger);
  fireEvent.mouseDown(screen.getByRole('button', { name: 'Delete' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(remove).toHaveBeenCalledOnce();
  expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();

  fireEvent.click(trigger);
  fireEvent.mouseDown(document.body);
  expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
});
