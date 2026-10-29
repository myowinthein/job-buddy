import type { Profile } from '../types/profile';

// Project known fields without revalidating older, still-supported values.
// Backups preserve document bytes and derived fields, never unknown properties.
type Shape = true | { [key: string]: Shape } | [Shape];
const shape: Shape = {
  id: true,
  personal: {
    firstName: true,
    lastName: true,
    nickname: true,
    email: true,
    phone: { countryCode: true, callingCode: true, number: true },
    dateOfBirth: true,
    gender: true,
    ethnicity: true,
    veteranStatus: true,
    disabilityStatus: true,
  },
  address: { city: true, country: true, street: true, state: true, postalCode: true },
  professional: { summary: true, noticePeriod: { immediate: true, value: true, unit: true } },
  salary: {
    current: { amount: true, currency: true, country: true, period: true },
    expected: [{ amount: true, currency: true, country: true, period: true }],
  },
  workAuthorization: [{ country: true, status: true, visaType: true, expiryDate: true }],
  workHistory: [
    {
      company: true,
      title: true,
      startDate: true,
      isCurrent: true,
      endDate: true,
      location: { countryCode: true, city: true },
      arrangement: true,
      description: true,
    },
  ],
  education: [
    {
      institution: true,
      degree: true,
      fieldOfStudy: true,
      startDate: true,
      isCurrent: true,
      endDate: true,
      grade: true,
      description: true,
    },
  ],
  languages: [{ language: true, proficiency: true }],
  links: {
    linkedin: true,
    portfolio: true,
    github: true,
    twitter: true,
    dribbble: true,
    behance: true,
    custom: [{ label: true, url: true }],
  },
  documents: {
    cv: { url: true, file: { name: true, size: true, base64: true } },
    coverLetter: { url: true, file: { name: true, size: true, base64: true } },
  },
  derived: {
    fullName: true,
    currentTitle: true,
    currentCompany: true,
    age: true,
    totalExperience: { totalMonths: true, years: true, months: true, label: true },
  },
};

function project(value: unknown, fields: Shape): unknown {
  if (value == null) return value;
  if (fields === true) return typeof value === 'object' ? undefined : value;
  if (Array.isArray(fields)) {
    return Array.isArray(value) ? value.map((item) => project(item, fields[0])) : undefined;
  }
  // Legacy phones and work locations can still be strings.
  if (Array.isArray(value)) return undefined;
  if (typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([key]) => Object.hasOwn(record, key))
      .map(([key, child]) => [key, project(record[key], child)]),
  );
}

export function profileData<T extends Partial<Profile>>(profile: T): T {
  return project(profile, shape) as T;
}

/** Warn about credential settings without ever rendering their values. */
export function hasCredentialSettings(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(
    ([key, child]) =>
      /^(geminiApiKey|geminiModel|geminiSettingsMeta|driveToken|apiKey)$/i.test(key) ||
      hasCredentialSettings(child),
  );
}
