import { getProfile, getDriveBackupState, getDriveToken } from '@/src/utils/storage';
import { syncProfileToDrive } from '@/src/utils/driveSync';

export default defineBackground(() => {
  // Content scripts cannot reliably call chrome.runtime.openOptionsPage() in
  // every browser context; routing through the service worker is the
  // documented-stable path. With options_ui.open_in_tab: true (set in
  // wxt.config.ts), Chrome automatically focuses an existing Options tab if
  // one is already open instead of duplicating it.
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.action === 'OPEN_OPTIONS') {
      chrome.runtime.openOptionsPage(() => {
        sendResponse({ success: !chrome.runtime.lastError });
      });
      return true; // async response
    }
  });

  // On browser startup, retry any deferred Drive upload. Silent — failures
  // are captured in driveBackupState by syncProfileToDrive itself.
  chrome.runtime.onStartup.addListener(() => {
    void retryPendingDriveSync();
  });
});

async function retryPendingDriveSync(): Promise<void> {
  try {
    const [state, token] = await Promise.all([getDriveBackupState(), getDriveToken()]);
    if (!state.pendingSync || !token) return;
    const profile = await getProfile();
    if (!profile) return;
    await syncProfileToDrive(profile);
  } catch {
    /* never throw from startup handler */
  }
}
