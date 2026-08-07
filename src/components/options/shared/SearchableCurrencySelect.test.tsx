// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SearchableCurrencySelect } from './SearchableCurrencySelect';

// jsdom doesn't implement Element.scrollIntoView; the dropdown's
// keyboard-highlight effect calls it whenever the panel opens.
Element.prototype.scrollIntoView = vi.fn();

afterEach(cleanup);

function renderSelect(value = '', onChange = vi.fn()) {
  render(<SearchableCurrencySelect value={value} onChange={onChange} />);
  return { onChange };
}

describe('SearchableCurrencySelect — trigger display', () => {
  it('shows the placeholder when no currency is selected', () => {
    renderSelect();
    expect(screen.getByText('Select currency…')).toBeTruthy();
  });

  it('shows the selected currency\'s code and name', () => {
    renderSelect('THB');
    expect(screen.getByText('THB — Thai Baht')).toBeTruthy();
  });
});

describe('SearchableCurrencySelect — search matches code or name', () => {
  it('finds a currency by its code', () => {
    const { onChange } = renderSelect();
    fireEvent.click(screen.getByRole('button'));
    fireEvent.change(screen.getByPlaceholderText('Search by code or name…'), { target: { value: 'THB' } });
    fireEvent.click(screen.getByText('Thai Baht'));
    expect(onChange).toHaveBeenCalledWith('THB');
  });

  it('finds a currency by name', () => {
    const { onChange } = renderSelect();
    fireEvent.click(screen.getByRole('button'));
    fireEvent.change(screen.getByPlaceholderText('Search by code or name…'), { target: { value: 'Thai Baht' } });
    fireEvent.click(screen.getByText('Thai Baht'));
    expect(onChange).toHaveBeenCalledWith('THB');
  });

  it('shows "No currencies found." for a non-matching search', () => {
    renderSelect();
    fireEvent.click(screen.getByRole('button'));
    fireEvent.change(screen.getByPlaceholderText('Search by code or name…'), { target: { value: 'zzzznomatch' } });
    expect(screen.getByText('No currencies found.')).toBeTruthy();
  });
});
