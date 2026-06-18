import type { Profile } from '../types/profile';

export function resolveProfileValue(profile: Profile, fieldPath: string): string {
  if (!fieldPath) return '';

  // Special cases that need non-trivial handling
  switch (fieldPath) {
    case 'personal.phone.number':
      return profile.personal?.phone?.number ?? '';

    case 'personal.phone.callingCode':
      return profile.personal?.phone?.callingCode ?? '';

    case 'derived.totalExperience.years': {
      const years = profile.derived?.totalExperience?.years;
      return years != null ? String(years) : '';
    }

    case 'workAuthorization': {
      const entry = profile.workAuthorization?.[0];
      if (!entry) return '';
      return entry.status === 'requires_sponsorship'
        ? 'Requires sponsorship'
        : 'Yes, authorized to work';
    }

    case 'salary.expected': {
      const entry = profile.salary?.expected?.[0];
      return entry?.amount != null ? String(entry.amount) : '';
    }
  }

  // Generic dot-notation traversal for all other paths
  const parts = fieldPath.split('.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = profile;
  for (const part of parts) {
    if (current == null) return '';
    current = current[part];
  }

  if (current == null) return '';
  if (typeof current === 'number') return String(current);
  if (typeof current === 'string') return current;
  return '';
}
