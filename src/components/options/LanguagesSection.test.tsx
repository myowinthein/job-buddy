// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { LanguagesSection } from './LanguagesSection';
import { ToastProvider } from '@/src/components/ui/Toast';
import type { Profile, LanguageEntry } from '@/src/types/profile';

// jsdom doesn't implement Element.scrollIntoView; the searchable dropdown's
// keyboard-highlight effect calls it whenever the panel opens.
Element.prototype.scrollIntoView = vi.fn();

afterEach(cleanup);

function renderSection(profile: Partial<Profile>, onSave = vi.fn().mockResolvedValue(undefined)) {
  render(
    <ToastProvider>
      <LanguagesSection profile={profile} onSave={onSave} />
    </ToastProvider>,
  );
  return { onSave };
}

describe('LanguagesSection — legacy proficiency migration', () => {
  it.each([
    ['basic', 'elementary'],
    ['conversational', 'limited_working'],
    ['professional', 'professional_working'],
    ['native', 'native_bilingual'],
  ])('migrates legacy proficiency "%s" to "%s" on save', (legacy, migrated) => {
    const { onSave } = renderSection({
      languages: [{ language: 'es', proficiency: legacy } as unknown as LanguageEntry],
    });
    fireEvent.click(screen.getByText('Save Languages'));
    expect(onSave).toHaveBeenCalledWith({
      languages: [{ language: 'es', proficiency: migrated }],
    });
  });

  it('passes an already-current proficiency value through unchanged', () => {
    const { onSave } = renderSection({
      languages: [{ language: 'fr', proficiency: 'full_professional' }],
    });
    fireEvent.click(screen.getByText('Save Languages'));
    expect(onSave).toHaveBeenCalledWith({
      languages: [{ language: 'fr', proficiency: 'full_professional' }],
    });
  });

  it('falls back an unrecognized proficiency value to professional_working', () => {
    const { onSave } = renderSection({
      languages: [{ language: 'de', proficiency: 'nonsense' } as unknown as LanguageEntry],
    });
    fireEvent.click(screen.getByText('Save Languages'));
    expect(onSave).toHaveBeenCalledWith({
      languages: [{ language: 'de', proficiency: 'professional_working' }],
    });
  });
});

describe('LanguagesSection — validation and entry management', () => {
  it('requires both language and proficiency on an empty row', () => {
    const { onSave } = renderSection({ languages: [] });
    fireEvent.click(screen.getByText('Save Languages'));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Language is required')).toBeTruthy();
    expect(screen.getByText('Proficiency is required')).toBeTruthy();
  });

  it('adds and saves a new entry via the searchable language picker and proficiency select', () => {
    const { onSave } = renderSection({ languages: [] });

    fireEvent.click(screen.getByText('Select language…'));
    fireEvent.change(screen.getByPlaceholderText('Search language…'), { target: { value: 'Spanish' } });
    fireEvent.click(screen.getByText('Spanish'));

    fireEvent.change(screen.getByText('Select proficiency…').closest('select')!, { target: { value: 'elementary' } });

    fireEvent.click(screen.getByText('Save Languages'));
    expect(onSave).toHaveBeenCalledWith({
      languages: [{ language: 'es', proficiency: 'elementary' }],
    });
  });

  it('removes an entry when its remove button is clicked', () => {
    renderSection({
      languages: [
        { language: 'es', proficiency: 'full_professional' },
        { language: 'fr', proficiency: 'elementary' },
      ],
    });
    expect(screen.getByText('Entry 2')).toBeTruthy();
    fireEvent.click(screen.getAllByTitle('Remove')[1]);
    expect(screen.queryByText('Entry 2')).toBeNull();
  });
});
