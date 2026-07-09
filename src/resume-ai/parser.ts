import type {
  Profile,
  PhoneNumber,
  WorkHistoryEntry,
  EducationEntry,
  LanguageEntry,
  WorkAuthorizationEntry,
} from '@/src/types/profile';
import type { FieldChange, FieldStatus } from './types';

// ── Field descriptors ────────────────────────────────────────────────────────

export interface FieldDef {
  id: string;
  label: string;
  section: string;
  getValue(p: Partial<Profile>): unknown;
  setValue(p: Partial<Profile>, v: unknown): Partial<Profile>;
  isEmpty(v: unknown): boolean;
  display(v: unknown): string;
}

function emptyStr(v: unknown): boolean {
  return !v || (typeof v === 'string' && !v.trim());
}

function emptyArr(v: unknown): boolean {
  return !Array.isArray(v) || (v as unknown[]).length === 0;
}

/**
 * Returns a setValue implementation for a nested section field.
 * Handles the common `{ ...p, section: { ...p.section, field: v } }` spread
 * pattern so it doesn't have to be repeated inline for every FIELD_DEF entry.
 *
 * `K` — a top-level key of Profile that holds a plain object (personal, address, links, …)
 * `F` — a key within that object
 * `V` — the value type for the field
 *
 * The `fallback` parameter is the empty-object fallback used when `p[section]`
 * is undefined. For sections whose type has required fields (personal, address,
 * links) callers must supply `{} as Profile[K]` to satisfy TypeScript; for
 * fully-optional sections (professional) a plain `{}` suffices.
 */
function setNestedField<
  K extends keyof Profile,
  F extends keyof NonNullable<Profile[K]>,
>(
  section: K,
  field: F,
  fallback: NonNullable<Profile[K]>,
): FieldDef['setValue'] {
  return (p, v) => ({
    ...p,
    [section]: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...((p[section] as any) ?? fallback),
      [field]: v as NonNullable<Profile[K]>[F],
    },
  });
}

export const FIELD_DEFS: FieldDef[] = [
  // ── Personal ────────────────────────────────────────────────────────────────
  {
    id: 'personal.firstName',
    label: 'First Name',
    section: 'Personal',
    getValue: (p) => p.personal?.firstName ?? null,
    setValue: setNestedField('personal', 'firstName', {} as Profile['personal']),
    isEmpty: emptyStr,
    display: (v) => String(v ?? ''),
  },
  {
    id: 'personal.lastName',
    label: 'Last Name',
    section: 'Personal',
    getValue: (p) => p.personal?.lastName ?? null,
    setValue: setNestedField('personal', 'lastName', {} as Profile['personal']),
    isEmpty: emptyStr,
    display: (v) => String(v ?? ''),
  },
  {
    id: 'personal.email',
    label: 'Email',
    section: 'Personal',
    getValue: (p) => p.personal?.email ?? null,
    setValue: setNestedField('personal', 'email', {} as Profile['personal']),
    isEmpty: emptyStr,
    display: (v) => String(v ?? ''),
  },
  {
    id: 'personal.phone',
    label: 'Phone Number',
    section: 'Personal',
    getValue: (p) => p.personal?.phone ?? null,
    setValue: setNestedField('personal', 'phone', {} as Profile['personal']),
    isEmpty: (v) => {
      if (!v) return true;
      const ph = v as Partial<PhoneNumber>;
      return !ph.number?.trim();
    },
    display: (v) => {
      if (!v) return '';
      const ph = v as Partial<PhoneNumber>;
      return [ph.callingCode, ph.number].filter(Boolean).join(' ');
    },
  },
  {
    id: 'personal.dateOfBirth',
    label: 'Date of Birth',
    section: 'Personal',
    getValue: (p) => p.personal?.dateOfBirth ?? null,
    setValue: setNestedField('personal', 'dateOfBirth', {} as Profile['personal']),
    isEmpty: emptyStr,
    display: (v) => String(v ?? ''),
  },
  {
    id: 'personal.gender',
    label: 'Gender',
    section: 'Personal',
    getValue: (p) => p.personal?.gender ?? null,
    setValue: setNestedField('personal', 'gender', {} as Profile['personal']),
    isEmpty: emptyStr,
    display: (v) => String(v ?? '').replace(/_/g, ' '),
  },
  {
    id: 'personal.ethnicity',
    label: 'Ethnicity',
    section: 'Personal',
    getValue: (p) => p.personal?.ethnicity ?? null,
    setValue: setNestedField('personal', 'ethnicity', {} as Profile['personal']),
    isEmpty: emptyStr,
    display: (v) => String(v ?? ''),
  },
  {
    id: 'personal.veteranStatus',
    label: 'Veteran Status',
    section: 'Personal',
    getValue: (p) => p.personal?.veteranStatus ?? null,
    setValue: setNestedField('personal', 'veteranStatus', {} as Profile['personal']),
    isEmpty: emptyStr,
    display: (v) => String(v ?? '').replace(/_/g, ' '),
  },
  {
    id: 'personal.disabilityStatus',
    label: 'Disability Status',
    section: 'Personal',
    getValue: (p) => p.personal?.disabilityStatus ?? null,
    setValue: setNestedField('personal', 'disabilityStatus', {} as Profile['personal']),
    isEmpty: emptyStr,
    display: (v) => String(v ?? '').replace(/_/g, ' '),
  },
  // ── Address ─────────────────────────────────────────────────────────────────
  {
    id: 'address.city',
    label: 'City',
    section: 'Address',
    getValue: (p) => p.address?.city ?? null,
    setValue: setNestedField('address', 'city', {} as Profile['address']),
    isEmpty: emptyStr,
    display: (v) => String(v ?? ''),
  },
  {
    id: 'address.country',
    label: 'Country',
    section: 'Address',
    getValue: (p) => p.address?.country ?? null,
    setValue: setNestedField('address', 'country', {} as Profile['address']),
    isEmpty: emptyStr,
    display: (v) => String(v ?? ''),
  },
  {
    id: 'address.street',
    label: 'Street',
    section: 'Address',
    getValue: (p) => p.address?.street ?? null,
    setValue: setNestedField('address', 'street', {} as Profile['address']),
    isEmpty: emptyStr,
    display: (v) => String(v ?? ''),
  },
  {
    id: 'address.state',
    label: 'State / Province',
    section: 'Address',
    getValue: (p) => p.address?.state ?? null,
    setValue: setNestedField('address', 'state', {} as Profile['address']),
    isEmpty: emptyStr,
    display: (v) => String(v ?? ''),
  },
  {
    id: 'address.postalCode',
    label: 'Postal Code',
    section: 'Address',
    getValue: (p) => p.address?.postalCode ?? null,
    setValue: (p, v) => ({ ...p, address: { ...(p.address ?? {} as Profile['address']), postalCode: v as string } }),
    isEmpty: emptyStr,
    display: (v) => String(v ?? ''),
  },
  // ── Professional ─────────────────────────────────────────────────────────────
  {
    id: 'professional.summary',
    label: 'Career Summary',
    section: 'Professional',
    getValue: (p) => p.professional?.summary ?? null,
    setValue: (p, v) => ({ ...p, professional: { ...(p.professional ?? {}), summary: v as string } }),
    isEmpty: emptyStr,
    display: (v) => {
      const s = String(v ?? '');
      return s.length > 120 ? s.slice(0, 117) + '…' : s;
    },
  },
  {
    id: 'professional.noticePeriod',
    label: 'Notice Period',
    section: 'Professional',
    getValue: (p) => p.professional?.noticePeriod ?? null,
    setValue: (p, v) => ({ ...p, professional: { ...(p.professional ?? {}), noticePeriod: v as Profile['professional']['noticePeriod'] } }),
    isEmpty: (v) => !v || typeof v !== 'object',
    display: (v) => {
      if (!v || typeof v !== 'object') return '';
      const np = v as { immediate?: boolean; value?: number; unit?: string };
      if (np.immediate) return 'Immediate';
      if (np.value != null && np.unit) return `${np.value} ${np.unit}${np.value !== 1 ? 's' : ''}`;
      return '';
    },
  },
  // ── Salary ───────────────────────────────────────────────────────────────────
  {
    id: 'salary.current',
    label: 'Current Salary',
    section: 'Salary',
    getValue: (p) => p.salary?.current ?? null,
    setValue: (p, v) => ({
      ...p,
      salary: { current: v as Profile['salary']['current'], expected: p.salary?.expected ?? [] },
    }),
    isEmpty: (v) => {
      if (!v) return true;
      const s = v as Partial<Profile['salary']['current']>;
      return !s.amount && !s.currency;
    },
    display: (v) => {
      if (!v) return '';
      const s = v as Partial<Profile['salary']['current']>;
      const parts: string[] = [];
      if (s.amount != null) parts.push(String(s.amount));
      if (s.currency)       parts.push(s.currency);
      if (s.period)         parts.push(`(${s.period})`);
      return parts.join(' ');
    },
  },
  {
    id: 'salary.expected',
    label: 'Expected Salary',
    section: 'Salary',
    getValue: (p) => p.salary?.expected ?? [],
    setValue: (p, v) => ({
      ...p,
      salary: { ...(p.salary ?? { current: { amount: 0, currency: '', period: 'monthly' }, expected: [] }), expected: v as Profile['salary']['expected'] },
    }),
    isEmpty: emptyArr,
    display: (v) => {
      const arr = (v ?? []) as Profile['salary']['expected'];
      return arr.map((e) => {
        const parts: string[] = [];
        if (e.amount != null) parts.push(String(e.amount));
        if (e.currency)       parts.push(e.currency);
        if (e.period)         parts.push(`(${e.period})`);
        if (e.country)        parts.push(`(${e.country})`);
        return parts.join(' ');
      }).join('\n');
    },
  },
  // ── Work Authorization ───────────────────────────────────────────────────────
  {
    id: 'workAuthorization',
    label: 'Work Authorization',
    section: 'Work Authorization',
    getValue: (p) => p.workAuthorization ?? [],
    setValue: (p, v) => ({ ...p, workAuthorization: v as WorkAuthorizationEntry[] }),
    isEmpty: emptyArr,
    display: (v) => {
      const arr = (v ?? []) as WorkAuthorizationEntry[];
      return arr.map((e) => `${e.country} — ${e.status.replace(/_/g, ' ')}`).join('\n');
    },
  },
  // ── Work History ─────────────────────────────────────────────────────────────
  {
    id: 'workHistory',
    label: 'Work History',
    section: 'Work History',
    getValue: (p) => p.workHistory ?? [],
    setValue: (p, v) => ({ ...p, workHistory: v as WorkHistoryEntry[] }),
    isEmpty: emptyArr,
    display: (v) => {
      const arr = (v ?? []) as WorkHistoryEntry[];
      return arr
        .map((e) => {
          const end = e.isCurrent ? 'present' : (e.endDate ?? '');
          return `${e.title} at ${e.company} (${e.startDate}${end ? ' – ' + end : ''})`;
        })
        .join('\n');
    },
  },
  // ── Education ────────────────────────────────────────────────────────────────
  {
    id: 'education',
    label: 'Education',
    section: 'Education',
    getValue: (p) => p.education ?? [],
    setValue: (p, v) => ({ ...p, education: v as EducationEntry[] }),
    isEmpty: emptyArr,
    display: (v) => {
      const arr = (v ?? []) as EducationEntry[];
      return arr
        .map((e) => {
          const end = e.isCurrent ? 'present' : (e.endDate ?? '');
          return `${e.degree} in ${e.fieldOfStudy}, ${e.institution} (${e.startDate}${end ? ' – ' + end : ''})`;
        })
        .join('\n');
    },
  },
  // ── Languages ────────────────────────────────────────────────────────────────
  {
    id: 'languages',
    label: 'Languages',
    section: 'Languages',
    getValue: (p) => p.languages ?? [],
    setValue: (p, v) => ({ ...p, languages: v as LanguageEntry[] }),
    isEmpty: emptyArr,
    display: (v) => {
      const arr = (v ?? []) as LanguageEntry[];
      return arr.map((e) => `${e.language} (${e.proficiency.replace(/_/g, ' ')})`).join('\n');
    },
  },
  // ── Links ────────────────────────────────────────────────────────────────────
  {
    id: 'links.linkedin',
    label: 'LinkedIn URL',
    section: 'Links',
    getValue: (p) => p.links?.linkedin ?? null,
    setValue: (p, v) => ({ ...p, links: { ...(p.links ?? {} as Profile['links']), linkedin: v as string } }),
    isEmpty: emptyStr,
    display: (v) => String(v ?? ''),
  },
  {
    id: 'links.portfolio',
    label: 'Portfolio URL',
    section: 'Links',
    getValue: (p) => p.links?.portfolio ?? null,
    setValue: (p, v) => ({ ...p, links: { ...(p.links ?? {} as Profile['links']), portfolio: v as string } }),
    isEmpty: emptyStr,
    display: (v) => String(v ?? ''),
  },
  {
    id: 'links.custom',
    label: 'Custom Links',
    section: 'Links',
    getValue: (p) => p.links?.custom ?? [],
    setValue: (p, v) => ({ ...p, links: { ...(p.links ?? {} as Profile['links']), custom: v as Profile['links']['custom'] } }),
    isEmpty: emptyArr,
    display: (v) => {
      const arr = (v ?? []) as { label: string; url: string }[];
      return arr.map((l) => `${l.label}: ${l.url}`).join('\n');
    },
  },
  // ── Documents ────────────────────────────────────────────────────────────────
  {
    id: 'documents.cv.url',
    label: 'CV URL',
    section: 'Documents',
    getValue: (p) => p.documents?.cv?.url ?? null,
    setValue: (p, v) => ({
      ...p,
      documents: {
        ...(p.documents ?? {} as Profile['documents']),
        cv: { ...(p.documents?.cv ?? {}), url: v as string },
      },
    }),
    isEmpty: emptyStr,
    display: (v) => String(v ?? ''),
  },
  {
    id: 'documents.cv.file',
    label: 'CV File',
    section: 'Documents',
    getValue: (p) => p.documents?.cv?.file ?? null,
    setValue: (p, v) => ({
      ...p,
      documents: {
        ...(p.documents ?? {} as Profile['documents']),
        cv: { ...(p.documents?.cv ?? {}), file: v as NonNullable<Profile['documents']['cv']['file']> },
      },
    }),
    isEmpty: (v) => !v || typeof v !== 'object',
    display: (v) => {
      if (!v || typeof v !== 'object') return '';
      return (v as { name: string }).name ?? '';
    },
  },
];

// ── Diff generation ──────────────────────────────────────────────────────────

/**
 * Shared diff engine for Resume Import, Import Profile, and Drive Connect flows.
 * current   = baseline profile already saved on-device.
 * extracted = incoming candidate (Gemini output, JSON import, or Drive backup).
 * Returns one FieldChange per FIELD_DEF classified as new | conflict | unchanged.
 */
export function generateDiff(
  current: Partial<Profile>,
  extracted: Partial<Profile>,
): FieldChange[] {
  return FIELD_DEFS.map((def) => {
    const currentVal   = def.getValue(current);
    const suggestedVal = def.getValue(extracted);

    const currentEmpty   = def.isEmpty(currentVal);
    const suggestedEmpty = def.isEmpty(suggestedVal);

    let status: FieldStatus;
    if (suggestedEmpty) {
      status = 'unchanged';
    } else if (currentEmpty) {
      status = 'new';
    } else {
      status = JSON.stringify(currentVal) !== JSON.stringify(suggestedVal) ? 'conflict' : 'unchanged';
    }

    return {
      id:               def.id,
      label:            def.label,
      section:          def.section,
      currentValue:     currentVal,
      suggestedValue:   suggestedVal,
      displayCurrent:   def.display(currentVal),
      displaySuggested: def.display(suggestedVal),
      status,
      accepted:         status !== 'unchanged',
    };
  });
}

// ── Apply accepted changes ───────────────────────────────────────────────────

export function applyChanges(
  baseProfile: Partial<Profile>,
  changes: FieldChange[],
): Partial<Profile> {
  let result: Partial<Profile> = { ...baseProfile };

  for (const change of changes) {
    if (change.status === 'unchanged') continue;
    if (!change.accepted) continue;
    const def = FIELD_DEFS.find((d) => d.id === change.id);
    if (def) result = def.setValue(result, change.suggestedValue);
  }

  return result;
}
