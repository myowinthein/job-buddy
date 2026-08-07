// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { AiSparkIcon } from './AiSparkIcon';
import { InfoTooltip } from './InfoTooltip';

afterEach(cleanup);

describe('AiSparkIcon — active state', () => {
  it('renders as a non-interactive image with the "on" label when active', () => {
    render(<AiSparkIcon active onClick={vi.fn()} />);
    const icon = screen.getByRole('img');
    expect(icon.getAttribute('aria-label')).toBe('AI-assisted autofill is on');
    expect(icon.getAttribute('tabIndex')).toBeNull();
  });

  it('never fires onClick when active, even if clicked', () => {
    const onClick = vi.fn();
    render(<AiSparkIcon active onClick={onClick} />);
    fireEvent.click(screen.getByRole('img'));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('AiSparkIcon — inactive state', () => {
  it('renders as a clickable button with the "off" label when inactive and onClick is provided', () => {
    const onClick = vi.fn();
    render(<AiSparkIcon active={false} onClick={onClick} />);
    const icon = screen.getByRole('button');
    expect(icon.getAttribute('aria-label')).toBe('AI-assisted autofill is off — click to add your Gemini API key');
    fireEvent.click(icon);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('activates via Enter and Space keys, not other keys', () => {
    const onClick = vi.fn();
    render(<AiSparkIcon active={false} onClick={onClick} />);
    const icon = screen.getByRole('button');

    fireEvent.keyDown(icon, { key: 'Enter' });
    expect(onClick).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(icon, { key: ' ' });
    expect(onClick).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(icon, { key: 'a' });
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('renders as non-interactive when inactive with no onClick handler', () => {
    render(<AiSparkIcon active={false} />);
    const icon = screen.getByRole('img');
    expect(icon.getAttribute('tabIndex')).toBeNull();
  });
});

describe('InfoTooltip', () => {
  it('always renders the tooltip text in the DOM (visibility is CSS-only, via hover)', () => {
    render(<InfoTooltip text="Helpful context" />);
    expect(screen.getByText('Helpful context')).toBeTruthy();
  });

  it('anchors left by default and right when align="right" is passed', () => {
    const { rerender } = render(<InfoTooltip text="x" />);
    expect(screen.getByText('x').className).toContain('left-0');

    rerender(<InfoTooltip text="x" align="right" />);
    expect(screen.getByText('x').className).toContain('right-0');
  });
});
