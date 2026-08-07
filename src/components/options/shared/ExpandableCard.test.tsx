// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ExpandableCard } from './ExpandableCard';

afterEach(cleanup);

describe('ExpandableCard — expand/collapse', () => {
  it('starts collapsed by default, hiding children entirely', () => {
    render(<ExpandableCard summary="Acme Inc" onDelete={vi.fn()}><p>secret content</p></ExpandableCard>);
    expect(screen.queryByText('secret content')).toBeNull();
  });

  it('respects defaultExpanded=true, rendering children immediately', () => {
    render(<ExpandableCard summary="Acme Inc" onDelete={vi.fn()} defaultExpanded><p>secret content</p></ExpandableCard>);
    expect(screen.getByText('secret content')).toBeTruthy();
  });

  it('toggles children visibility when the summary is clicked', () => {
    render(<ExpandableCard summary="Acme Inc" onDelete={vi.fn()}><p>secret content</p></ExpandableCard>);
    fireEvent.click(screen.getByText('Acme Inc'));
    expect(screen.getByText('secret content')).toBeTruthy();
    fireEvent.click(screen.getByText('Acme Inc'));
    expect(screen.queryByText('secret content')).toBeNull();
  });

  it('renders the subtitle only when provided', () => {
    const { rerender } = render(<ExpandableCard summary="Acme Inc" subtitle="3 entries" onDelete={vi.fn()}><p>x</p></ExpandableCard>);
    expect(screen.getByText('3 entries')).toBeTruthy();
    rerender(<ExpandableCard summary="Acme Inc" onDelete={vi.fn()}><p>x</p></ExpandableCard>);
    expect(screen.queryByText('3 entries')).toBeNull();
  });
});

describe('ExpandableCard — delete confirmation gate', () => {
  it('requires a second click (Delete) before calling onDelete, and Cancel backs out without calling it', () => {
    const onDelete = vi.fn();
    render(<ExpandableCard summary="Acme Inc" onDelete={onDelete}><p>x</p></ExpandableCard>);

    fireEvent.click(screen.getByTitle('Remove entry'));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText('Delete')).toBeTruthy();

    fireEvent.click(screen.getByText('Cancel'));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByText('Delete')).toBeNull();
    expect(screen.getByTitle('Remove entry')).toBeTruthy();
  });

  it('calls onDelete when Delete is confirmed', () => {
    const onDelete = vi.fn();
    render(<ExpandableCard summary="Acme Inc" onDelete={onDelete}><p>x</p></ExpandableCard>);

    fireEvent.click(screen.getByTitle('Remove entry'));
    fireEvent.click(screen.getByText('Delete'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
