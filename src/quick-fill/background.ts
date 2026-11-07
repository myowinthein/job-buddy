import type { AutofillCoordinator } from '@/src/autofill/runCoordinator';
import { openFillLog } from '@/src/fill-log/client';
import { getQuickFillPreferences, updateQuickFillPreferences } from './preferences';
import { sessionSet } from '@/src/utils/sessionStorage';
import { isAISetupError, isProfileSetupError, isSetupError } from '@/src/autofill/errorCodes';

async function openSetup(error?: string) {
  if (isAISetupError(error)) await sessionSet({ 'jb:focusOnLoad': 'gemini-api-key' });
  if (isProfileSetupError(error))
    await sessionSet({ 'jb:focusOnLoad': 'field-firstName' });
  await chrome.runtime.openOptionsPage();
}
export function quickFillSenderTab(sender: chrome.runtime.MessageSender): number | null {
  // A content script can control only its own tab and only from the main frame.
  if (
    sender.id !== chrome.runtime.id ||
    sender.frameId !== 0 ||
    !sender.url ||
    !/^https?:\/\//.test(sender.url) ||
    !Number.isInteger(sender.tab?.id) ||
    (sender.tab?.id ?? -1) < 0
  )
    return null;
  return sender.tab!.id!;
}
async function frameCandidates(tabId: number) {
  const frames = await chrome.webNavigation.getAllFrames({ tabId });
  const answers = await Promise.all(
    (frames ?? [{ frameId: 0 }]).map(async (frame) => {
      try {
        return await chrome.tabs.sendMessage(
          tabId,
          { action: 'JB_FORM_CANDIDATE' },
          {
            frameId: frame.frameId,
            ...('documentId' in frame && frame.documentId ? { documentId: frame.documentId } : {}),
          },
        );
      } catch {
        return false;
      }
    }),
  );
  return answers.some((answer) => answer === true);
}
export function registerQuickFill(autofill: AutofillCoordinator): void {
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (typeof message?.action !== 'string' || !message.action.startsWith('JB_QUICK_')) return;
    if (message.action === 'JB_QUICK_FORM_CHANGED') {
      if (sender.id === chrome.runtime.id && sender.tab?.id !== undefined && sender.frameId !== 0)
        void chrome.tabs
          .sendMessage(sender.tab.id, { action: 'JB_QUICK_REFRESH' }, { frameId: 0 })
          .catch(() => {});
      return;
    }
    const tabId = quickFillSenderTab(sender);
    if (tabId === null) return;
    const task = async () => {
      switch (message.action) {
        case 'JB_QUICK_POSITION': {
          const p = message.position;
          if (
            !p ||
            typeof p.x !== 'number' ||
            typeof p.y !== 'number' ||
            !Number.isFinite(p.x) ||
            !Number.isFinite(p.y)
          )
            return false;
          await updateQuickFillPreferences({ position: { x: p.x, y: p.y } });
          return true;
        }
        case 'JB_QUICK_DISABLE_SITE':
          await updateQuickFillPreferences((current) => ({
            disabledSites: [...new Set([...current.disabledSites, new URL(sender.url!).hostname])],
          }));
          return true;
        case 'JB_QUICK_DETECT':
          return frameCandidates(tabId);
        case 'JB_QUICK_ACK_SETUP': {
          const run = await autofill.status(tabId);
          if (run?.stage === 'error' && isSetupError(run.error))
            await autofill.cancel(tabId, run.runId);
          return true;
        }
        case 'JB_QUICK_STATUS':
          return autofill.status(tabId);
        case 'JB_QUICK_START': {
          const { fillMode } = await getQuickFillPreferences();
          const current = await autofill.status(tabId);
          const run =
            current?.stage === 'confirming'
              ? await autofill.confirm(tabId, current.runId, fillMode)
              : await autofill.start(tabId, fillMode, sender.documentId);
          if (run && isSetupError(run.error)) await openSetup(run.error);
          return run;
        }
        case 'JB_QUICK_UNDO': {
          const run = await autofill.status(tabId);
          if (!run || run.stage !== 'completed' || run.runId !== message.runId) return false;
          const cleared = await Promise.all(
            run.frames.map(async (frame) => {
              try {
                const result = await chrome.tabs.sendMessage(
                  tabId,
                  { action: 'CLEAR' },
                  {
                    frameId: frame.frameId,
                    ...(frame.documentId ? { documentId: frame.documentId } : {}),
                  },
                );
                return result?.success === true;
              } catch {
                return false;
              }
            }),
          );
          if (cleared.every(Boolean)) { await autofill.cancel(tabId, run.runId); return true; }
          return false;
        }
        case 'JB_QUICK_DETAILS':
          await openFillLog(tabId);
          return true;
        case 'JB_QUICK_SETTINGS':
          await sessionSet({ 'jb:focusOnLoad': 'quick-fill-enabled' });
          await chrome.runtime.openOptionsPage();
          return true;
      }
      return null;
    };
    task()
      .then(respond)
      .catch(() => respond({ quickFillError: true }));
    return true;
  });
  // Content scripts cannot read session storage. Relay only a change signal;
  // they request sanitized run metadata through the authenticated handler.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'session') return;
    for (const key of Object.keys(changes)) {
      if (!key.startsWith('jb:autofill-run:')) continue;
      const tabId = Number(key.slice('jb:autofill-run:'.length));
      if (Number.isInteger(tabId))
        void chrome.tabs
          .sendMessage(tabId, { action: 'JB_QUICK_RUN_CHANGED' }, { frameId: 0 })
          .catch(() => {});
    }
  });
}
