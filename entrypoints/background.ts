import {
  saveLearnedObservationLocally,
  saveLearnedMappings,
  repairLearnedMappings,
  validObservation,
} from '@/src/utils/storage';
import type { LearnedMappings } from '@/src/types/storage';
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
import { registerDevelopmentContentScript } from '@/src/devtools/registerContentScript';
import { retainFrameFillLog } from '@/src/fill-log/retention';
import { senderDomain, validLabelSignals } from '@/src/utils/senderValidation';

export default defineBackground(() => {
  // WXT's dev manifest has no static content script. Register it even if the
  // hot-reload server is offline when this worker starts.
  if (import.meta.env.DEV)
    void registerDevelopmentContentScript().catch((error) => {
      console.warn('[Job Buddy] Development content script registration failed:', error);
    });
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
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (!['SAVE_LEARNED_OBSERVATION', 'SAVE_LEARNED_LABELS', 'REPAIR_LEARNED_MAPPINGS']
      .includes(message?.action)) return;
    if (sender.id !== chrome.runtime.id || !sender.tab || !sender.url) return;
    const domain = senderDomain(sender);
    if (!domain) return;
    if (message.action === 'REPAIR_LEARNED_MAPPINGS') {
      repairLearnedMappings(domain, message.fields, message.context)
        .then((mappings) => respond({ ok: true, mappings }))
        .catch(() => respond({ ok: false }));
      return true;
    }
    let task: Promise<void>;
    if (message.action === 'SAVE_LEARNED_OBSERVATION') {
      if (!validObservation(message.observation)) return;
      task = saveLearnedObservationLocally(domain, message.observation);
    } else {
      const signals = validLabelSignals(message.mappings, domain);
      if (!signals) return;
      task = saveLearnedMappings({ [domain]: signals } as LearnedMappings, { labelsOnly: true });
    }
    task.then(() => respond({ ok: true })).catch(() => respond({ ok: false }));
    return true;
  });
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.action !== 'FILL_DETAILS_UPDATED') return;
    if (
      sender.id !== chrome.runtime.id ||
      !sender.tab ||
      !sender.url ||
      (!/^https?:/.test(sender.url) && !/^https?:/.test(sender.origin ?? ''))
    )
      return;
    retainFrameFillLog(sender, message.log, message.profileId)
      .then(() => respond({ ok: true }))
      .catch(() => respond({ ok: false }));
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
