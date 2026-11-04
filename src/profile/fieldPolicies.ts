import { WORK_AUTH_STATUS_LABELS } from '../data/workAuthorization';
import { LANGUAGE_PROFICIENCY_LABELS } from '../data/languages';
import type { ProfileStoragePath } from './fieldCatalog';
import { ETHNICITIES } from '../data/ethnicities';

export type AIFieldScope =
  | 'public'
  | 'never'
  | 'birth'
  | 'age'
  | 'gender'
  | 'ethnicity'
  | 'veteran'
  | 'disability';
export interface ProfileFieldPolicy {
  type: 'string' | 'number' | 'boolean';
  backup: boolean;
  validate: boolean;
  resume: boolean;
  autofill: AIFieldScope;
  maxLength?: number;
  minLength?: number;
  options?: readonly string[];
}
export const PERSONAL_GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
] as const;
export const PERSONAL_YES_NO_OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
] as const;
export const WORK_ARRANGEMENTS = ['onsite', 'remote', 'hybrid'] as const;
export const SALARY_PERIOD_OPTIONS = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'annual', label: 'Annual' },
] as const;
export const NOTICE_PERIOD_OPTIONS = [
  { value: 'day', label: 'days' },
  { value: 'week', label: 'weeks' },
  { value: 'month', label: 'months' },
] as const;
export const URL_MAX_LENGTH = 2048;
const text: ProfileFieldPolicy = {
  type: 'string',
  backup: true,
  validate: true,
  resume: true,
  autofill: 'public',
};
const number: ProfileFieldPolicy = { ...text, type: 'number' };
const flag: ProfileFieldPolicy = { ...text, type: 'boolean' };

// Every storage field needs an explicit decision for each consumer. New fields
// cannot inherit permission to leave the browser through an unreviewed default.
export const PROFILE_FIELD_POLICIES = {
  'personal.firstName': { ...text, maxLength: 100 },
  'personal.lastName': { ...text, maxLength: 100 },
  'personal.nickname': { ...text, maxLength: 100 },
  'personal.email': { ...text, maxLength: 254 },
  'personal.phone.countryCode': text,
  'personal.phone.callingCode': text,
  'personal.phone.number': { ...text, maxLength: 15, minLength: 4 },
  'personal.dateOfBirth': { ...text, autofill: 'birth' },
  'personal.gender': {
    ...text,
    autofill: 'gender',
    options: PERSONAL_GENDER_OPTIONS.map((item) => item.value),
  },
  'personal.ethnicity': {
    ...text,
    autofill: 'ethnicity',
    options: [...ETHNICITIES, 'prefer_not_to_say'],
  },
  'personal.veteranStatus': {
    ...text,
    autofill: 'veteran',
    options: PERSONAL_YES_NO_OPTIONS.map((item) => item.value),
  },
  'personal.disabilityStatus': {
    ...text,
    autofill: 'disability',
    options: PERSONAL_YES_NO_OPTIONS.map((item) => item.value),
  },
  'address.country': { ...text, maxLength: 100 },
  'address.postalCode': { ...text, maxLength: 20 },
  'address.street': { ...text, maxLength: 255 },
  'address.city': { ...text, maxLength: 100 },
  'address.state': { ...text, maxLength: 100 },
  'workAuthorization.$.country': text,
  'workAuthorization.$.status': { ...text, options: Object.keys(WORK_AUTH_STATUS_LABELS) },
  'workAuthorization.$.visaType': { ...text, maxLength: 100 },
  'workAuthorization.$.expiryDate': text,
  'professional.summary': { ...text, maxLength: 2000 },
  'professional.noticePeriod.immediate': flag,
  'professional.noticePeriod.value': number,
  'professional.noticePeriod.unit': {
    ...text,
    options: NOTICE_PERIOD_OPTIONS.map((item) => item.value),
  },
  'workHistory.$.company': { ...text, maxLength: 150 },
  'workHistory.$.title': { ...text, maxLength: 150 },
  'workHistory.$.location.countryCode': text,
  'workHistory.$.location.city': { ...text, maxLength: 100 },
  'workHistory.$.arrangement': { ...text, options: WORK_ARRANGEMENTS },
  'workHistory.$.startDate': text,
  'workHistory.$.endDate': text,
  'workHistory.$.isCurrent': flag,
  'workHistory.$.description': { ...text, maxLength: 3000 },
  'education.$.institution': { ...text, maxLength: 150 },
  'education.$.degree': { ...text, maxLength: 150 },
  'education.$.fieldOfStudy': { ...text, maxLength: 150 },
  'education.$.startDate': text,
  'education.$.endDate': text,
  'education.$.isCurrent': flag,
  'education.$.grade': { ...text, maxLength: 100 },
  'education.$.description': { ...text, maxLength: 3000 },
  'languages.$.language': text,
  'languages.$.proficiency': { ...text, options: Object.keys(LANGUAGE_PROFICIENCY_LABELS) },
  'links.linkedin': { ...text, maxLength: URL_MAX_LENGTH },
  'links.portfolio': { ...text, maxLength: URL_MAX_LENGTH },
  'links.github': { ...text, maxLength: URL_MAX_LENGTH },
  'links.twitter': { ...text, maxLength: URL_MAX_LENGTH },
  'links.dribbble': { ...text, maxLength: URL_MAX_LENGTH },
  'links.behance': { ...text, maxLength: URL_MAX_LENGTH },
  'links.custom.$.label': { ...text, maxLength: 100 },
  'links.custom.$.url': { ...text, maxLength: URL_MAX_LENGTH },
  'documents.cv.url': { ...text, resume: false, maxLength: URL_MAX_LENGTH },
  'documents.coverLetter.url': { ...text, resume: false, maxLength: URL_MAX_LENGTH },
  'salary.current.amount': number,
  'salary.current.currency': text,
  'salary.current.period': { ...text, options: SALARY_PERIOD_OPTIONS.map((item) => item.value) },
  'salary.expected.$.amount': { ...number, resume: false },
  'salary.expected.$.currency': { ...text, resume: false },
  'salary.expected.$.period': {
    ...text,
    resume: false,
    options: SALARY_PERIOD_OPTIONS.map((item) => item.value),
  },
  id: { ...text, autofill: 'never', resume: false, maxLength: 200 },
  'salary.current.country': text,
  'salary.expected.$.country': { ...text, resume: false },
  'documents.cv.file.name': { ...text, resume: false, autofill: 'never' },
  'documents.cv.file.size': { ...number, resume: false, autofill: 'never' },
  'documents.cv.file.base64': { ...text, resume: false, autofill: 'never' },
  'documents.coverLetter.file.name': { ...text, resume: false, autofill: 'never' },
  'documents.coverLetter.file.size': { ...number, resume: false, autofill: 'never' },
  'documents.coverLetter.file.base64': { ...text, resume: false, autofill: 'never' },
  'derived.fullName': { ...text, validate: false, resume: false },
  'derived.currentTitle': { ...text, validate: false, resume: false },
  'derived.currentCompany': { ...text, validate: false, resume: false },
  'derived.age': { ...number, validate: false, resume: false, autofill: 'age' },
  'derived.totalExperience.totalMonths': { ...number, validate: false, resume: false },
  'derived.totalExperience.years': { ...number, validate: false, resume: false },
  'derived.totalExperience.months': { ...number, validate: false, resume: false },
  'derived.totalExperience.label': { ...text, validate: false, resume: false },
} satisfies Record<ProfileStoragePath, ProfileFieldPolicy>;
export function profileFieldPolicy(path: ProfileStoragePath): ProfileFieldPolicy {
  return PROFILE_FIELD_POLICIES[path];
}
export function profileTextLimit(path: ProfileStoragePath): number {
  const limit = profileFieldPolicy(path).maxLength;
  if (limit === undefined) throw new Error('No text limit for ' + path);
  return limit;
}
export const BACKUP_PROFILE_PATHS = (
  Object.keys(PROFILE_FIELD_POLICIES) as ProfileStoragePath[]
).filter((path) => profileFieldPolicy(path).backup);
export const RESUME_PROFILE_PATHS = (
  Object.keys(PROFILE_FIELD_POLICIES) as ProfileStoragePath[]
).filter((path) => profileFieldPolicy(path).resume);

export const PROFILE_POLICY_PATHS = Object.keys(PROFILE_FIELD_POLICIES) as ProfileStoragePath[];
