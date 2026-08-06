// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { AddressSection } from './AddressSection';
import { ToastProvider } from '@/src/components/ui/Toast';
import type { Profile } from '@/src/types/profile';

afterEach(cleanup);

function renderSection(profile: Partial<Profile>, onSave = vi.fn().mockResolvedValue(undefined)) {
  render(
    <ToastProvider>
      <AddressSection profile={profile} onSave={onSave} />
    </ToastProvider>,
  );
  return { onSave };
}

function fillCityAndSave() {
  fireEvent.change(document.getElementById('field-city')!, { target: { value: 'Bangkok' } });
  fireEvent.click(screen.getByText('Save Address'));
}

describe('AddressSection — initCountryCode backward-compat loader', () => {
  it('passes an already-ISO country code through unchanged on save', () => {
    const { onSave } = renderSection({ address: { city: '', country: 'TH' } });
    fillCityAndSave();
    expect(onSave).toHaveBeenCalledWith({
      address: expect.objectContaining({ country: 'TH' }),
    });
  });

  it('normalizes a legacy full country name to its ISO code on save', () => {
    const { onSave } = renderSection({ address: { city: '', country: 'Thailand' } });
    fillCityAndSave();
    expect(onSave).toHaveBeenCalledWith({
      address: expect.objectContaining({ country: 'TH' }),
    });
  });

  it('preserves an unrecognized raw value as-is rather than dropping it', () => {
    const { onSave } = renderSection({ address: { city: '', country: 'Atlantis' } });
    fillCityAndSave();
    expect(onSave).toHaveBeenCalledWith({
      address: expect.objectContaining({ country: 'Atlantis' }),
    });
  });

  it('treats an empty stored country as unset (blocks save, shows required error)', () => {
    const { onSave } = renderSection({ address: { city: 'Bangkok', country: '' } });
    fireEvent.click(screen.getByText('Save Address'));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Country is required')).toBeTruthy();
  });
});

describe('AddressSection — required-field validation', () => {
  it('blocks save when city is blank', () => {
    const { onSave } = renderSection({ address: { city: '', country: 'TH' } });
    fireEvent.click(screen.getByText('Save Address'));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('City is required')).toBeTruthy();
  });
});
