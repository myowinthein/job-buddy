import { devContext } from '../devtools/context';
import type * as Drive from '@/src/utils/driveSync';

const disabled = async (): Promise<never> => {
  throw new Error('Google Drive is disabled in the sample-data preview.');
};

export const isDriveConfigured: typeof Drive.isDriveConfigured = () => !!devContext();
export const getFullDriveState: typeof Drive.getFullDriveState = async (...args) =>
  devContext()
    ? (await import('../utils/driveSync')).getFullDriveState(...args)
    : {
        connected: false,
        lastSynced: null,
        pendingSync: false,
        error: null,
      };
export const connectDrive: typeof Drive.connectDrive = async (...args) =>
  devContext() ? (await import('../utils/driveSync')).connectDrive(...args) : disabled();
export const inspectDriveBackup: typeof Drive.inspectDriveBackup = async (...args) =>
  devContext() ? (await import('../utils/driveSync')).inspectDriveBackup(...args) : disabled();
export const finishDriveReview: typeof Drive.finishDriveReview = async (...args) => {
  if (devContext()) await (await import('../utils/driveSync')).finishDriveReview(...args);
};
export const markDriveBackupPending: typeof Drive.markDriveBackupPending = async (...args) => {
  if (devContext()) await (await import('../utils/driveSync')).markDriveBackupPending(...args);
};
export const DRIVE_AUTH_ALARM = 'jb:drive-authorization-renewal';
export const refreshDriveConnection: typeof Drive.refreshDriveConnection = async (...args) => {
  if (devContext()) await (await import('../utils/driveSync')).refreshDriveConnection(...args);
};
export const completeDriveRestore: typeof Drive.completeDriveRestore = async (id, save) => {
  if (devContext()) return (await import('../utils/driveSync')).completeDriveRestore(id, save);
  await save();
};
export const DRIVE_RETRY_ALARM = 'jb:drive-backup-retry';
export const launchDriveOAuth: typeof Drive.launchDriveOAuth = async (...args) =>
  devContext() ? (await import('../utils/driveSync')).launchDriveOAuth(...args) : disabled();
export const revokeDriveToken: typeof Drive.revokeDriveToken = async (...args) =>
  devContext() ? (await import('../utils/driveSync')).revokeDriveToken(...args) : disabled();
export const syncProfileToDrive: typeof Drive.syncProfileToDrive = async (...args) =>
  devContext()
    ? (await import('../utils/driveSync')).syncProfileToDrive(...args)
    : {
        success: false,
        errorCode: null,
      };
export const overwriteDriveWithLocal: typeof Drive.overwriteDriveWithLocal = async (...args) =>
  devContext() ? (await import('../utils/driveSync')).overwriteDriveWithLocal(...args) : disabled();
export const disconnectDrive: typeof Drive.disconnectDrive = async (...args) => {
  if (devContext()) await (await import('../utils/driveSync')).disconnectDrive(...args);
};
export const retryPendingDriveSync: typeof Drive.retryPendingDriveSync = async (...args) => {
  if (devContext()) await (await import('../utils/driveSync')).retryPendingDriveSync(...args);
};
export const syncIfConnected: typeof Drive.syncIfConnected = async (...args) => {
  if (devContext()) await (await import('../utils/driveSync')).syncIfConnected(...args);
};
export const dispatchDriveStateChanged: typeof Drive.dispatchDriveStateChanged = () => {
  if (devContext()) window.dispatchEvent(new CustomEvent('jb:drive:state-changed'));
};
