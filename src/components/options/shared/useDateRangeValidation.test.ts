// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useDateRangeValidation } from './useDateRangeValidation';

afterEach(cleanup);

type Entry = { startDate: string; isCurrent?: boolean };

function setup(entries: Entry[], opts: { minYear?: number; maxYear?: number; allowYearOnlyEnd?: boolean } = {}) {
  const setErrors = vi.fn();
  const { result } = renderHook(() =>
    useDateRangeValidation(entries, setErrors, { minYear: opts.minYear ?? 1950, maxYear: opts.maxYear ?? 2030, allowYearOnlyEnd: opts.allowYearOnlyEnd }),
  );
  return { result, setErrors };
}

// setErrors is always called with an updater function — apply it to a base
// error map to see the resulting patch, matching how the hook's own callers
// (WorkHistorySection/EducationSection) actually consume it via setState.
function applyUpdate(setErrors: ReturnType<typeof vi.fn>, base: Record<string, string> = {}) {
  const updater = setErrors.mock.calls.at(-1)?.[0] as (e: Record<string, string>) => Record<string, string>;
  return updater(base);
}

describe('useDateRangeValidation — handleYearChange (keystroke-level)', () => {
  it('leaves an unrelated error untouched while the year is still partial (< 4 digits)', () => {
    const { result, setErrors } = setup([{ startDate: '' }]);
    act(() => result.current.handleYearChange(0, 'startDate', '202'));
    expect(applyUpdate(setErrors, { '0.startDate': 'Start date is required' }))
      .toEqual({ '0.startDate': 'Start date is required' });
  });

  it('clears a stale "Year must be" range error while the year is still partial', () => {
    const { result, setErrors } = setup([{ startDate: '' }]);
    act(() => result.current.handleYearChange(0, 'startDate', '202'));
    expect(applyUpdate(setErrors, { '0.startDate': 'Year must be between 1950 and 2030' }))
      .toEqual({ '0.startDate': '' });
  });

  it('sets a range error when the year exceeds maxYear', () => {
    const { result, setErrors } = setup([{ startDate: '' }], { maxYear: 2026 });
    act(() => result.current.handleYearChange(0, 'startDate', '2027'));
    expect(applyUpdate(setErrors)).toEqual({ '0.startDate': 'Year must be between 1950 and 2026' });
  });

  it('sets a range error when the year is below minYear', () => {
    const { result, setErrors } = setup([{ startDate: '' }], { minYear: 1980 });
    act(() => result.current.handleYearChange(0, 'startDate', '1975'));
    expect(applyUpdate(setErrors)).toEqual({ '0.startDate': 'Year must be between 1980 and 2030' });
  });

  it('clears the range error once the year is back in bounds', () => {
    const { result, setErrors } = setup([{ startDate: '' }]);
    act(() => result.current.handleYearChange(0, 'startDate', '2020'));
    expect(applyUpdate(setErrors)).toEqual({ '0.startDate': '' });
  });

  it('ignores a non-numeric 4+ character year', () => {
    const { result, setErrors } = setup([{ startDate: '' }]);
    act(() => result.current.handleYearChange(0, 'startDate', 'abcd'));
    expect(setErrors).not.toHaveBeenCalled();
  });

  it('keys the error by field index and start/end, not just the entry', () => {
    const { result, setErrors } = setup([{ startDate: '' }], { maxYear: 2026 });
    act(() => result.current.handleYearChange(2, 'endDate', '2027'));
    expect(applyUpdate(setErrors)).toEqual({ '2.endDate': 'Year must be between 1950 and 2026' });
  });
});

describe('useDateRangeValidation — handleDateBlur required-field enforcement', () => {
  it('requires a start date when both month and year are empty', () => {
    const { result, setErrors } = setup([{ startDate: '' }]);
    act(() => result.current.handleDateBlur(0, 'startDate', '', ''));
    expect(applyUpdate(setErrors)).toEqual({ '0.startDate': 'Start date is required' });
  });

  it('requires an end date on a non-current entry when both fields are empty', () => {
    const { result, setErrors } = setup([{ startDate: '2020-01', isCurrent: false }]);
    act(() => result.current.handleDateBlur(0, 'endDate', '', ''));
    expect(applyUpdate(setErrors)).toEqual({ '0.endDate': 'End date is required' });
  });

  it('does not require an end date on a currently-active entry', () => {
    const { result, setErrors } = setup([{ startDate: '2020-01', isCurrent: true }]);
    act(() => result.current.handleDateBlur(0, 'endDate', '', ''));
    expect(applyUpdate(setErrors)).toEqual({ '0.endDate': '' });
  });
});

describe('useDateRangeValidation — handleDateBlur year-range at blur', () => {
  it('rejects a year above maxYear', () => {
    const { result, setErrors } = setup([{ startDate: '' }], { maxYear: 2026 });
    act(() => result.current.handleDateBlur(0, 'startDate', '01', '2027'));
    expect(applyUpdate(setErrors)).toEqual({ '0.startDate': 'Year must be between 1950 and 2026' });
  });

  it('clears a stale required error once a valid year is entered', () => {
    const { result, setErrors } = setup([{ startDate: '' }]);
    act(() => result.current.handleDateBlur(0, 'startDate', '01', '2020'));
    expect(applyUpdate(setErrors, { '0.startDate': 'Start date is required' })).toEqual({ '0.startDate': '' });
  });
});

describe('useDateRangeValidation — handleDateBlur end-before-start (work history: requires month on both sides)', () => {
  it('rejects an end date before the start date when both have a month', () => {
    const { result, setErrors } = setup([{ startDate: '2020-06' }]);
    act(() => result.current.handleDateBlur(0, 'endDate', '01', '2020'));
    expect(applyUpdate(setErrors)).toEqual({ '0.endDate': 'End date cannot be before start date' });
  });

  it('accepts an end date on or after the start date without setting a new error', () => {
    const { result, setErrors } = setup([{ startDate: '2020-06' }]);
    act(() => result.current.handleDateBlur(0, 'endDate', '06', '2020'));
    // The valid-range branch only clears a stale *required* message — from
    // an empty base there's nothing to clear, so the map stays unchanged.
    expect(applyUpdate(setErrors)).toEqual({});
  });

  it('clears a stale end-before-start conflict error once the range becomes valid', () => {
    const { result, setErrors } = setup([{ startDate: '2020-06' }]);
    act(() => result.current.handleDateBlur(0, 'endDate', '06', '2020'));
    // Only "Start/End date is required" is treated as stale-clearable here —
    // a stale conflict message is left untouched by this branch, since the
    // real components always re-run full validate() at save time regardless.
    expect(applyUpdate(setErrors, { '0.endDate': 'End date cannot be before start date' }))
      .toEqual({ '0.endDate': 'End date cannot be before start date' });
  });

  it('skips the end-before-start check entirely when the end date has no month yet (in-progress typing)', () => {
    const { result, setErrors } = setup([{ startDate: '2025-01' }]);
    act(() => result.current.handleDateBlur(0, 'endDate', '', '2020'));
    // No month on the end date and allowYearOnlyEnd is off (work-history
    // mode) — this is treated as still-typing, not a validatable range yet.
    expect(applyUpdate(setErrors)).toEqual({});
  });
});

describe('useDateRangeValidation — handleDateBlur end-before-start (education: allowYearOnlyEnd)', () => {
  it('pads a year-only end date to "-12" and a year-only start date to "-01" before comparing', () => {
    const { result, setErrors } = setup([{ startDate: '2020' }], { allowYearOnlyEnd: true });
    // end "2019" -> "2019-12" vs start "2020" -> "2020-01": end is earlier.
    act(() => result.current.handleDateBlur(0, 'endDate', '', '2019'));
    expect(applyUpdate(setErrors)).toEqual({ '0.endDate': 'End date cannot be before start date' });
  });

  it('accepts a year-only end date in the same year as a year-only start date', () => {
    const { result, setErrors } = setup([{ startDate: '2020' }], { allowYearOnlyEnd: true });
    // end "2020" -> "2020-12" vs start "2020" -> "2020-01": end is later.
    act(() => result.current.handleDateBlur(0, 'endDate', '', '2020'));
    expect(applyUpdate(setErrors)).toEqual({});
  });

  it('compares a year-only end date against a full YYYY-MM start date without padding the start', () => {
    const { result, setErrors } = setup([{ startDate: '2020-06' }], { allowYearOnlyEnd: true });
    // end "2020" -> "2020-12" vs start already "2020-06": end is later.
    act(() => result.current.handleDateBlur(0, 'endDate', '', '2020'));
    expect(applyUpdate(setErrors)).toEqual({});
  });

  it('still validates normally when the end date does have a month, even with allowYearOnlyEnd on', () => {
    const { result, setErrors } = setup([{ startDate: '2020-06' }], { allowYearOnlyEnd: true });
    act(() => result.current.handleDateBlur(0, 'endDate', '01', '2020'));
    expect(applyUpdate(setErrors)).toEqual({ '0.endDate': 'End date cannot be before start date' });
  });

  it('does nothing when there is no start date yet to compare against', () => {
    const { result, setErrors } = setup([{ startDate: '' }], { allowYearOnlyEnd: true });
    act(() => result.current.handleDateBlur(0, 'endDate', '', '2019'));
    expect(applyUpdate(setErrors)).toEqual({});
  });
});

describe('useDateRangeValidation — handleDateBlur partial/in-progress input', () => {
  it('clears a stale required error on partial input without setting a new error', () => {
    const { result, setErrors } = setup([{ startDate: '' }]);
    act(() => result.current.handleDateBlur(0, 'startDate', '06', '')); // month picked, year not yet typed
    expect(applyUpdate(setErrors, { '0.startDate': 'Start date is required' })).toEqual({ '0.startDate': '' });
  });

  it('leaves an unrelated existing error untouched on partial input', () => {
    const { result, setErrors } = setup([{ startDate: '' }]);
    act(() => result.current.handleDateBlur(0, 'startDate', '06', ''));
    expect(applyUpdate(setErrors, { '0.startDate': 'Year must be between 1950 and 2030' }))
      .toEqual({ '0.startDate': 'Year must be between 1950 and 2030' });
  });
});
