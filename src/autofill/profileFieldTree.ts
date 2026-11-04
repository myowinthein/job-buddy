import type { Profile } from '../types/profile';
import { COUNTRIES } from '../data/countries';
import { languageName } from '../data/languages';
import { resolveProfileValue } from './resolver';
import { mostRecentIdx } from './entryRecency';
import {
  PROFILE_SECTION_DEFINITIONS,
  PROFILE_FIELD_LAYOUTS,
  catalogFields,
  type CatalogField,
  type ProfileFieldScope,
} from '../profile/fieldCatalog';

export interface OptionRow {
  kind: 'option';
  label: string;
  fieldPath: string;
  value: string;
}
export interface Cluster {
  kind: 'cluster';
  heading: string;
  rows: OptionRow[];
}
export interface SubGroup {
  kind: 'subgroup';
  heading: string;
  rows: OptionRow[];
  defaultCollapsed?: boolean;
}
export type SectionItem = OptionRow | Cluster | SubGroup;
export interface Section {
  id: string;
  label: string;
  items: SectionItem[];
}

function readPath(value: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (node, key) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined,
      value,
    );
}
function countryName(code: string): string {
  return COUNTRIES.find((country) => country.code === code)?.name ?? code;
}
function entryHeading(
  entry: Record<string, unknown>,
  primary: string,
  secondary: string,
  index: number,
): string {
  if (entry[primary] && entry[secondary]) return `${entry[primary]} · ${entry[secondary]}`;
  if (entry[primary] || entry[secondary]) return String(entry[primary] || entry[secondary]);
  const start = String(entry.startDate ?? '').split('-')[0];
  const end = entry.isCurrent ? 'Present' : String(entry.endDate ?? '').split('-')[0];
  return start ? (end ? `${start}–${end}` : start) : `Entry ${index + 1}`;
}

/** The editor catalog supplies labels, section order, field order and picker aliases. */
export function buildPickerTree(profile: Profile): Section[] {
  function buildEntries(
    definition: NonNullable<CatalogField['entries']>,
    label: string,
  ): SectionItem[] {
    const source = readPath(profile, definition.path);
    const entries = Array.isArray(source) ? source : source ? [source] : [];
    const recent = mostRecentIdx(entries);
    return entries.flatMap((entry: Record<string, unknown>, index): SectionItem[] => {
      if (definition.heading === 'country' && !entry.status) return [];
      if (definition.heading === 'language' && !entry.language) return [];
      if (definition.heading === 'link' && (!entry.label || !entry.url)) return [];
      if (
        definition.heading === 'salary' &&
        source !== profile.salary?.current &&
        !entry.amount &&
        !entry.currency
      )
        return [];
      const items = buildScope(definition.scope as ProfileFieldScope, index, entry);
      if (definition.heading === 'link') return items;
      const rows = items.flatMap((item) => (item.kind === 'option' ? [item] : item.rows));
      if (!rows.length) return [];
      let heading = label;
      switch (definition.heading) {
        case 'work':
          heading = entryHeading(entry, 'company', 'title', index);
          break;
        case 'education':
          heading = entryHeading(entry, 'institution', 'degree', index);
          break;
        case 'country':
          heading = countryName(String(entry.country ?? '')) || `Entry ${index + 1}`;
          break;
        case 'language':
          heading = languageName(String(entry.language));
          break;
        case 'salary':
          if (Array.isArray(source))
            heading = `${label}: ${entry.currency || `Entry ${index + 1}`}`;
          break;
      }
      return [
        {
          kind: 'subgroup',
          heading,
          rows,
          ...(['work', 'education'].includes(definition.heading)
            ? { defaultCollapsed: index !== recent }
            : {}),
        },
      ];
    });
  }
  function buildScope(
    scope: ProfileFieldScope,
    index?: number,
    entry?: Record<string, unknown>,
  ): SectionItem[] {
    return catalogFields(PROFILE_FIELD_LAYOUTS[scope]).flatMap((field): SectionItem[] => {
      if (field.entries) return buildEntries(field.entries, field.label);
      if (field.picker === false || (field.when && entry?.[field.when.key] !== field.when.value))
        return [];
      if (field.pickerLabelFrom && !entry?.[field.pickerLabelFrom]) return [];
      const choices: readonly { label?: string; path: string }[] =
        field.picker ?? field.paths.map((path) => ({ path }));
      const rows: OptionRow[] = choices.flatMap((choice): OptionRow[] => {
        const fieldPath = choice.path.replaceAll('$', String(index ?? 0));
        const value = resolveProfileValue(profile, fieldPath);
        if (!value) return [];
        const label = field.pickerLabelFrom
          ? String(entry?.[field.pickerLabelFrom])
          : (choice.label ?? field.inputLabel ?? field.label);
        return [{ kind: 'option', label, fieldPath, value }];
      });
      return field.cluster && rows.length
        ? [{ kind: 'cluster', heading: field.label, rows }]
        : rows;
    });
  }
  return PROFILE_SECTION_DEFINITIONS.flatMap((section): Section[] => {
    const items =
      'entries' in section ? buildEntries(section.entries, section.label) : buildScope(section.id);
    const id = section.id.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    return items.length ? [{ id, label: section.label, items }] : [];
  });
}
