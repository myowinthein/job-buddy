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
