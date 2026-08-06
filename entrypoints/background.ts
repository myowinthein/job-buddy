import { retryPendingDriveSync, syncLearnedMappingsIfConnected } from '@/src/utils/driveSync';
import { handleOpenOptions } from '@/src/utils/backgroundHandlers';

export default defineBackground(() => {
  // Content scripts cannot reliably call chrome.runtime.openOptionsPage() in
  // every browser context; routing through the service worker is the
  // documented-stable path. With options_ui.open_in_tab: true (set in
  // wxt.config.ts), Chrome automatically focuses an existing Options tab if
  // one is already open instead of duplicating it.
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.action === 'OPEN_OPTIONS') {
      void handleOpenOptions(message.focusPath, sendResponse);
      return true; // async response
    }
  });

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
