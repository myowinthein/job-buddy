import {
  DRIVE_RETRY_ALARM,
  DRIVE_AUTH_ALARM,
  refreshDriveConnection,
  markDriveBackupPending,
  retryPendingDriveSync,
  syncIfConnected,
} from '@/src/utils/driveSync';

export default defineBackground(() => {
  // On browser startup, retry any deferred Drive upload. Silent — failures
  // are captured in driveBackupState by syncProfileToDrive itself.
  chrome.runtime.onStartup.addListener(() => {
    void refreshDriveConnection();
    void retryPendingDriveSync();
  });
  chrome.alarms?.onAlarm.addListener((alarm) => {
    if (alarm.name === DRIVE_RETRY_ALARM) void retryPendingDriveSync();
    if (alarm.name === DRIVE_AUTH_ALARM)
      void refreshDriveConnection().then(() => retryPendingDriveSync());
  });

  // Debounced Drive sync whenever the profile or learnedMappings changes
  // locally — autofill learning something new on a job-site tab, a profile
  // save, or a migration write-back in getProfile() (which writes straight
  // to storage, bypassing the explicit saveProfile()/syncProfileToDrive()
  // path). One shared timer: both keys trigger the same full re-sync (see
  // syncIfConnected), so a batch that touches both should only upload once.
  // Coalesces a burst of writes into a single upload shortly after the last
  // change. No-op when Drive isn't connected (syncIfConnected checks).
  let syncTimer: ReturnType<typeof setTimeout> | undefined;
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (!('learnedMappings' in changes) && !('profile' in changes)) return;
    if (changes.profile?.newValue == null && changes.learnedMappings?.newValue == null) return;
    void markDriveBackupPending();
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      void syncIfConnected();
    }, 5000);
  });
});
