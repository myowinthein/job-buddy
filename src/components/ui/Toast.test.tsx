// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { ToastProvider } from './Toast';
import { useToast } from './useToast';

afterEach(() => { cleanup(); vi.useRealTimers(); });

function Trigger({ type = 'success' as 'success' | 'error' | 'warning', message = 'Saved!' }) {
  const { showToast } = useToast();
  return <button onClick={() => showToast(type, message)}>trigger</button>;
}

describe('useToast', () => {
  it('throws when called outside a ToastProvider', () => {
    // Suppress React's expected error-boundary console noise for this render.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    function Bare() { useToast(); return null; }
    expect(() => render(<Bare />)).toThrow('useToast must be used within a ToastProvider');
    spy.mockRestore();
  });
});

describe('ToastProvider — showing and stacking toasts', () => {
  it('renders a toast with the message when showToast is called', () => {
    render(<ToastProvider><Trigger /></ToastProvider>);
    fireEvent.click(screen.getByText('trigger'));
    expect(screen.getByText('Saved!')).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('stacks multiple toasts with the newest first in the DOM', () => {
    function MultiTrigger() {
      const { showToast } = useToast();
      return (
        <>
          <button onClick={() => showToast('success', 'First')}>t1</button>
          <button onClick={() => showToast('success', 'Second')}>t2</button>
        </>
      );
    }
    render(<ToastProvider><MultiTrigger /></ToastProvider>);
    fireEvent.click(screen.getByText('t1'));
    fireEvent.click(screen.getByText('t2'));

    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(2);
    expect(alerts[0].textContent).toContain('Second'); // prepended = newest first
    expect(alerts[1].textContent).toContain('First');
  });
});

describe('ToastProvider — auto-dismiss timing', () => {
  beforeEach(() => vi.useFakeTimers());

  it('auto-dismisses a success toast after its default 2000ms duration', async () => {
    render(<ToastProvider><Trigger type="success" /></ToastProvider>);
    act(() => { fireEvent.click(screen.getByText('trigger')); });
    expect(screen.getByText('Saved!')).toBeTruthy();

    await act(async () => { await vi.advanceTimersByTimeAsync(2000); }); // dismiss() fires
    await act(async () => { await vi.advanceTimersByTimeAsync(200); }); // exit animation -> onRemove
    expect(screen.queryByText('Saved!')).toBeNull();
  });

  it('keeps error toasts visible for 8000ms', async () => {
    render(<ToastProvider><Trigger type="error" message="Failed!" /></ToastProvider>);
    act(() => { fireEvent.click(screen.getByText('trigger')); });

    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(screen.getByText('Failed!')).toBeTruthy(); // still visible past the success duration

    await act(async () => { await vi.advanceTimersByTimeAsync(5999); });
    expect(screen.getByText('Failed!')).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(201); });
    expect(screen.queryByText('Failed!')).toBeNull();
  });

  it('keeps warning toasts visible for 6000ms and lets users dismiss them', async () => {
    render(<ToastProvider><Trigger type="warning" message="Check your backup" /></ToastProvider>);
    fireEvent.click(screen.getByText('trigger'));
    await act(async () => { await vi.advanceTimersByTimeAsync(5999); });
    expect(screen.getByText('Check your backup')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(screen.queryByText('Check your backup')).toBeNull();
  });

  it('pauses while keyboard focus stays inside, even when the pointer leaves', async () => {
    render(<ToastProvider><Trigger /></ToastProvider>);
    fireEvent.click(screen.getByText('trigger'));
    const alert = screen.getByRole('alert');
    const dismiss = screen.getByRole('button', { name: 'Dismiss notification' });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    fireEvent.mouseEnter(alert);
    fireEvent.focus(dismiss);
    fireEvent.mouseLeave(alert);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(screen.getByText('Saved!')).toBeTruthy();
    fireEvent.blur(dismiss, { relatedTarget: screen.getByText('trigger') });
    await act(async () => { await vi.advanceTimersByTimeAsync(1200); });
    expect(screen.queryByText('Saved!')).toBeNull();
  });

  it('pauses the dismiss timer on hover and resumes it on mouse leave', async () => {
    render(<ToastProvider><Trigger /></ToastProvider>);
    act(() => { fireEvent.click(screen.getByText('trigger')); });
    const alert = screen.getByRole('alert');

    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    fireEvent.mouseEnter(alert);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); }); // would have dismissed if not paused
    expect(screen.getByText('Saved!')).toBeTruthy();

    fireEvent.mouseLeave(alert);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000 + 200); }); // remaining timer + exit
    expect(screen.queryByText('Saved!')).toBeNull();
  });
});
