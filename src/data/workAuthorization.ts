import type { WorkAuthorizationStatus } from '../types/profile';

// The single source of truth — an exhaustive object literal typed as
// Record<WorkAuthorizationStatus, string>. Unlike deriving this from an
// array via Object.fromEntries + a cast, TypeScript itself rejects a build
// where a WorkAuthorizationStatus union member is missing a label here.
export const WORK_AUTH_STATUS_LABELS: Record<WorkAuthorizationStatus, string> = {
  citizen_or_pr:        'Citizen / Permanent Resident',
  work_visa:            'Authorized to work without sponsorship',
  requires_sponsorship: 'Requires Sponsorship',
};

export interface WorkAuthStatusOption {
  value: WorkAuthorizationStatus;
  label: string;
}

// Preserves WORK_AUTH_STATUS_LABELS' key order (dropdown display order).
export const WORK_AUTH_STATUS_OPTIONS: WorkAuthStatusOption[] = (
  Object.keys(WORK_AUTH_STATUS_LABELS) as WorkAuthorizationStatus[]
).map((value) => ({ value, label: WORK_AUTH_STATUS_LABELS[value] }));
