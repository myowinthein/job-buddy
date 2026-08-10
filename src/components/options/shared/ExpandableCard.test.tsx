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

  it('defaults the content wrapper to p-4 when contentClassName is not given', () => {
    render(<ExpandableCard summary="Acme Inc" onDelete={vi.fn()} defaultExpanded><p>x</p></ExpandableCard>);
    expect(screen.getByText('x').parentElement?.className).toContain('p-4');
  });

  it('uses contentClassName to override the content wrapper padding when given', () => {
    render(<ExpandableCard summary="Acme Inc" onDelete={vi.fn()} defaultExpanded contentClassName="p-2"><p>x</p></ExpandableCard>);
    const wrapper = screen.getByText('x').parentElement;
    expect(wrapper?.className).toContain('p-2');
    expect(wrapper?.className).not.toContain('p-4');
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

  it('disarms the confirmation on an outside click, so changing your mind by clicking elsewhere is safe', () => {
    const onDelete = vi.fn();
    render(<ExpandableCard summary="Acme Inc" onDelete={onDelete}><p>x</p></ExpandableCard>);

    fireEvent.click(screen.getByTitle('Remove entry'));
    expect(screen.getByText('Delete')).toBeTruthy();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByText('Delete')).toBeNull();
    expect(screen.getByTitle('Remove entry')).toBeTruthy();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('does not react to an outside click when not armed (no listener leak)', () => {
    const onDelete = vi.fn();
    render(<ExpandableCard summary="Acme Inc" onDelete={onDelete}><p>x</p></ExpandableCard>);
    expect(() => fireEvent.mouseDown(document.body)).not.toThrow();
    expect(onDelete).not.toHaveBeenCalled();
  });
});

describe('ExpandableCard — read-only usage (no onDelete)', () => {
  it('renders with no delete button when onDelete is omitted', () => {
    render(<ExpandableCard summary="Manual Mapping"><p>x</p></ExpandableCard>);
    expect(screen.queryByTitle('Remove entry')).toBeNull();
  });

  it('still expands and collapses normally without onDelete', () => {
    render(<ExpandableCard summary="Manual Mapping"><p>debug content</p></ExpandableCard>);
    fireEvent.click(screen.getByText('Manual Mapping'));
    expect(screen.getByText('debug content')).toBeTruthy();
    fireEvent.click(screen.getByText('Manual Mapping'));
    expect(screen.queryByText('debug content')).toBeNull();
  });
});
