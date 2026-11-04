import {
  catalogFieldIdByLabel,
  profileFieldMetadata,
  profileReviewMetadata,
  profileSectionLabel,
} from './fieldMetadata';
import type { ProfileSectionId } from './fieldCatalog';

// Completion counts logical checks, including whole entries and documents.
export const CORE_COMPLETION_IDS = [
  'personal.firstName',
  'personal.email',
  'personal.phone',
  'address.city',
  'address.country',
  'workAuthorization',
  'professional.noticePeriod',
  'education',
  'languages',
  'documents.cv',
] as const;
const aggregateLabels: Record<string, { section: ProfileSectionId; label: string }> = {
  workAuthorization: { section: 'workAuthorization', label: 'At least one valid entry' },
  education: { section: 'education', label: 'At least one complete entry' },
  languages: { section: 'languages', label: 'At least one language' },
  links: { section: 'links', label: 'Profile links' },
};
export const OPTIONAL_COMPLETION_IDS = [
  'address.street',
  'address.state',
  'address.postalCode',
  'salary.expected',
  'professional.summary',
  'workHistory.$.location',
  'workHistory.$.arrangement',
  'workHistory.$.description',
  'links',
  'salary.current',
] as const;
export function completionItem(id: string) {
  if (aggregateLabels[id]) return { ...aggregateLabels[id], id };
  if (id === 'documents.cv')
    return {
      id,
      section: 'documents' as const,
      label: profileFieldMetadata('documents.cv.url')!.field.label,
    };
  const metadata = profileReviewMetadata(id.replaceAll('$', '0'));
  if (!metadata) throw new Error('Missing completion field ' + id);
  return { id, section: metadata.section, label: metadata.label };
}
export function completionFieldId(section: string, idOrLabel: string): string {
  const ids = [...CORE_COMPLETION_IDS, ...OPTIONAL_COMPLETION_IDS];
  if (ids.some((id) => id === idOrLabel)) return idOrLabel;
  // Compatibility for callers with an older label-based focus request.
  return (
    ids.find((id) => {
      const item = completionItem(id);
      return item.section === section && item.label === idOrLabel;
    }) ??
    catalogFieldIdByLabel(section, idOrLabel) ??
    (
      {
        'LinkedIn URL': 'links.linkedin',
        'Portfolio URL': 'links.portfolio',
        'Current Salary Amount': 'salary.current.amount',
        'Current Salary Currency': 'salary.current.currency',
      } as Record<string, string>
    )[idOrLabel] ??
    section
  );
}
export function completionSectionLabel(id: string): string {
  return profileSectionLabel(id)!;
}
