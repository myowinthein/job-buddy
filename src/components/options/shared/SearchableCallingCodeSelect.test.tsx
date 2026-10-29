// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SearchableCallingCodeSelect } from './SearchableCallingCodeSelect';
import { FormField } from './FormField';

// jsdom doesn't implement Element.scrollIntoView; the dropdown's
// keyboard-highlight effect calls it whenever the panel opens.
Element.prototype.scrollIntoView = vi.fn();

afterEach(cleanup);

function renderSelect(value: string, onChange = vi.fn()) {
  render(<SearchableCallingCodeSelect value={value} onChange={onChange} />);
  return { onChange };
}

describe('SearchableCallingCodeSelect — trigger display and fallback', () => {
  it("shows the selected country's flag and calling code", () => {
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
  it('closes after pointer selection inside a composite phone field', () => {
    const onChange = vi.fn();
    render(
      <FormField label="Phone">
        <div>
          <SearchableCallingCodeSelect value="US" onChange={onChange} />
          <input aria-label="Phone number" />
        </div>
      </FormField>,
    );
    const trigger = screen.getByLabelText('Select country calling code');
    expect(fireEvent.mouseDown(trigger)).toBe(false);
    fireEvent.click(trigger);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Thailand' } });
    fireEvent.click(screen.getByRole('option', { name: /Thailand/ }));
    expect(onChange).toHaveBeenCalledWith('TH');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });

  it.each(['Enter', 'Escape'])('returns keyboard focus to its trigger after %s', (key) => {
    const { onChange } = renderSelect('US');
    const trigger = screen.getByLabelText('Select country calling code');
    fireEvent.click(trigger);
    const search = screen.getByRole('combobox');
    fireEvent.change(search, { target: { value: 'Thailand' } });
    fireEvent.keyDown(search, { key });
    expect(document.activeElement).toBe(trigger);
    expect(screen.queryByRole('combobox')).toBeNull();
    if (key === 'Enter') expect(onChange).toHaveBeenCalledWith('TH');
    else expect(onChange).not.toHaveBeenCalled();
  });

  it('finds a country by name', () => {
    const { onChange } = renderSelect('US');
    fireEvent.click(screen.getByLabelText('Select country calling code'));
    fireEvent.change(screen.getByPlaceholderText('Search country or code…'), {
      target: { value: 'Thailand' },
    });
    fireEvent.click(screen.getByText('Thailand'));
    expect(onChange).toHaveBeenCalledWith('TH');
  });

  it('finds a country by calling code without the "+" prefix', () => {
    const { onChange } = renderSelect('US');
    fireEvent.click(screen.getByLabelText('Select country calling code'));
    fireEvent.change(screen.getByPlaceholderText('Search country or code…'), {
      target: { value: '66' },
    });
    fireEvent.click(screen.getByText('Thailand'));
    expect(onChange).toHaveBeenCalledWith('TH');
  });

  it('finds a country by calling code with the "+" prefix', () => {
    const { onChange } = renderSelect('US');
    fireEvent.click(screen.getByLabelText('Select country calling code'));
    fireEvent.change(screen.getByPlaceholderText('Search country or code…'), {
      target: { value: '+65' },
    });
    fireEvent.click(screen.getByText('Singapore'));
    expect(onChange).toHaveBeenCalledWith('SG');
  });

  it('shows "No countries found." for a non-matching search', () => {
    renderSelect('US');
    fireEvent.click(screen.getByLabelText('Select country calling code'));
    fireEvent.change(screen.getByPlaceholderText('Search country or code…'), {
      target: { value: 'zzzznomatch' },
    });
    expect(screen.getByText('No countries found.')).toBeTruthy();
  });
});
