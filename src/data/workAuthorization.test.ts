import { describe, it, expect } from 'vitest';
import { WORK_AUTH_STATUS_OPTIONS, WORK_AUTH_STATUS_LABELS } from './workAuthorization';

describe('WORK_AUTH_STATUS_LABELS', () => {
  it('names each status as shown to the user', () => {
    expect(WORK_AUTH_STATUS_LABELS).toEqual({
      citizen_or_pr: 'Citizen / Permanent Resident',
      work_visa: 'Authorized to work without sponsorship',
      requires_sponsorship: 'Requires Sponsorship',
    });
  });

  it('labels each option with its status label, in the same order', () => {
    expect(WORK_AUTH_STATUS_OPTIONS).toEqual([
      { value: 'citizen_or_pr', label: 'Citizen / Permanent Resident' },
      { value: 'work_visa', label: 'Authorized to work without sponsorship' },
      { value: 'requires_sponsorship', label: 'Requires Sponsorship' },
    ]);
  });
});
