// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { AddEntryButton } from './AddEntryButton';
import { FormField } from './FormField';
import { SaveButton } from './SaveButton';
import { RemoveButton } from './RemoveButton';

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

  it('shows "Saving..." and is disabled while saving', () => {
    render(<SaveButton onClick={vi.fn()} saving={true} label="Save Profile" />);
    const button = screen.getByText('Saving...') as HTMLButtonElement;
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
