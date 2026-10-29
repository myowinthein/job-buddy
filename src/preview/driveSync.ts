import type * as Drive from '@/src/utils/driveSync';

const disabled = async (): Promise<never> => {
  throw new Error('Google Drive is disabled in the sample-data preview.');
};

export const isDriveConfigured: typeof Drive.isDriveConfigured = () => false;
export const getFullDriveState: typeof Drive.getFullDriveState = async () => ({
  connected: false,
  lastSynced: null,
  pendingSync: false,
  error: null,
});
export const connectDrive: typeof Drive.connectDrive = disabled;
export const inspectDriveBackup: typeof Drive.inspectDriveBackup = disabled;
export const finishDriveReview: typeof Drive.finishDriveReview = async () => {};
export const markDriveBackupPending: typeof Drive.markDriveBackupPending = async () => {};
export const DRIVE_AUTH_ALARM = 'jb:drive-authorization-renewal';
export const refreshDriveConnection: typeof Drive.refreshDriveConnection = async () => {};
export const completeDriveRestore: typeof Drive.completeDriveRestore = async (_id, save) => {
  await save();
};
export const DRIVE_RETRY_ALARM = 'jb:drive-backup-retry';
export const launchDriveOAuth: typeof Drive.launchDriveOAuth = disabled;
export const revokeDriveToken: typeof Drive.revokeDriveToken = disabled;
export const syncProfileToDrive: typeof Drive.syncProfileToDrive = async () => ({
  success: false,
  errorCode: null,
});
export const overwriteDriveWithLocal: typeof Drive.overwriteDriveWithLocal = disabled;
export const disconnectDrive: typeof Drive.disconnectDrive = async () => {};
export const retryPendingDriveSync: typeof Drive.retryPendingDriveSync = async () => {};
export const syncIfConnected: typeof Drive.syncIfConnected = async () => {};
export const dispatchDriveStateChanged: typeof Drive.dispatchDriveStateChanged = () => {};
