import type { Profile } from '../types/profile';
import type { AIFieldPayload } from './types';
import { calculateDerivedFields } from '../utils/derivedFields';
import { profileData } from '../utils/profileData';

/** Document bytes never help resolve a form control. Sensitive details are
 * included only when one of the fields actually asks for that information. */
export function autofillProfilePayload(
  profile: Partial<Profile>,
  fields: AIFieldPayload[],
): Partial<Profile> {
  const safe = profileData(profile);
  let refreshed = safe.derived;
  try {
    refreshed = calculateDerivedFields(safe as Profile);
  } catch {
    /* Partial profiles remain usable. */
  }
  const { id: _id, documents, personal, derived: _derived, ...rest } = safe;
  const derived = refreshed;
  const text = fields
    .map((field) =>
      [field.visibleLabel ?? field.label, field.placeholder].filter(Boolean).join(' '),
    )
    .join(' ');
  const { dateOfBirth, gender, ethnicity, veteranStatus, disabilityStatus, ...contact } =
    personal ?? {};
  const { age, ...professionalDerived } = derived ?? {};
  const birthRequested = /\b(birth|dob)\b/i.test(text);
  const ageRequested = /\bage\b/i.test(text);
  return boundProfile({
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
      derived: {
        ...professionalDerived,
        ...((birthRequested || ageRequested) && { age }),
      } as Profile['derived'],
    }),
    ...rest,
    ...(documents && {
      documents: {
        cv: { url: documents.cv?.url },
        ...(documents.coverLetter && { coverLetter: { url: documents.coverLetter.url } }),
      },
    }),
  });
}

// Bound request content without changing stored data or array indices. Long prose
// is only context for matching: accepted paths still resolve the original value.
export const MAX_AI_PROFILE_BYTES = 48_000;
export const MAX_AI_CONTEXT_CHARS = 2_000;
function boundProfile(profile: Partial<Profile>): Partial<Profile> {
  let remaining = MAX_AI_PROFILE_BYTES - 4_000; // JSON keys, separators and containers.
  const encoder = new TextEncoder();
  function visit(value: unknown, key = ''): unknown {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'string') {
      const text = /^(description|summary)$/.test(key)
        ? value.slice(0, MAX_AI_CONTEXT_CHARS)
        : value;
      const bytes = encoder.encode(JSON.stringify(text)).length + encoder.encode(key).length + 8;
      if (bytes > remaining || text.length > 4_000) return undefined;
      remaining -= bytes;
      return text;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      remaining -= 32;
      return remaining >= 0 ? value : undefined;
    }
    if (Array.isArray(value)) return value.slice(0, 100).map((item) => visit(item) ?? null);
    if (typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value).flatMap(([name, item]) => {
          remaining -= encoder.encode(name).length + 4;
          const next = visit(item, name);
          return next === undefined ? [] : [[name, next]];
        }),
      );
    return undefined;
  }
  const result = visit(profile) as Partial<Profile>;
  return encoder.encode(JSON.stringify(result)).length <= MAX_AI_PROFILE_BYTES ? result : {};
}
