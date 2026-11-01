import type { Profile } from '@/src/types/profile';
import type { FieldChange } from '@/src/resume-ai/types';
import { applyChanges } from '@/src/resume-ai/parser';
import { selectedBackupData } from './backupImport';
import { calculateDerivedFields } from './derivedFields';
import { profileData } from './profileData';
import { replaceProfileData, ProfileReplacementChangedError } from './storage';
import { protectProfileReplacement } from './driveSync';
import { ImportProfileChangedError } from './importPolicy';
import { withProfileWriteLock } from './profileWriteLock';

export async function replaceImportedProfile(
  base: Partial<Profile>,
  changes: FieldChange[],
  fromDrive = false,
): Promise<Profile> {
  let profile = profileData({
    ...applyChanges(
      {},
      changes.filter((change) => change.hasIncomingValue !== false),
    ),
    id: crypto.randomUUID(),
  }) as Profile;
  try {
    profile = { ...profile, derived: calculateDerivedFields(profile) };
  } catch {
    /* Save raw incoming data. */
  }
  const backup = selectedBackupData(changes);
  const save = (paused?: import('@/src/types/storage').DriveBackupState) =>
    withProfileWriteLock(() =>
      replaceProfileData(profile, base, backup.learnedMappings ?? {}, paused),
    );
  try {
    if (fromDrive)
      await save(); // completeDriveRestore already holds the Drive lock.
    else await protectProfileReplacement(save);
  } catch (error) {
    if (error instanceof ProfileReplacementChangedError)
      throw new ImportProfileChangedError(error.current);
    throw error;
  }
  return profile;
}
