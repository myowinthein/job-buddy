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
    expect(result.totalMonths).toBe(13);
    expect(result.years).toBe(1);
    expect(result.months).toBe(1);
    expect(result.label).toBe('1 year 1 month');
  });

  it('counts a single-month job as one month, not zero', () => {
    const result = calculateExperience([
      { company: 'Acme', title: 'Dev', startDate: '2020-05', endDate: '2020-05', isCurrent: false },
    ]);
    expect(result.totalMonths).toBe(1);
    expect(result.label).toBe('1 month');
  });

  it('uses plural "months" for multiple months', () => {
    const result = calculateExperience([
      { company: 'Acme', title: 'Dev', startDate: '2020-01', endDate: '2020-07', isCurrent: false },
    ]);
    expect(result.label).toBe('7 months');
  });

  it('labels combined years and months', () => {
    const result = calculateExperience([
      { company: 'Acme', title: 'Dev', startDate: '2020-01', endDate: '2022-07', isCurrent: false },
    ]);
    expect(result.years).toBe(2);
    expect(result.months).toBe(7);
    expect(result.label).toBe('2 years 7 months');
  });

  it('merges overlapping intervals, counting shared time only once', () => {
    const result = calculateExperience([
      { company: 'A', title: 'Dev', startDate: '2020-01', endDate: '2021-06', isCurrent: false },
      { company: 'B', title: 'Dev', startDate: '2021-01', endDate: '2022-01', isCurrent: false },
    ]);
    // Merged: 2020-01 to 2022-01 inclusive = 25 months
    expect(result.totalMonths).toBe(25);
  });

  it('adds contiguous non-overlapping intervals independently', () => {
    const result = calculateExperience([
      { company: 'A', title: 'Dev', startDate: '2020-01', endDate: '2020-06', isCurrent: false },
      { company: 'B', title: 'Dev', startDate: '2020-07', endDate: '2020-12', isCurrent: false },
    ]);
    // Each span is 6 months inclusive; contiguous with no gap, so the sum
    // matches what a single merged 2020-01..2020-12 interval would give.
    expect(result.totalMonths).toBe(12);
  });

  it('adds gapped non-overlapping intervals independently', () => {
    const result = calculateExperience([
      { company: 'A', title: 'Dev', startDate: '2020-01', endDate: '2020-07', isCurrent: false },
      { company: 'B', title: 'Dev', startDate: '2021-01', endDate: '2021-07', isCurrent: false },
    ]);
    expect(result.totalMonths).toBe(14);
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
    // 2022-01 to 2024-01 inclusive = 25 months
    expect(result.totalMonths).toBe(25);

    vi.useRealTimers();
  });

  it('counts inclusive calendar months across merged and gapped jobs, reference date 2026-10-07', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-07'));

    const result = calculateExperience([
      { company: 'SKYNET', title: 'Dev', startDate: '2013-01', endDate: '2014-05', isCurrent: false },
      { company: 'Global Wave Technology', title: 'Dev', startDate: '2014-06', endDate: '2016-05', isCurrent: false },
      { company: 'Nexlabs', title: 'Dev', startDate: '2016-06', endDate: '2018-10', isCurrent: false },
      { company: 'Better HR', title: 'Dev', startDate: '2018-11', endDate: '2019-11', isCurrent: false },
      { company: 'KBZ Bank', title: 'Dev', startDate: '2019-12', endDate: '2023-06', isCurrent: false },
      { company: 'Tesla Studio Global', title: 'Dev', startDate: '2024-02', isCurrent: true },
      { company: 'UniLinks', title: 'Dev', startDate: '2024-03', endDate: '2025-12', isCurrent: false },
    ]);
    // UniLinks (2024-03..2025-12) is fully inside Tesla's open-ended
    // interval, so it merges and contributes no extra months.
    expect(result.totalMonths).toBe(159);
    expect(result.label).toBe('13 years 3 months');

    vi.useRealTimers();
  });

  it('skips a current job with a missing endDate that also has no valid start', () => {
    const result = calculateExperience([
      { company: 'A', title: 'Dev', startDate: '', isCurrent: true },
    ]);
    expect(result.totalMonths).toBe(0);
  });
});
