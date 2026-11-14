// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ModalShell } from './ModalShell';

afterEach(cleanup);

const renderShell = (props: { busy?: boolean; onDismiss?: () => void } = {}) =>
  render(
    <ModalShell
      titleId="shell-title"
      descriptionId="shell-description"
      onDismiss={props.onDismiss ?? vi.fn()}
      busy={props.busy}
      className="panel"
    >
      <h3 id="shell-title">Title</h3>
      <p id="shell-description">Description</p>
      <button type="button">Inside</button>
    </ModalShell>,
  );

describe('ModalShell', () => {
  it.each(['negative tabindex', 'hidden ancestor', 'inert ancestor', 'display none ancestor', 'collapsed details'])(
    'keeps %s controls out of the keyboard focus loop',
    (hidden) => {
      const hiddenControl = <button type="button">Hidden action</button>;
      render(
        <ModalShell titleId="focus-title" onDismiss={vi.fn()} className="panel">
          <h3 id="focus-title">Focus test</h3>
          {hidden === 'negative tabindex' && <button type="button" tabIndex={-1}>Hidden action</button>}
          {hidden === 'hidden ancestor' && <div hidden>{hiddenControl}</div>}
          {hidden === 'inert ancestor' && <div inert>{hiddenControl}</div>}
          {hidden === 'display none ancestor' && <div style={{ display: 'none' }}>{hiddenControl}</div>}
          {hidden === 'collapsed details' && <details><summary>More options</summary>{hiddenControl}</details>}
          <button type="button">Visible action</button>
        </ModalShell>,
      );
      const dialog = screen.getByRole('dialog');
      fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Visible action' }));
      fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
      expect(document.activeElement).toBe(hidden === 'collapsed details'
        ? screen.getByText('More options')
        : screen.getByRole('button', { name: 'Visible action' }));
    },
  );

  it('labels the dialog with its title and description', () => {
    renderShell();
    const dialog = screen.getByRole('dialog', { name: 'Title' });
    expect(dialog.getAttribute('aria-describedby')).toBe('shell-description');
  });

  it('moves focus into the dialog', () => {
    renderShell();
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
  });

  it('dismisses on Escape', () => {
    const onDismiss = vi.fn();
    renderShell({ onDismiss });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('dismisses when the backdrop is clicked', () => {
    const onDismiss = vi.fn();
    renderShell({ onDismiss });
    fireEvent.click(screen.getByRole('dialog').parentElement!);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('keeps clicks inside the dialog from dismissing it', () => {
    const onDismiss = vi.fn();
    renderShell({ onDismiss });
    fireEvent.click(screen.getByRole('button', { name: 'Inside' }));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('ignores Escape and backdrop clicks while busy', () => {
    const onDismiss = vi.fn();
    renderShell({ onDismiss, busy: true });
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByRole('dialog').parentElement!);
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
