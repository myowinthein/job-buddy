import type { Profile } from '@/src/types/profile';
import { findLanguage } from '@/src/data/languages';
import { findCountryByNameOrCode } from '@/src/data/countries';
import { equalJsonValues } from '@/src/utils/equalJsonValues';

type Entry = Record<string, unknown>;
export interface EntryComparison {
  label: string;
  status?: 'new' | 'removed' | 'changed' | 'unchanged';
  fields: { label: string; current: string; suggested: string; changed: boolean }[];
}
const key = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase();

/** Match only unambiguous entries; never attach saved details by array position. */
export function matchedEntryIndex(section: string, entry: Entry, current: Entry[]): number {
  if (['languages', 'workAuthorization', 'customLinks'].includes(section)) {
    const identity = (value: Entry) =>
      section === 'languages'
        ? (findLanguage(String(value.language ?? ''))?.code ?? key(value.language))
        : section === 'workAuthorization'
          ? (findCountryByNameOrCode(String(value.country ?? ''))?.code ?? key(value.country))
          : String(value.url ?? '').trim();
    let matches = current
      .map((value, index) => ({ value, index }))
      .filter(({ value }) => identity(entry) && identity(value) === identity(entry));
    if (!matches.length && section === 'customLinks')
      matches = current
        .map((value, index) => ({ value, index }))
        .filter(({ value }) => key(entry.label) && key(value.label) === key(entry.label));
    return matches.length === 1 ? matches[0].index : -1;
  }
  const name = section === 'workHistory' ? 'company' : 'institution';
  let candidates = current
    .map((value, index) => ({ value, index }))
    .filter(({ value }) => key(value[name]) && key(value[name]) === key(entry[name]));
  if (section === 'workHistory') {
    candidates = candidates.filter(({ value }) =>
      entry.startDate ? value.startDate === entry.startDate : key(value.title) === key(entry.title),
    );
  } else {
    candidates = candidates.filter(
      ({ value }) => !entry.endDate || !value.endDate || value.endDate === entry.endDate,
    );
    if (!entry.endDate || candidates.length > 1) {
      candidates = candidates.filter(
        ({ value }) =>
          key(value.degree) === key(entry.degree) &&
          key(value.fieldOfStudy) === key(entry.fieldOfStudy) &&
          (!entry.endDate || !value.endDate || value.endDate === entry.endDate),
      );
    }
  }
  return candidates.length === 1 ? candidates[0].index : -1;
}

function fillMissing(current: Entry, incoming: Entry): Entry {
  const result = { ...incoming };
  for (const [name, value] of Object.entries(current)) {
    const next = incoming[name];
    if (next == null || next === '') result[name] = value;
    else if (
      next &&
      value &&
      typeof next === 'object' &&
      typeof value === 'object' &&
      !Array.isArray(next)
    )
      result[name] = fillMissing(value as Entry, next as Entry);
  }
  return result;
}

/** Resume imports add/update entries while retaining information absent from the resume. */
export function preserveResumeEntries(
  current: Partial<Profile>,
  incoming: Partial<Profile>,
): Partial<Profile> {
  const result = { ...incoming };
  const merge = (section: string, existing: Entry[], suggested: Entry[]): Entry[] => {
    const used = new Set<number>();
    const entries = suggested.map((entry) => {
      const index = matchedEntryIndex(section, entry, existing);
      if (index < 0 || used.has(index)) return entry;
      used.add(index);
      return fillMissing(existing[index], entry);
    });
    entries.push(...existing.filter((_, index) => !used.has(index)));
    return entries.map((entry) =>
      section === 'workHistory' && entry.isCurrent == null ? { ...entry, isCurrent: false } : entry,
    );
  };
  for (const section of ['workHistory', 'education', 'languages', 'workAuthorization'] as const) {
    if (!incoming[section]?.length) continue;
    Object.assign(result, {
      [section]: merge(
        section,
        (current[section] ?? []) as unknown as Entry[],
        incoming[section] as unknown as Entry[],
      ),
    });
  }
  if (incoming.links?.custom?.length)
    result.links = {
      ...incoming.links,
      custom: merge(
        'customLinks',
        (current.links?.custom ?? []) as unknown as Entry[],
        incoming.links.custom as unknown as Entry[],
      ) as unknown as NonNullable<Profile['links']['custom']>,
    };
  return result;
}

const text = (value: unknown): string =>
  value == null || value === ''
    ? 'Not provided'
    : typeof value === 'boolean'
      ? value
        ? 'Yes'
        : 'No'
      : typeof value === 'object'
        ? Object.values(value).filter(Boolean).join(', ')
        : String(value);

export function compareEntries(
  section: string,
  currentValue: unknown,
  suggestedValue: unknown,
): EntryComparison[] | undefined {
  if (!['workHistory', 'education'].includes(section)) return undefined;
  const current = (currentValue ?? []) as Entry[];
  const suggested = (suggestedValue ?? []) as Entry[];
  const used = new Set<number>();
  const pairs = suggested.map((entry) => {
    const index = matchedEntryIndex(section, entry, current);
    if (index >= 0 && !used.has(index)) {
      used.add(index);
      return { incoming: entry, saved: current[index] };
    }
    return { incoming: entry, saved: {} as Entry };
  });
  pairs.push(
    ...current
      .filter((_, index) => !used.has(index))
      .map((saved) => ({ incoming: {} as Entry, saved })),
  );
  const fields =
    section === 'workHistory'
      ? {
          company: 'Company',
          title: 'Job title',
          startDate: 'Start date',
          endDate: 'End date',
          isCurrent: 'Current role',
          location: 'Location',
          arrangement: 'Work arrangement',
          description: 'Description',
        }
      : {
          institution: 'Institution',
          degree: 'Degree',
          fieldOfStudy: 'Field of study',
          startDate: 'Start date',
          endDate: 'End date',
          isCurrent: 'Currently studying',
          grade: 'Grade',
          description: 'Description',
        };
  return pairs.map(({ incoming, saved }) => ({
    label: text(incoming.company ?? incoming.institution ?? saved.company ?? saved.institution),
    status: !Object.keys(saved).length
      ? 'new'
      : !Object.keys(incoming).length
        ? 'removed'
        : equalJsonValues(incoming, saved)
          ? 'unchanged'
          : 'changed',
    fields: Object.entries(fields)
      .filter(([name]) => incoming[name] != null || saved[name] != null)
      .map(([name, label]) => ({
        label,
        current: text(saved[name]),
        suggested: text(incoming[name]),
        changed: !equalJsonValues(saved[name] ?? '', incoming[name] ?? ''),
      })),
  }));
}
