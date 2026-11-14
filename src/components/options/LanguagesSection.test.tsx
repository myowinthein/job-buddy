// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { LanguagesSection } from './LanguagesSection';
import { ToastProvider } from '@/src/components/ui/Toast';
import type { Profile, LanguageEntry } from '@/src/types/profile';
import '@/src/testing/scrollIntoViewStub';

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
    fireEvent.click(screen.getByText('Save'));
    expect(onSave).toHaveBeenCalledWith({
      languages: [{ language: 'es', proficiency: migrated }],
    });
  });

  it('passes an already-current proficiency value through unchanged', () => {
    const { onSave } = renderSection({
      languages: [{ language: 'fr', proficiency: 'full_professional' }],
    });
    fireEvent.click(screen.getByText('Save'));
    expect(onSave).toHaveBeenCalledWith({
      languages: [{ language: 'fr', proficiency: 'full_professional' }],
    });
  });

  it('falls back an unrecognized proficiency value to professional_working', () => {
    const { onSave } = renderSection({
      languages: [{ language: 'de', proficiency: 'nonsense' } as unknown as LanguageEntry],
    });
    fireEvent.click(screen.getByText('Save'));
    expect(onSave).toHaveBeenCalledWith({
      languages: [{ language: 'de', proficiency: 'professional_working' }],
    });
  });
});

describe('LanguagesSection — validation and entry management', () => {
  it('shows CEFR ranges in the options and keeps explanations inside the guide', () => {
    renderSection({ languages: [{ language: 'en', proficiency: 'native_bilingual' }] });
    const select = screen.getByRole('combobox', { name: 'Proficiency*' });
    expect(screen.getByRole('option', { name: 'Full professional (C1–C2)' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Professional working (B2–C1)' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Limited working (B1–B2)' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Elementary (A1–A2)' })).toBeTruthy();
    expect(screen.queryByText('You use this language naturally in most situations.')).toBeNull();
    fireEvent.change(select, { target: { value: 'elementary' } });
    expect(screen.queryByText('You can introduce yourself and exchange basic information.')).toBeNull();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('opens the complete proficiency guide beside the label without changing the selection', () => {
    renderSection({ languages: [{ language: 'en', proficiency: 'professional_working' }] });
    const help = screen.getByRole('button', { name: 'Proficiency guide' });
    fireEvent.focus(help);
    expect(screen.getByRole('tooltip').querySelectorAll('dt')).toHaveLength(5);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.click(help);
    expect(screen.getByRole('tooltip')).toBeTruthy();
    expect((screen.getByRole('combobox', { name: 'Proficiency*' }) as HTMLSelectElement).value).toBe(
      'professional_working',
    );
  });

  it('requires both language and proficiency on an empty row', () => {
    const { onSave } = renderSection({ languages: [] });
    fireEvent.click(screen.getByText('Save'));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Choose a language')).toBeTruthy();
    expect(screen.getByText('Choose a proficiency level')).toBeTruthy();
  });

  it('adds and saves a new entry via the searchable language picker and proficiency select', () => {
    const { onSave } = renderSection({ languages: [] });

    fireEvent.click(screen.getByText('Select language…'));
    fireEvent.change(screen.getByPlaceholderText('Search language…'), { target: { value: 'Spanish' } });
    fireEvent.click(screen.getByText('Spanish'));

    fireEvent.change(screen.getByText('Select proficiency…').closest('select')!, { target: { value: 'elementary' } });

    fireEvent.click(screen.getByText('Save'));
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
    expect(screen.getAllByRole('button', { name: 'Remove entry' })).toHaveLength(2);
    fireEvent.click(screen.getAllByTitle('Remove entry')[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getAllByRole('button', { name: 'Remove entry' })).toHaveLength(1);
  });
});

it('requires at least one language after removing every row', () => {
  const { onSave } = renderSection({ languages: [] });
  fireEvent.click(screen.getByTitle('Remove entry'));
  fireEvent.click(screen.getByText('Save'));
  expect(screen.getByText('Choose a language')).toBeTruthy();
  expect(screen.getAllByRole('button', { name: 'Remove entry' })).toHaveLength(1);
  expect(onSave).not.toHaveBeenCalled();
});
