import { selectedEntryValue } from './entrySelection';
import type { DocumentFile, Profile } from '@/src/types/profile';
import { normalizeProfile } from '@/src/utils/migrate';
import { equalJsonValues } from '@/src/utils/equalJsonValues';
import { applyChanges, FIELD_DEFS, generateDiff } from './parser';
import { preserveResumeEntries } from './entryComparison';
import type { FieldChange } from './types';

export const RESUME_FILE_CHANGE_ID = '__cv_file__';
export type ProfileUpdate = Partial<Profile> | ((latest: Partial<Profile>) => Partial<Profile>);

export function resumeFileChange(incoming: DocumentFile, current?: DocumentFile): FieldChange {
  const same = !!current && current.base64.split(',').at(-1) === incoming.base64.split(',').at(-1);
  return {
    id: RESUME_FILE_CHANGE_ID,
    label: 'Resume File',
    section: 'Documents',
    currentValue: current ?? null,
    suggestedValue: incoming,
    displayCurrent: current?.name ?? '',
    displaySuggested: incoming.name,
    status: same ? 'unchanged' : current ? 'conflict' : 'new',
    accepted: !same,
    hasIncomingValue: true,
    note:
      current && !same
        ? 'Importing replaces your saved resume file. Its URL stays unchanged.'
        : undefined,
  };
}

export function resumeChanges(
  current: Partial<Profile>,
  extracted: Partial<Profile>,
): FieldChange[] {
  const normalized = normalizeProfile(extracted as Profile);
  return generateDiff(current, preserveResumeEntries(current, normalized)).map((change) => ({
    ...change,
    ...(change.status === 'conflict' &&
      ['workHistory', 'education', 'languages', 'workAuthorization', 'links.custom'].includes(
        change.id,
      ) && {
        note: change.entries
          ? 'Saved entries and details not found in the resume are kept.'
          : 'Saved entries and details not found in the resume are kept. Your choice applies to the whole list.',
      }),
  }));
}

export class ResumeReviewChangedError extends Error {
  constructor(public changes: FieldChange[]) {
    super('Your profile changed in another tab. Review the updated comparison.');
  }
}

/** Apply only reviewed fields against fresh storage, checking for concurrent edits. */
export function applyReviewedResumeChanges(
  latest: Partial<Profile>,
  changes: FieldChange[],
): Partial<Profile> {
  let stale = false;
  const refreshed = changes.map((change) => {
    if (change.status === 'unchanged' || !change.accepted) return change;
    const current =
      change.id === RESUME_FILE_CHANGE_ID
        ? (latest.documents?.cv?.file ?? null)
        : FIELD_DEFS.find((def) => def.id === change.id)?.getValue(latest);
    if (
      equalJsonValues(current, change.currentValue) ||
      equalJsonValues(current, selectedEntryValue(change))
    )
      return change;
    stale = true;
    if (change.id === RESUME_FILE_CHANGE_ID)
      return resumeFileChange(change.suggestedValue as DocumentFile, latest.documents?.cv?.file);
    return {
      ...generateDiff(latest, applyChanges(latest, [change])).find(
        (item) => item.id === change.id,
      )!,
      accepted: change.accepted,
    };
  });
  if (stale) throw new ResumeReviewChangedError(refreshed);
  const result = applyChanges(latest, changes);
  const file = changes.find(
    (change) =>
      change.id === RESUME_FILE_CHANGE_ID && change.accepted && change.status !== 'unchanged',
  );
  return file
    ? {
        ...result,
        documents: {
          ...result.documents,
          cv: { ...result.documents?.cv, file: file.suggestedValue as DocumentFile },
        },
      }
    : result;
}
