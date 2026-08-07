// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SearchableCountryDropdown } from './SearchableCountryDropdown';

// jsdom doesn't implement Element.scrollIntoView; the dropdown's
// keyboard-highlight effect calls it whenever the panel opens.
Element.prototype.scrollIntoView = vi.fn();

afterEach(cleanup);

function renderSelect(value = '', onChange = vi.fn()) {
  render(<SearchableCountryDropdown value={value} onChange={onChange} />);
  return { onChange };
}

describe('SearchableCountryDropdown — trigger display', () => {
  it('shows the placeholder when no country is selected', () => {
    renderSelect();
    expect(screen.getByText('Select country…')).toBeTruthy();
  });

  it("shows the selected country's flag and name", () => {
    renderSelect('TH');
    expect(screen.getByText('Thailand')).toBeTruthy();
  });
});

describe('SearchableCountryDropdown — search matches name or code', () => {
  it('finds a country by name', () => {
    const { onChange } = renderSelect();
    fireEvent.click(screen.getByRole('button'));
    fireEvent.change(screen.getByPlaceholderText('Search country or code…'), { target: { value: 'Thailand' } });
    fireEvent.click(screen.getByText('Thailand'));
    expect(onChange).toHaveBeenCalledWith('TH');
  });

  it('finds a country by its ISO code', () => {
    const { onChange } = renderSelect();
    fireEvent.click(screen.getByRole('button'));
    fireEvent.change(screen.getByPlaceholderText('Search country or code…'), { target: { value: 'th' } });
    fireEvent.click(screen.getByText('Thailand'));
    expect(onChange).toHaveBeenCalledWith('TH');
  });

  it('shows "No countries found." for a non-matching search', () => {
    renderSelect();
    fireEvent.click(screen.getByRole('button'));
    fireEvent.change(screen.getByPlaceholderText('Search country or code…'), { target: { value: 'zzzznomatch' } });
    expect(screen.getByText('No countries found.')).toBeTruthy();
  });
});
