import type { Profile } from '../types/profile';
import type { AIFieldPayload } from './types';
import { profileData } from '../utils/profileData';

/** Document bytes never help resolve a form control. Sensitive details are
 * included only when one of the fields actually asks for that information. */
export function autofillProfilePayload(
  profile: Partial<Profile>,
  fields: AIFieldPayload[],
): Partial<Profile> {
  const safe = profileData(profile);
  const { id: _id, documents, personal, derived, ...rest } = safe;
  const text = fields
    .map((field) => [field.label, field.name, field.placeholder].filter(Boolean).join(' '))
    .join(' ');
  const { dateOfBirth, gender, ethnicity, veteranStatus, disabilityStatus, ...contact } =
    personal ?? {};
  const { age, ...professionalDerived } = derived ?? {};
  const birthRequested = /\b(birth|dob|age)\b/i.test(text);
  return {
    ...rest,
    ...(personal && {
      personal: {
        ...contact,
        ...(birthRequested && { dateOfBirth }),
        ...(/\b(gender|sex)\b/i.test(text) && { gender }),
        ...(/\b(ethnicity|ethnic|race|racial)\b/i.test(text) && { ethnicity }),
        ...(/\bveteran\b/i.test(text) && { veteranStatus }),
        ...(/\b(disability|disabled)\b/i.test(text) && { disabilityStatus }),
      } as Profile['personal'],
    }),
    ...(derived && {
      derived: { ...professionalDerived, ...(birthRequested && { age }) } as Profile['derived'],
    }),
    ...(documents && {
      documents: {
        cv: { url: documents.cv?.url },
        ...(documents.coverLetter && { coverLetter: { url: documents.coverLetter.url } }),
      },
    }),
  };
}
