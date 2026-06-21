import type { WorkAuthorizationStatus } from '../types/profile';

export interface WorkAuthStatusOption {
  value: WorkAuthorizationStatus;
  label: string;
}

export const WORK_AUTH_STATUS_OPTIONS: WorkAuthStatusOption[] = [
  { value: 'citizen_or_pr',        label: 'Citizen / Permanent Resident'            },
  { value: 'work_visa',            label: 'Authorized to work without sponsorship'  },
  { value: 'requires_sponsorship', label: 'Requires Sponsorship'                    },
];

export const WORK_AUTH_STATUS_LABELS: Record<WorkAuthorizationStatus, string> =
  Object.fromEntries(WORK_AUTH_STATUS_OPTIONS.map(o => [o.value, o.label])) as Record<WorkAuthorizationStatus, string>;
