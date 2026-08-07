// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SearchableLanguageSelect } from './SearchableLanguageSelect';

// jsdom doesn't implement Element.scrollIntoView; the dropdown's
// keyboard-highlight effect calls it whenever the panel opens.
Element.prototype.scrollIntoView = vi.fn();

afterEach(cleanup);

function renderSelect(value = '', onChange = vi.fn()) {
  render(<SearchableLanguageSelect value={value} onChange={onChange} />);
  return { onChange };
}

describe('SearchableLanguageSelect — trigger display', () => {
  it('shows the placeholder when no language is selected', () => {
    renderSelect();
    expect(screen.getByText('Select language…')).toBeTruthy();
  });

  it('resolves a known ISO code to its display name', () => {
    renderSelect('en');
    expect(screen.getByText('English')).toBeTruthy();
  });

  it('falls back to showing the raw stored value for a legacy free-text entry that resolves to no known language', () => {
    renderSelect('Klingon');
    expect(screen.getByText('Klingon')).toBeTruthy();
  });
});

describe('SearchableLanguageSelect — search matches by name', () => {
  it('finds a language by name and selects its code', () => {
    const { onChange } = renderSelect();
    fireEvent.click(screen.getByRole('button'));
    fireEvent.change(screen.getByPlaceholderText('Search language…'), { target: { value: 'Spanish' } });
    fireEvent.click(screen.getByText('Spanish'));
    expect(onChange).toHaveBeenCalledWith('es');
  });

  it('shows "No languages found." for a non-matching search', () => {
    renderSelect();
    fireEvent.click(screen.getByRole('button'));
    fireEvent.change(screen.getByPlaceholderText('Search language…'), { target: { value: 'zzzznomatch' } });
    expect(screen.getByText('No languages found.')).toBeTruthy();
  });
});
