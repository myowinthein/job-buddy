import { describe, it, expect, vi } from 'vitest';
import { calculateExperience } from './experience';

describe('calculateExperience', () => {
  it('returns zero summary for undefined input', () => {
    const result = calculateExperience(undefined);
    expect(result.totalMonths).toBe(0);
    expect(result.label).toBe('No experience recorded yet');
  });

  it('returns zero summary for an empty array', () => {
    const result = calculateExperience([]);
    expect(result.totalMonths).toBe(0);
    expect(result.years).toBe(0);
    expect(result.months).toBe(0);
  });

  it('calculates a simple non-current job', () => {
    const result = calculateExperience([
      { company: 'Acme', title: 'Dev', startDate: '2020-01', endDate: '2021-01', isCurrent: false },
    ]);
    expect(result.totalMonths).toBe(12);
    expect(result.years).toBe(1);
    expect(result.months).toBe(0);
    expect(result.label).toBe('1 year');
  });

  it('uses singular "month" for 1 month', () => {
    const result = calculateExperience([
      { company: 'Acme', title: 'Dev', startDate: '2020-01', endDate: '2020-02', isCurrent: false },
    ]);
    expect(result.totalMonths).toBe(1);
    expect(result.label).toBe('1 month');
  });

  it('uses plural "months" for multiple months', () => {
    const result = calculateExperience([
      { company: 'Acme', title: 'Dev', startDate: '2020-01', endDate: '2020-07', isCurrent: false },
    ]);
    expect(result.label).toBe('6 months');
  });

  it('labels combined years and months', () => {
    const result = calculateExperience([
      { company: 'Acme', title: 'Dev', startDate: '2020-01', endDate: '2022-07', isCurrent: false },
    ]);
    expect(result.years).toBe(2);
    expect(result.months).toBe(6);
    expect(result.label).toBe('2 years 6 months');
  });

  it('merges overlapping intervals, counting shared time only once', () => {
    const result = calculateExperience([
      { company: 'A', title: 'Dev', startDate: '2020-01', endDate: '2021-06', isCurrent: false },
      { company: 'B', title: 'Dev', startDate: '2021-01', endDate: '2022-01', isCurrent: false },
    ]);
    // Merged: 2020-01 to 2022-01 = 24 months
    expect(result.totalMonths).toBe(24);
  });

  it('adds non-overlapping intervals independently', () => {
    const result = calculateExperience([
      { company: 'A', title: 'Dev', startDate: '2020-01', endDate: '2020-07', isCurrent: false },
      { company: 'B', title: 'Dev', startDate: '2021-01', endDate: '2021-07', isCurrent: false },
    ]);
    expect(result.totalMonths).toBe(12);
  });

  it('skips entries with a missing startDate', () => {
    const result = calculateExperience([
      { company: 'A', title: 'Dev', startDate: '', endDate: '2021-01', isCurrent: false },
    ]);
    expect(result.totalMonths).toBe(0);
  });

  it('skips entries with an invalid startDate', () => {
    const result = calculateExperience([
      { company: 'A', title: 'Dev', startDate: 'not-a-date', endDate: '2021-01', isCurrent: false },
    ]);
    expect(result.totalMonths).toBe(0);
  });

  it('skips entries where endDate is before startDate', () => {
    const result = calculateExperience([
      { company: 'A', title: 'Dev', startDate: '2021-06', endDate: '2020-01', isCurrent: false },
    ]);
    expect(result.totalMonths).toBe(0);
  });

  it('calculates a current job up to the mocked present', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01'));

    const result = calculateExperience([
      { company: 'Acme', title: 'Dev', startDate: '2022-01', isCurrent: true },
    ]);
    // 2022-01 to 2024-01 = 24 months
    expect(result.totalMonths).toBe(24);

    vi.useRealTimers();
  });

  it('skips a current job with a missing endDate that also has no valid start', () => {
    const result = calculateExperience([
      { company: 'A', title: 'Dev', startDate: '', isCurrent: true },
    ]);
    expect(result.totalMonths).toBe(0);
  });
});
