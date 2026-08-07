// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SalarySection } from './SalarySection';
import { ToastProvider } from '@/src/components/ui/Toast';
import type { Profile } from '@/src/types/profile';

afterEach(cleanup);

function renderSection(profile: Partial<Profile>, onSave = vi.fn().mockResolvedValue(undefined)) {
  render(
    <ToastProvider>
      <SalarySection profile={profile} onSave={onSave} />
    </ToastProvider>,
  );
  return { onSave };
}

describe('SalarySection — current-salary country migration (initCurrentCountry)', () => {
  it('passes an already-ISO country code through unchanged on save', () => {
    const { onSave } = renderSection({
      salary: { current: { amount: 5000, currency: 'THB', country: 'TH', period: 'monthly' }, expected: [] },
    });
    fireEvent.click(screen.getByText('Save Salary'));
    expect(onSave).toHaveBeenCalledWith({
      salary: expect.objectContaining({ current: expect.objectContaining({ country: 'TH' }) }),
    });
  });

  it('normalizes a legacy full country name to its ISO code', () => {
    const { onSave } = renderSection({
      salary: { current: { amount: 5000, currency: 'THB', country: 'Thailand', period: 'monthly' }, expected: [] },
    });
    fireEvent.click(screen.getByText('Save Salary'));
    expect(onSave).toHaveBeenCalledWith({
      salary: expect.objectContaining({ current: expect.objectContaining({ country: 'TH' }) }),
    });
  });

  it('migrates an unambiguous currency-only entry to its single matching country', () => {
    // THB maps to exactly one country (TH) in COUNTRY_TO_CURRENCY.
    const { onSave } = renderSection({
      salary: { current: { amount: 5000, currency: 'THB', period: 'monthly' }, expected: [] },
    });
    fireEvent.click(screen.getByText('Save Salary'));
    expect(onSave).toHaveBeenCalledWith({
      salary: expect.objectContaining({ current: expect.objectContaining({ country: 'TH' }) }),
    });
  });

  it('leaves the country blank for an ambiguous shared currency and blocks save', () => {
    // USD maps to many countries — deliberately not auto-resolved.
    const { onSave } = renderSection({
      salary: { current: { amount: 5000, currency: 'USD', period: 'monthly' }, expected: [] },
    });
    fireEvent.click(screen.getByText('Save Salary'));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Country is required')).toBeTruthy();
  });
});

describe('SalarySection — expected-salary rows', () => {
  it('drops a fully-empty expected row from the save payload', () => {
    const { onSave } = renderSection({
      salary: { current: { amount: 5000, currency: 'THB', country: 'TH', period: 'monthly' }, expected: [] },
    });
    fireEvent.click(screen.getByText('Save Salary'));
    expect(onSave).toHaveBeenCalledWith({
      salary: expect.objectContaining({ expected: [] }),
    });
  });

  it('migrates a stored expected row with an unambiguous currency-only value', () => {
    const { onSave } = renderSection({
      salary: {
        current: { amount: 5000, currency: 'THB', country: 'TH', period: 'monthly' },
        expected: [{ amount: 6000, currency: 'THB', period: 'annual' }],
      },
    });
    fireEvent.click(screen.getByText('Save Salary'));
    expect(onSave).toHaveBeenCalledWith({
      salary: expect.objectContaining({
        expected: [expect.objectContaining({ country: 'TH', amount: 6000, period: 'annual' })],
      }),
    });
  });

  it('requires an amount once a row has a country, and vice versa', () => {
    const { onSave } = renderSection({
      salary: { current: { amount: 5000, currency: 'THB', country: 'TH', period: 'monthly' }, expected: [] },
    });
    // Type an amount into the (initially empty) expected row without picking a country.
    const amountInputs = screen.getAllByPlaceholderText('100000');
    fireEvent.change(amountInputs[0], { target: { value: '7000' } });
    fireEvent.click(screen.getByText('Save Salary'));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Country is required', { selector: 'p' })).toBeTruthy();
  });

  it('rejects a negative expected-salary amount', () => {
    const { onSave } = renderSection({
      salary: {
        current: { amount: 5000, currency: 'THB', country: 'TH', period: 'monthly' },
        expected: [{ amount: 6000, currency: 'THB', country: 'TH', period: 'annual' }],
      },
    });
    const amountInputs = screen.getAllByPlaceholderText('100000');
    fireEvent.change(amountInputs[0], { target: { value: '-500' } });
    expect(screen.getByText('Enter a valid amount', { selector: 'p' })).toBeTruthy();

    fireEvent.click(screen.getByText('Save Salary'));
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('SalarySection — invalid current-salary amount', () => {
  it('shows a live error for a negative amount as the user types', () => {
    renderSection({
      salary: { current: { amount: 5000, currency: 'THB', country: 'TH', period: 'monthly' }, expected: [] },
    });
    fireEvent.change(document.getElementById('field-currentAmount')!, { target: { value: '-100' } });
    expect(screen.getByText('Enter a valid amount')).toBeTruthy();
  });

  it('blocks save for a negative current-salary amount', () => {
    const { onSave } = renderSection({
      salary: { current: { amount: 5000, currency: 'THB', country: 'TH', period: 'monthly' }, expected: [] },
    });
    fireEvent.change(document.getElementById('field-currentAmount')!, { target: { value: '-100' } });
    fireEvent.click(screen.getByText('Save Salary'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('clears the error once the amount becomes valid', () => {
    renderSection({
      salary: { current: { amount: 5000, currency: 'THB', country: 'TH', period: 'monthly' }, expected: [] },
    });
    const input = document.getElementById('field-currentAmount')!;
    fireEvent.change(input, { target: { value: '-100' } });
    expect(screen.getByText('Enter a valid amount')).toBeTruthy();
    fireEvent.change(input, { target: { value: '6000' } });
    expect(screen.queryByText('Enter a valid amount')).toBeNull();
  });
});
