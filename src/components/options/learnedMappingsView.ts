import type { Profile } from '@/src/types/profile';
import type { LearnedMappings, LearnedMappingValue } from '@/src/types/storage';
import { LEARNED_MAPPING_THRESHOLD } from '@/src/autofill/constants';
import { buildPickerTree } from '@/src/autofill/profileFieldTree';
import { profileFieldName } from '@/src/fill-log/presentation';
import { getSectionStartTarget, type CompletionTarget } from '@/src/utils/profileCompletion';
import type { ProfileSectionId } from './shared/profileSections';

export type MappingStatus = 'Trusted' | 'Learning' | 'Inactive';
export interface MappingGroup {
  id: string;
  title: string;
  path: string;
  status: MappingStatus;
  members: [string, LearnedMappingValue][];
}
export const mappingPath = (value: LearnedMappingValue): string =>
  typeof value === 'string' ? value : value.path;
export function mappingStatus(value: LearnedMappingValue): MappingStatus {
  if (typeof value !== 'string' && value.inactive) return 'Inactive';
  return typeof value === 'string' || value.count >= LEARNED_MAPPING_THRESHOLD
    ? 'Trusted'
    : 'Learning';
}

/** Group only records with explicit, identical question/trust/scope metadata. Never merge storage. */
export function groupMappings(mappings: LearnedMappings): Map<string, MappingGroup[]> {
  return new Map(
    Object.entries(mappings).map(([domain, entries]) => {
      const groups = new Map<string, MappingGroup>();
      for (const [signal, value] of Object.entries(entries).sort(([a], [b]) =>
        a.localeCompare(b),
      )) {
        const metadata = typeof value === 'string' ? null : value;
        const key = metadata?.question?.trim()
          ? JSON.stringify([
              metadata.path,
              metadata.label ?? '',
              metadata.question,
              metadata.scope ?? '',
              metadata.count,
              !!metadata.inactive,
            ])
          : JSON.stringify(['signal', signal]);
        const existing = groups.get(key);
        if (existing) existing.members.push([signal, value]);
        else
          groups.set(key, {
            id: signal,
            title: metadata?.label?.trim() || metadata?.question?.trim() || 'Unlabelled field',
            path: mappingPath(value),
            status: mappingStatus(value),
            members: [[signal, value]],
          });
      }
      return [domain, [...groups.values()]];
    }),
  );
}

export function profileFieldLabels(profile: Partial<Profile>): Map<string, string> {
  const labels = new Map<string, string>();
  for (const section of buildPickerTree(profile as Profile)) {
    for (const item of section.items) {
      if (item.kind === 'option') labels.set(item.fieldPath, `${section.label} → ${item.label}`);
      else
        for (const row of item.rows)
          labels.set(row.fieldPath, `${section.label} → ${item.heading} → ${row.label}`);
    }
  }
  return labels;
}
export function mappingDestination(path: string, labels: Map<string, string>): string {
  return labels.get(path) ?? profileFieldName(path) ?? 'Unavailable profile field';
}
export function matchesMapping(
  group: MappingGroup,
  domain: string,
  query: string,
  destination: string,
): boolean {
  const text = [
    domain,
    group.title,
    group.path,
    destination,
    ...group.members.flatMap(([signal, value]) => [
      signal,
      typeof value === 'string' ? '' : (value.question ?? ''),
    ]),
  ]
    .join(' ')
    .toLocaleLowerCase();
  return query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .every((word) => text.includes(word));
}

/** Deep links reuse the options page's section/focus guard and fall back to an Add control for removed entries. */
export function mappingProfileTarget(
  profile: Partial<Profile>,
  path: string,
): { section: ProfileSectionId; target: CompletionTarget } | null {
  const parts = path.split('.');
  const section = (
    parts[0] === 'professional' || /^derived\.(current|totalExperience)/.test(path)
      ? 'workHistory'
      : parts[0] === 'derived'
        ? 'personal'
        : parts[0]
  ) as ProfileSectionId;
  const fallback = getSectionStartTarget(section);
  if (!fallback) return null;
  if (parts[0] === 'personal') {
    const key = parts[1] === 'phone' ? 'phone' : parts[1];
    return { section, target: { id: `field-${key}` } };
  }
  if (section === 'address')
    return {
      section,
      target: { id: `field-${parts[1] === 'countryName' ? 'country' : parts[1]}` },
    };
  if (section === 'links' && parts[1] !== 'custom')
    return { section, target: { id: `field-${parts[1]}` } };
  if (section === 'links' && parts[1] === 'custom')
    return {
      section,
      target: { id: `field-customLink-${parts[2]}-url`, fallbackId: 'add-customLinks' },
    };
  if (
    ['education', 'workHistory', 'languages', 'workAuthorization'].includes(section) &&
    /^\d+$/.test(parts[1] ?? '')
  ) {
    const index = Number(parts[1]);
    const rows =
      profile[section as 'education' | 'workHistory' | 'languages' | 'workAuthorization'] ?? [];
    const key = parts[2] === 'isCurrent' ? 'endDate' : (parts[2] ?? 'country');
    return {
      section,
      target: rows[index]
        ? {
            id: `field-${section}-${index}-${key}`,
            ...(section === 'education' || section === 'workHistory'
              ? { cardId: `entry-${section}-${index}` }
              : {}),
            fallbackId: `add-${section}`,
          }
        : { id: `add-${section}` },
    };
  }
  if (section === 'salary') {
    if (parts[1] === 'current')
      return {
        section,
        target: { id: parts[2] === 'currency' ? 'field-currentCurrency' : 'field-currentAmount' },
      };
    const index = /^\d+$/.test(parts[2] ?? '') ? Number(parts[2]) : 0;
    return {
      section,
      target: {
        id: `field-expected-${index}-${parts[3] === 'currency' ? 'currency' : 'amount'}`,
        fallbackId: 'add-expected',
      },
    };
  }
  if (section === 'workHistory' && path.startsWith('professional.noticePeriod'))
    return { section, target: { id: 'field-noticePeriod' } };
  if (section === 'documents')
    return {
      section,
      target: { id: parts[1] === 'coverLetter' ? 'field-coverLetter' : 'field-cv' },
    };
  return { section, target: fallback };
}
