import type { Dispatch, SetStateAction } from 'react';

interface UseDateRangeValidationOptions {
  minYear: number;
  maxYear: number;
  // When true, an end date lacking a month (YYYY only) is compared against
  // the start date with padding (end → "-12", start → "-01" if it too has
  // no month) rather than skipping the end-before-start check whenever the
  // end date has no month at all. Education accepts year-only dates; Work
  // History requires YYYY-MM for both start and end — see CLAUDE.md's
  // "Profile date formats are NOT unified" domain rule.
  allowYearOnlyEnd?: boolean;
}

// Shared by WorkHistorySection and EducationSection, whose date-range
// validation only ever differed in year bounds and the year-only-end-date
// handling above — same keystroke/blur/save-time state machine otherwise.
export function useDateRangeValidation<T extends { startDate: string; isCurrent?: boolean }>(
  entries: T[],
  setErrors: Dispatch<SetStateAction<Record<string, string>>>,
  { minYear, maxYear, allowYearOnlyEnd = false }: UseDateRangeValidationOptions,
) {
  // Year-only validation for MonthYearPicker's onYearChange: validates the
  // year range even before a month is selected (fires on every keystroke).
  const handleYearChange = (idx: number, key: 'startDate' | 'endDate', year: string) => {
    const ek = `${idx}.${key}`;
    if (year.length < 4) {
      setErrors((e) => {
        const cur = e[ek] ?? '';
        return cur.startsWith('Year must be') ? { ...e, [ek]: '' } : e;
      });
      return;
    }
    const y = parseInt(year, 10);
    if (isNaN(y)) return;
    const err = y > maxYear || y < minYear
      ? `Year must be between ${minYear} and ${maxYear}`
      : '';
    setErrors((e) => ({ ...e, [ek]: err }));
  };

  // Blur handler for the full month+year group (fires when focus leaves the picker).
  // Validation order: required (both empty) → year range (year present).
  const handleDateBlur = (idx: number, key: 'startDate' | 'endDate', month: string, year: string) => {
    const ek = `${idx}.${key}`;
    const isRequired = key === 'startDate' || !entries[idx].isCurrent;

    if (!month && !year.trim()) {
      // Both fields empty
      setErrors((e) => ({
        ...e,
        [ek]: isRequired
          ? (key === 'startDate' ? 'Start date is required' : 'End date is required')
          : '',
      }));
      return;
    }

    if (year.length === 4) {
      const y = parseInt(year, 10);
      if (!isNaN(y) && (y > maxYear || y < minYear)) {
        setErrors((e) => ({ ...e, [ek]: `Year must be between ${minYear} and ${maxYear}` }));
        return;
      }
      // End date before start date.
      if (key === 'endDate') {
        const startDate = entries[idx].startDate;
        if (allowYearOnlyEnd) {
          // Supports both YYYY and YYYY-MM — compare on YYYY-MM with
          // end-padded to "-12" and start-padded to "-01" when month is
          // missing, so partial dates don't generate false errors.
          if (startDate) {
            const endNorm   = month ? `${year}-${month}` : `${year}-12`;
            const startNorm = startDate.length === 7 ? startDate : `${startDate}-01`;
            if (endNorm < startNorm) {
              setErrors((e) => ({ ...e, [ek]: 'End date cannot be before start date' }));
              return;
            }
          }
        } else if (month && startDate && `${year}-${month}` < startDate) {
          setErrors((e) => ({ ...e, [ek]: 'End date cannot be before start date' }));
          return;
        }
      }
      // Year is valid — clear any stale required error (user has entered something)
      setErrors((e) => {
        const cur = e[ek] ?? '';
        return (cur === 'Start date is required' || cur === 'End date is required')
          ? { ...e, [ek]: '' }
          : e;
      });
      return;
    }

    // Partial year or month-only: in-progress — clear stale required errors only
    setErrors((e) => {
      const cur = e[ek] ?? '';
      return (cur === 'Start date is required' || cur === 'End date is required')
        ? { ...e, [ek]: '' }
        : e;
    });
  };

  return { handleYearChange, handleDateBlur };
}
