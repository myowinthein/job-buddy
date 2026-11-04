import type { Profile } from '../types/profile';
import {
  PROFILE_FIELD_LAYOUTS,
  PROFILE_SECTION_DEFINITIONS,
  catalogFields,
  storageInputId,
  type CatalogField,
  type ProfileFieldScope,
  type ProfileSectionId,
} from './fieldCatalog';

export function readProfilePath(value: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (node, key) =>
        node && typeof node === 'object' && Object.hasOwn(node, key)
          ? (node as Record<string, unknown>)[key]
          : undefined,
      value,
    );
}
const sectionFor = (path: string): ProfileSectionId =>
  (path.startsWith('professional.') ? 'workHistory' : path.split('.')[0]) as ProfileSectionId;
const sectionIndex = (id: ProfileSectionId) =>
  PROFILE_SECTION_DEFINITIONS.findIndex((section) => section.id === id);
export const profileSectionLabel = (id: string): string | undefined =>
  PROFILE_SECTION_DEFINITIONS.find((section) => section.id === id)?.label;

const fields = Object.entries(PROFILE_FIELD_LAYOUTS).flatMap(([scope, nodes]) =>
  catalogFields(nodes).map((field, position) => ({
    scope: scope as ProfileFieldScope,
    field,
    position,
  })),
);
export function profileFieldMetadata(path: string) {
  const template = path.replace(/\.\d+(?=\.|$)/g, '.$');
  for (const definition of fields) {
    const { field } = definition;
    const choice = field.picker
      ? field.picker.find((candidate) => candidate.path === template)
      : undefined;
    if (field.paths.some((candidate) => candidate === template) || choice)
      return {
        ...definition,
        section: sectionFor(field.paths[0]),
        label: choice?.label ?? field.inputLabel ?? field.label,
        template,
        index: Number(path.match(/\.(\d+)(?:\.|$)/)?.[1] ?? 0),
      };
  }
  return undefined;
}

/** Aggregate import rows have their own bindings, but share catalog names/order. */
export function profileReviewMetadata(
  path: string,
): { label: string; section: ProfileSectionId; order: number } | undefined {
  path = path.replace(/\[(\d+)\]/g, '.$1');
  for (const section of PROFILE_SECTION_DEFINITIONS) {
    if ('entries' in section && section.entries.path === path)
      return { label: section.label, section: section.id, order: sectionIndex(section.id) * 1000 };
    const nodes = catalogFields(PROFILE_FIELD_LAYOUTS[section.id]);
    for (const [position, field] of nodes.entries()) {
      const compoundPath =
        field.paths.length > 1 ? field.paths[0].split('.').slice(0, -1).join('.') : undefined;
      if (field.entries?.path === path || compoundPath === path)
        return {
          label: field.label,
          section: section.id,
          order: sectionIndex(section.id) * 1000 + position,
        };
    }
  }
  if (/^documents\.(cv|coverLetter)\.file$/.test(path)) {
    const definition = profileReviewMetadata(path.replace(/\.file$/, '.url'))!;
    const field = profileFieldMetadata(path.replace(/\.file$/, '.url'))!.field;
    return { ...definition, label: `${field.label} file`, order: definition.order + 0.1 };
  }
  const metadata = profileFieldMetadata(path);
  return (
    metadata && {
      label: metadata.scope === 'documents' ? `${metadata.field.label} URL` : metadata.label,
      section: metadata.section,
      order: sectionIndex(metadata.section) * 1000 + metadata.position,
    }
  );
}

export function catalogProfileFieldName(path: string): string | undefined {
  const metadata = profileFieldMetadata(path);
  if (!metadata) return undefined;
  const { field, section, label, scope, index } = metadata;
  const parts = [profileSectionLabel(section)!];
  if (scope === 'currentSalary' || scope === 'expectedSalary')
    parts.push(
      catalogFields(PROFILE_FIELD_LAYOUTS.salary).find((item) => item.entries?.scope === scope)!
        .label,
    );
  if (metadata.template.includes('$')) parts.push(`Entry ${index + 1}`);
  if (field.cluster) parts.push(field.label);
  parts.push(label);
  return [...new Set(parts)].join(' → ');
}

export interface ProfileInputTarget {
  id: string;
  cardId?: string;
  fallbackId?: string;
  revealId?: string;
}
function collectionTarget(
  scope: ProfileFieldScope,
  index: number,
  field: CatalogField,
): ProfileInputTarget {
  const section = sectionFor(field.paths[0]);
  return {
    id: field.inputId!.replaceAll('$', String(index)),
    ...(scope === 'workEntry' || scope === 'education'
      ? { cardId: `entry-${section}-${index}` }
      : {}),
    ...(field.paths[0].includes('$')
      ? {
          fallbackId:
            scope === 'customLink'
              ? 'add-customLinks'
              : scope === 'expectedSalary'
                ? 'add-expected'
                : `add-${section}`,
        }
      : {}),
  };
}
export function catalogSectionStartTarget(section: string): ProfileInputTarget | undefined {
  const definition = PROFILE_SECTION_DEFINITIONS.find((item) => item.id === section);
  if (!definition) return undefined;
  const first = catalogFields(PROFILE_FIELD_LAYOUTS[definition.id])[0];
  const entry = 'entries' in definition ? definition.entries : first.entries;
  if (entry) {
    const scope = entry.scope as ProfileFieldScope;
    return collectionTarget(scope, 0, catalogFields(PROFILE_FIELD_LAYOUTS[scope])[0]);
  }
  return first.inputId ? { id: first.inputId } : undefined;
}
export function catalogProfileTarget(
  profile: Partial<Profile>,
  path: string,
): { section: ProfileSectionId; target: ProfileInputTarget } | null {
  if (path === 'derived.fullName') path = 'personal.firstName';
  if (/^documents\.(cv|coverLetter)\.file/.test(path)) path = path.replace(/\.file.*$/, '.url');
  if (path.startsWith('professional.noticePeriod')) {
    return {
      section: 'workHistory',
      target: {
        id: storageInputId(
          profile.professional?.noticePeriod?.immediate === false
            ? 'professional.noticePeriod.value'
            : 'professional.noticePeriod.immediate',
        ),
      },
    };
  }
  const metadata = profileFieldMetadata(path);
  if (!metadata?.field.inputId) return null;
  const { field, section, scope, index, template } = metadata;
  if (field.when && template.includes('$')) {
    const row = readProfilePath(profile, template.split('.$')[0] + '.' + index);
    if (readProfilePath(row, field.when.key) !== field.when.value) {
      const condition = catalogFields(PROFILE_FIELD_LAYOUTS[scope]).find(
        (item) => item.key === field.when!.key,
      );
      if (condition?.inputId) return { section, target: collectionTarget(scope, index, condition) };
    }
  }
  const target = collectionTarget(scope, index, field);
  if (template.includes('$')) {
    const collection = template.split('.$')[0];
    const rows = readProfilePath(profile, collection);
    if (
      (!Array.isArray(rows) || !rows[index]) &&
      scope !== 'customLink' &&
      scope !== 'expectedSalary'
    )
      return { section, target: { id: target.fallbackId! } };
  }
  return { section, target };
}

export function profileEntryFields(
  collection: string,
): { id: string; label: string; heading: boolean }[] {
  const section = PROFILE_SECTION_DEFINITIONS.find(
    (item) => 'entries' in item && item.entries.path === collection,
  );
  const entry =
    section && 'entries' in section
      ? section.entries
      : fields.find((item) => item.field.entries?.path === collection)?.field.entries;
  if (!entry) return [];
  return catalogFields(PROFILE_FIELD_LAYOUTS[entry.scope as ProfileFieldScope])
    .filter((field) => collection !== 'languages' || !field.reviewHeading)
    .map((field) => ({
      id: field.paths[0].slice(collection.length + 3),
      label: field.label,
      heading: !!field.reviewHeading,
    }));
}

export function catalogFieldIdByLabel(section: string, label: string): string | undefined {
  return fields.find(
    (item) =>
      item.field.label === label &&
      item.field.paths.length &&
      sectionFor(item.field.paths[0]) === section,
  )?.field.paths[0];
}
