import type { Profile } from '@/src/types/profile';
import type { MappingGroup } from '@/src/learned-mappings/groups';
import { buildPickerTree } from '@/src/autofill/profileFieldTree';
import { profileFieldName } from '@/src/profile/fieldMetadata';

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
