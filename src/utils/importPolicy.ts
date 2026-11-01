import { feedback } from '@/src/ui/feedback';
import { selectedEntryValue } from '@/src/resume-ai/entrySelection';
import type { Profile } from '@/src/types/profile';
import type { FieldChange } from '@/src/resume-ai/types';
import { FIELD_DEFS, generateDiff } from '@/src/resume-ai/parser';
import { equalJsonValues } from './equalJsonValues';

export type ImportMode = 'update' | 'replace';
const normalized = (value: string) =>
  value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
export function importIdentity(profile: Partial<Profile>) {
  return {
    name: [profile.personal?.firstName, profile.personal?.lastName]
      .filter(Boolean)
      .join(' ')
      .trim(),
    email: profile.personal?.email?.trim() ?? '',
  };
}
export function possibleDifferentPerson(
  current: Partial<Profile>,
  incoming: Partial<Profile>,
): boolean {
  const a = importIdentity(current),
    b = importIdentity(incoming);
  const nameDiffers = !!a.name && !!b.name && normalized(a.name) !== normalized(b.name);
  const emailDiffers = !!a.email && !!b.email && normalized(a.email) !== normalized(b.email);
  const namesComparable = !!a.name && !!b.name;
  const emailsComparable = !!a.email && !!b.email;
  // Matching identity evidence can explain a name/email change. When the other
  // identifier is absent, ask rather than silently assuming the same person.
  return (nameDiffers && (emailDiffers || !emailsComparable)) || (emailDiffers && !namesComparable);
}
export const initialImportMode = (
  current: Partial<Profile>,
  incoming: Partial<Profile>,
): ImportMode | null => (possibleDifferentPerson(current, incoming) ? null : 'update');

export function replacementChanges(
  current: Partial<Profile>,
  incoming: Partial<Profile>,
): FieldChange[] {
  return generateDiff(current, incoming).map((change) => {
    const def = FIELD_DEFS.find((field) => field.id === change.id)!;
    // Every included value must be selectable and saved into the fresh profile,
    // including values that happen to match the current person's data.
    if (!def.isEmpty(change.suggestedValue))
      return {
        ...change,
        entryMode: 'replace',
        status: def.isEmpty(change.currentValue) ? 'new' : 'conflict',
        accepted: true,
      };
    if (!def.isEmpty(change.currentValue) && def.isEmpty(change.suggestedValue))
      return {
        ...change,
        entryMode: 'replace',
        status: 'conflict',
        accepted: true,
        hasIncomingValue: false,
        displaySuggested: 'Will be cleared',
        note: 'This detail is not included in the replacement profile.',
      };
    return change;
  });
}

export class ImportProfileChangedError extends Error {
  constructor(public current: Partial<Profile>) {
    super(feedback.importIdentityChanged);
  }
}
export function assertImportCurrent(
  base: Partial<Profile>,
  current: Partial<Profile>,
  changes: FieldChange[],
) {
  if (base.id !== current.id || !equalJsonValues(importIdentity(base), importIdentity(current)))
    throw new ImportProfileChangedError(current);
  for (const change of changes) {
    if (!change.accepted || change.status === 'unchanged') continue;
    const def = FIELD_DEFS.find((field) => field.id === change.id);
    if (!def) continue;
    const value = def.getValue(current);
    if (
      !equalJsonValues(value, change.currentValue) &&
      !equalJsonValues(value, selectedEntryValue(change))
    )
      throw new ImportProfileChangedError(current);
  }
}
