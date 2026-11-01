import {
  DRIVE_RETRY_ALARM,
  DRIVE_AUTH_ALARM,
  refreshDriveConnection,
  markDriveBackupPending,
  retryPendingDriveSync,
  syncIfConnected,
} from '@/src/utils/driveSync';
import { registerQuickFill } from '@/src/quick-fill/background';
import { createAutofillCoordinator, RUN_ALARM_PREFIX } from '@/src/autofill/runCoordinator';

export default defineBackground(() => {
  const autofill = createAutofillCoordinator();
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (
      ![
        'AUTOFILL_RUN_START',
        'AUTOFILL_RUN_STATUS',
        'AUTOFILL_RUN_CONFIRM',
        'AUTOFILL_RUN_CANCEL',
      ].includes(message.action)
    )
      return;
    // Only extension popup pages can start or control a run on another tab.
    if (
      sender.id !== chrome.runtime.id ||
      !sender.url?.startsWith(chrome.runtime.getURL('popup.html'))
    )
      return;
    if (!Number.isInteger(message.tabId) || message.tabId < 0) return;
    const task =
      message.action === 'AUTOFILL_RUN_START'
        ? autofill.start(message.tabId)
        : message.action === 'AUTOFILL_RUN_STATUS'
          ? autofill.status(message.tabId)
          : message.action === 'AUTOFILL_RUN_CONFIRM'
            ? typeof message.runId === 'string' && ['merge', 'overwrite'].includes(message.mode)
              ? autofill.confirm(message.tabId, message.runId, message.mode)
              : Promise.resolve(null)
            : autofill.cancel(message.tabId, message.runId).then(() => null);
    task.then(respond).catch(() => respond(null));
    return true;
  });
  chrome.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId === 0)
      void autofill.navigated(details.tabId, details.documentId).catch(() => {});
  });
  chrome.tabs.onRemoved.addListener((tabId) => {
    void autofill.cancel(tabId).catch(() => {});
  });
  // On browser startup, retry any deferred Drive upload. Silent — failures
  // are captured in driveBackupState by syncProfileToDrive itself.
  chrome.runtime.onStartup.addListener(() => {
    void refreshDriveConnection();
    void retryPendingDriveSync();
  });
  chrome.alarms?.onAlarm.addListener((alarm) => {
    if (alarm.name.startsWith(RUN_ALARM_PREFIX)) {
      const tabId = Number(alarm.name.slice(RUN_ALARM_PREFIX.length));
      if (Number.isInteger(tabId)) void autofill.recover(tabId).catch(() => {});
    }
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
  registerQuickFill(autofill);
});
