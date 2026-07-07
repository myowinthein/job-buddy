import { describe, it, expect } from 'vitest';
import { WORK_AUTH_STATUS_OPTIONS, WORK_AUTH_STATUS_LABELS } from './workAuthorization';

describe('WORK_AUTH_STATUS_OPTIONS', () => {
  it('contains exactly three entries', () => {
    expect(WORK_AUTH_STATUS_OPTIONS).toHaveLength(3);
  });

  it('covers all expected status values', () => {
    const values = WORK_AUTH_STATUS_OPTIONS.map(o => o.value);
    expect(values).toContain('citizen_or_pr');
    expect(values).toContain('work_visa');
    expect(values).toContain('requires_sponsorship');
  });

  it('every option has a non-empty label', () => {
    WORK_AUTH_STATUS_OPTIONS.forEach(o => {
      expect(o.label.trim()).not.toBe('');
    });
  });
});

describe('WORK_AUTH_STATUS_LABELS', () => {
  it('is derived consistently from WORK_AUTH_STATUS_OPTIONS', () => {
    WORK_AUTH_STATUS_OPTIONS.forEach(o => {
      expect(WORK_AUTH_STATUS_LABELS[o.value]).toBe(o.label);
    });
  });

  it('contains exactly the keys present in OPTIONS', () => {
    const optionValues = WORK_AUTH_STATUS_OPTIONS.map(o => o.value).sort();
    const labelKeys    = Object.keys(WORK_AUTH_STATUS_LABELS).sort();
    expect(labelKeys).toEqual(optionValues);
  });
});
