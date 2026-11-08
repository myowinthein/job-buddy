// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HelpPopover } from './HelpPopover';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const renderPopover = () =>
  render(
    <>
      <HelpPopover label="How it works">
        <p>Panel text</p>
      </HelpPopover>
      <button type="button">Elsewhere</button>
    </>,
  );
const trigger = () => screen.getByRole('button', { name: 'How it works' });

describe('HelpPopover', () => {
  it('stays closed until it is used', () => {
    renderPopover();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('opens its panel when the button gets focus', () => {
    renderPopover();
    fireEvent.focus(trigger());
    expect(screen.getByRole('tooltip').textContent).toBe('Panel text');
  });

  it('opens on hover and closes shortly after the pointer leaves', () => {
    vi.useFakeTimers();
    renderPopover();
    fireEvent.mouseEnter(trigger().parentElement!);
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.mouseLeave(trigger().parentElement!);
    act(() => void vi.advanceTimersByTime(200));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('keeps a clicked panel open after the pointer leaves', () => {
    vi.useFakeTimers();
    renderPopover();
    fireEvent.click(trigger());
    fireEvent.mouseLeave(trigger().parentElement!);
    act(() => void vi.advanceTimersByTime(200));
    expect(screen.getByRole('tooltip')).toBeTruthy();
  });

  it('closes on Escape', () => {
    renderPopover();
    fireEvent.click(trigger());
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('closes when the pointer goes down outside the panel', () => {
    renderPopover();
    fireEvent.click(trigger());
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('describes the button with the open panel', () => {
    renderPopover();
    fireEvent.click(trigger());
    expect(trigger().getAttribute('aria-describedby')).toBe(screen.getByRole('tooltip').id);
  });
});
