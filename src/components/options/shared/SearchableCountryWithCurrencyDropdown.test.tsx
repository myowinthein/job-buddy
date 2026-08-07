// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SearchableCountryWithCurrencyDropdown } from './SearchableCountryWithCurrencyDropdown';

// jsdom doesn't implement Element.scrollIntoView; the dropdown's
// keyboard-highlight effect calls it whenever the panel opens.
Element.prototype.scrollIntoView = vi.fn();

afterEach(cleanup);

function renderSelect(value = '', onChange = vi.fn()) {
  render(<SearchableCountryWithCurrencyDropdown value={value} onChange={onChange} />);
  return { onChange };
}

describe('SearchableCountryWithCurrencyDropdown — currencyFor lookup', () => {
  it("shows the selected country's mapped currency code alongside its name", () => {
    renderSelect('TH');
    expect(screen.getByText('Thailand')).toBeTruthy();
    expect(screen.getByText('THB')).toBeTruthy();
  });

  it('shows the mapped currency for each option row, not just the trigger', () => {
    renderSelect();
    fireEvent.click(screen.getByRole('button'));
    fireEvent.change(screen.getByPlaceholderText('Search country, code, or currency…'), { target: { value: 'Singapore' } });
    expect(screen.getByText('SGD')).toBeTruthy();
  });
});

describe('SearchableCountryWithCurrencyDropdown — search matches name, code, or currency', () => {
  it('finds a country by name', () => {
    const { onChange } = renderSelect();
    fireEvent.click(screen.getByRole('button'));
    fireEvent.change(screen.getByPlaceholderText('Search country, code, or currency…'), { target: { value: 'Thailand' } });
    fireEvent.click(screen.getByText('Thailand'));
    expect(onChange).toHaveBeenCalledWith('TH');
  });

  it('finds a country by its mapped currency code (not just name/code)', () => {
    const { onChange } = renderSelect();
    fireEvent.click(screen.getByRole('button'));
    fireEvent.change(screen.getByPlaceholderText('Search country, code, or currency…'), { target: { value: 'THB' } });
    expect(screen.getByText('Thailand')).toBeTruthy();
    fireEvent.click(screen.getByText('Thailand'));
    expect(onChange).toHaveBeenCalledWith('TH');
  });

  it('shows "No countries found." for a non-matching search', () => {
    renderSelect();
    fireEvent.click(screen.getByRole('button'));
    fireEvent.change(screen.getByPlaceholderText('Search country, code, or currency…'), { target: { value: 'zzzznomatch' } });
    expect(screen.getByText('No countries found.')).toBeTruthy();
  });
});
