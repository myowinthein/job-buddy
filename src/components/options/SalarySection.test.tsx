// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SalarySection } from './SalarySection';
import { ToastProvider } from '@/src/components/ui/Toast';
import type { Profile } from '@/src/types/profile';

// jsdom doesn't implement Element.scrollIntoView; SearchableCountryWithCurrencyDropdown's
// keyboard-highlight effect calls it whenever a panel opens.
Element.prototype.scrollIntoView = vi.fn();

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
      salary: {
        current: { amount: 5000, currency: 'THB', country: 'TH', period: 'monthly' },
        expected: [],
      },
    });
    fireEvent.click(screen.getByText('Save Salary'));
    expect(onSave).toHaveBeenCalledWith({
      salary: expect.objectContaining({ current: expect.objectContaining({ country: 'TH' }) }),
    });
  });

  it('normalizes a legacy full country name to its ISO code', () => {
    const { onSave } = renderSection({
      salary: {
        current: { amount: 5000, currency: 'THB', country: 'Thailand', period: 'monthly' },
        expected: [],
      },
    });
    fireEvent.click(screen.getByText('Save Salary'));
    expect(onSave).toHaveBeenCalledWith({
      salary: expect.objectContaining({ current: expect.objectContaining({ country: 'TH' }) }),
    });
  });

  it('keeps country optional when loading an existing currency-only entry', () => {
    const { onSave } = renderSection({
      salary: { current: { amount: 5000, currency: 'THB', period: 'monthly' }, expected: [] },
    });
    fireEvent.click(screen.getByText('Save Salary'));
    expect(onSave).toHaveBeenCalledWith({
      salary: expect.objectContaining({
        current: expect.objectContaining({ currency: 'THB', country: undefined }),
      }),
    });
  });

  it('preserves a shared currency without requiring a country', () => {
    // USD maps to many countries — deliberately not auto-resolved.
    const { onSave } = renderSection({
      salary: { current: { amount: 5000, currency: 'USD', period: 'monthly' }, expected: [] },
    });
    fireEvent.click(screen.getByText('Save Salary'));
    expect(onSave).toHaveBeenCalledWith({
      salary: expect.objectContaining({
        current: expect.objectContaining({ currency: 'USD', country: undefined }),
      }),
    });
  });
});

describe('SalarySection — expected-salary rows', () => {
  it('drops a fully-empty expected row from the save payload', () => {
    const { onSave } = renderSection({
      salary: {
        current: { amount: 5000, currency: 'THB', country: 'TH', period: 'monthly' },
        expected: [],
      },
    });
    fireEvent.click(screen.getByText('Save Salary'));
    expect(onSave).toHaveBeenCalledWith({
      salary: expect.objectContaining({ expected: [] }),
    });
  });

  it('preserves a stored expected currency without inferring a country', () => {
    const { onSave } = renderSection({
      salary: {
        current: { amount: 5000, currency: 'THB', country: 'TH', period: 'monthly' },
        expected: [{ amount: 6000, currency: 'THB', period: 'annual' }],
      },
    });
    fireEvent.click(screen.getByText('Save Salary'));
    expect(onSave).toHaveBeenCalledWith({
      salary: expect.objectContaining({
        expected: [
          expect.objectContaining({
            country: undefined,
            currency: 'THB',
            amount: 6000,
            period: 'annual',
          }),
        ],
      }),
    });
  });

  it('requires currency for a populated amount', () => {
    const { onSave } = renderSection({
      salary: {
        current: { amount: 5000, currency: 'THB', country: 'TH', period: 'monthly' },
        expected: [],
      },
    });
    // Type an amount into the (initially empty) expected row without picking a country.
    const amountInputs = screen.getAllByPlaceholderText('100000');
    fireEvent.change(amountInputs[0], { target: { value: '7000' } });
    fireEvent.click(screen.getByText('Save Salary'));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Currency is required', { selector: 'p' })).toBeTruthy();
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

  it('changing the period select of one expected row does not affect a different row', () => {
    const { onSave } = renderSection({
      salary: {
        current: { amount: 5000, currency: 'THB', country: 'TH', period: 'monthly' },
        expected: [
          { amount: 6000, currency: 'THB', country: 'TH', period: 'monthly' },
          { amount: 8000, currency: 'USD', country: 'US', period: 'monthly' },
        ],
      },
    });

    // Expected rows appear first; the current-salary period follows.
    const periodSelects = screen.getAllByDisplayValue('Monthly');
    fireEvent.change(periodSelects[1], { target: { value: 'annual' } });
    fireEvent.click(screen.getByText('Save Salary'));

    expect(onSave).toHaveBeenCalledWith({
      salary: expect.objectContaining({
        expected: [
          expect.objectContaining({ country: 'TH', amount: 6000, period: 'monthly' }),
          expect.objectContaining({ country: 'US', amount: 8000, period: 'annual' }),
        ],
      }),
    });
  });
});

describe('SalarySection — current-salary country drives the saved currency', () => {
  it('saves the currency mapped from the chosen country, via the searchable dropdown', () => {
    const { onSave } = renderSection({
      salary: {
        current: { amount: 5000, currency: 'THB', country: 'TH', period: 'monthly' },
        expected: [],
      },
    });

    fireEvent.click(document.getElementById('field-currentCountry')!); // optional country suggests a default
    fireEvent.change(screen.getByPlaceholderText('Search country or code…'), {
      target: { value: 'Singapore' },
    });
    fireEvent.click(screen.getByText('Singapore'));

    fireEvent.click(screen.getByText('Save Salary'));

    expect(onSave).toHaveBeenCalledWith({
      salary: expect.objectContaining({
        current: expect.objectContaining({ country: 'SG', currency: 'SGD' }),
      }),
    });
  });
});

describe('SalarySection — invalid current-salary amount', () => {
  it('shows a live error for a negative amount as the user types', () => {
    renderSection({
      salary: {
        current: { amount: 5000, currency: 'THB', country: 'TH', period: 'monthly' },
        expected: [],
      },
    });
    fireEvent.change(document.getElementById('field-currentAmount')!, {
      target: { value: '-100' },
    });
    expect(screen.getByText('Enter a valid amount')).toBeTruthy();
  });

  it('blocks save for a negative current-salary amount', () => {
    const { onSave } = renderSection({
      salary: {
        current: { amount: 5000, currency: 'THB', country: 'TH', period: 'monthly' },
        expected: [],
      },
    });
    fireEvent.change(document.getElementById('field-currentAmount')!, {
      target: { value: '-100' },
    });
    fireEvent.click(screen.getByText('Save Salary'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('clears the error once the amount becomes valid', () => {
    renderSection({
      salary: {
        current: { amount: 5000, currency: 'THB', country: 'TH', period: 'monthly' },
        expected: [],
      },
    });
    const input = document.getElementById('field-currentAmount')!;
    fireEvent.change(input, { target: { value: '-100' } });
    expect(screen.getByText('Enter a valid amount')).toBeTruthy();
    fireEvent.change(input, { target: { value: '6000' } });
    expect(screen.queryByText('Enter a valid amount')).toBeNull();
  });
});
