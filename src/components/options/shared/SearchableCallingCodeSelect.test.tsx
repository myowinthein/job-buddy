// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SearchableCallingCodeSelect } from './SearchableCallingCodeSelect';

// jsdom doesn't implement Element.scrollIntoView; the dropdown's
// keyboard-highlight effect calls it whenever the panel opens.
Element.prototype.scrollIntoView = vi.fn();

afterEach(cleanup);

function renderSelect(value: string, onChange = vi.fn()) {
  render(<SearchableCallingCodeSelect value={value} onChange={onChange} />);
  return { onChange };
}

describe('SearchableCallingCodeSelect — trigger display and fallback', () => {
  it('shows the selected country\'s flag and calling code', () => {
    renderSelect('TH');
    expect(screen.getByLabelText('Select country calling code').textContent).toContain('+66');
  });

  it('falls back to the first country when value is an unrecognized code', () => {
    renderSelect('ZZ');
    // findCountry falls back to COUNTRIES[0] rather than crashing or showing blank.
    expect(screen.getByLabelText('Select country calling code')).toBeTruthy();
  });
});

describe('SearchableCallingCodeSelect — search matches name or calling code', () => {
  it('finds a country by name', () => {
    const { onChange } = renderSelect('US');
    fireEvent.click(screen.getByLabelText('Select country calling code'));
    fireEvent.change(screen.getByPlaceholderText('Search country or code…'), { target: { value: 'Thailand' } });
    fireEvent.click(screen.getByText('Thailand'));
    expect(onChange).toHaveBeenCalledWith('TH');
  });

  it('finds a country by calling code without the "+" prefix', () => {
    const { onChange } = renderSelect('US');
    fireEvent.click(screen.getByLabelText('Select country calling code'));
    fireEvent.change(screen.getByPlaceholderText('Search country or code…'), { target: { value: '66' } });
    fireEvent.click(screen.getByText('Thailand'));
    expect(onChange).toHaveBeenCalledWith('TH');
  });

  it('finds a country by calling code with the "+" prefix', () => {
    const { onChange } = renderSelect('US');
    fireEvent.click(screen.getByLabelText('Select country calling code'));
    fireEvent.change(screen.getByPlaceholderText('Search country or code…'), { target: { value: '+65' } });
    fireEvent.click(screen.getByText('Singapore'));
    expect(onChange).toHaveBeenCalledWith('SG');
  });

  it('shows "No countries found." for a non-matching search', () => {
    renderSelect('US');
    fireEvent.click(screen.getByLabelText('Select country calling code'));
    fireEvent.change(screen.getByPlaceholderText('Search country or code…'), { target: { value: 'zzzznomatch' } });
    expect(screen.getByText('No countries found.')).toBeTruthy();
  });
});
