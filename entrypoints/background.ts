import { retryPendingDriveSync, syncLearnedMappingsIfConnected } from '@/src/utils/driveSync';

export default defineBackground(() => {
  // On browser startup, retry any deferred Drive upload. Silent — failures
  // are captured in driveBackupState by syncProfileToDrive itself.
  chrome.runtime.onStartup.addListener(() => {
    void retryPendingDriveSync();
  });

  // Debounced Drive sync whenever autofill learns something new on any
  // job-site tab. Coalesces a burst of writes from one autofill session
  // (many fields, several signals each) into a single upload shortly after
  // the last change, instead of syncing on every individual write. No-op
  // when Drive isn't connected (syncLearnedMappingsIfConnected checks).
  let learnedMappingsSyncTimer: ReturnType<typeof setTimeout> | undefined;
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !('learnedMappings' in changes)) return;
    clearTimeout(learnedMappingsSyncTimer);
    learnedMappingsSyncTimer = setTimeout(() => {
      void syncLearnedMappingsIfConnected();
    }, 5000);
  });
});
