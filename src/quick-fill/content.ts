import type { AutofillRun } from '@/src/autofill/runCoordinator';
import { likelyApplicationForm, QUICK_FILL_HOST } from './detect';
import {
  getQuickFillPreferences,
  normalizePreferences,
  QUICK_FILL_KEY,
  type QuickFillPreferences,
} from './preferences';
import { QuickFillWidget } from './widget';

export function installQuickFill(): void {
  const main = window === window.top;
  let candidate = false;
  let prefs: QuickFillPreferences = { enabled: true, disabledSites: [] };
  let ready = false,
    hidden = false,
    forced = false,
    disposed = false;
  let widget: QuickFillWidget | undefined;
  let run: AutofillRun | null = null;
  let revision = 0;
  let starting = false,
    statusReading = false,
    detecting = false,
    detectAgain = false;
  let theme = 'system',
    shortcut = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  let poll: ReturnType<typeof setInterval> | undefined;
  const media = matchMedia('(prefers-color-scheme: dark)');
  const request = async (action: string, extra = {}) => {
    const result = await chrome.runtime.sendMessage({ action: `JB_QUICK_${action}`, ...extra });
    if (result?.quickFillError) throw new Error('Quick fill unavailable');
    return result;
  };
  const allowed = () => ready && prefs.enabled && !prefs.disabledSites.includes(location.hostname);
  const paint = () => {
    if (!main || disposed) return;
    if (!allowed() || hidden || (!candidate && !forced)) {
      widget?.destroy();
      widget = undefined;
      return;
    }
    if (!widget) {
      widget = new QuickFillWidget({
        fill: () => {
          if (starting || run?.stage === 'scanning' || run?.stage === 'filling') return;
          const currentRevision = ++revision;
          starting = true;
          paint();
          void request('START')
            .then((next) => {
              if (currentRevision !== revision) return;
              run = next;
              starting = false;
              paint();
            })
            .catch(() => {
              if (currentRevision !== revision) return;
              starting = false;
              widget?.error('Open the Job Buddy popup to try again.');
            });
        },
        undo: () => {
          ++revision;
          const id = run?.runId;
          void request('UNDO', { runId: id })
            .then((success) => {
              if (!success) throw new Error('Undo failed');
              run = null;
              paint();
            })
            .catch(() =>
              widget?.error('Some fields could not be undone. Refresh the form to clear them.'),
            );
        },
        details: () => {
          void request('DETAILS').catch(() =>
            widget?.error('Please try opening Fill Details again.'),
          );
        },
        hide: () => {
          hidden = true;
          paint();
        },
        disableSite: () => {
          void request('DISABLE_SITE').catch(() =>
            widget?.error('Could not save this site preference. Try again.'),
          );
        },
        settings: () => {
          void request('SETTINGS').catch(() =>
            widget?.error('Open Settings from the Job Buddy popup.'),
          );
        },
        position: (position) => {
          prefs = { ...prefs, position };
          void request('POSITION', { position }).catch(() =>
            widget?.error('Could not save the button position.'),
          );
        },
      });
      widget.shortcut(shortcut);
    }
    widget.preferences(prefs, theme === 'dark' || (theme !== 'light' && media.matches));
    widget.render(run, starting);
  };
  const readStatus = async () => {
    if (!main || statusReading || disposed || !allowed()) return;
    statusReading = true;
    const currentRevision = revision;
    try {
      const next = await request('STATUS');
      if (currentRevision !== revision) return;
      run = next;
      // A run reported by the worker has accepted the start request.
      if (run) starting = false;
      paint();
      clearInterval(poll);
      if (run?.stage === 'scanning' || run?.stage === 'filling')
        poll = setInterval(() => {
          void readStatus();
        }, 1000);
    } catch {
      /* Popup remains available if a worker is being updated. */
    } finally {
      statusReading = false;
    }
  };
  const detect = async () => {
    if (disposed || !allowed() || document.visibilityState === 'hidden') return;
    if (detecting) {
      detectAgain = true;
      return;
    }
    detecting = true;
    try {
      const local = likelyApplicationForm(document, observeRoot);
      if (!main) {
        candidate = local;
        await request('FORM_CHANGED');
      } else {
        // Each frame evaluates only its own DOM. The worker relays booleans.
        candidate = local || (await request('DETECT')) === true;
        paint();
      }
    } catch {
      candidate = likelyApplicationForm();
      paint();
    } finally {
      detecting = false;
      if (detectAgain) {
        detectAgain = false;
        schedule();
      }
    }
  };
  const schedule = () => {
    if (timer || disposed || !allowed()) return;
    timer = setTimeout(() => {
      timer = undefined;
      void detect();
    }, 500);
  };
  const observer = new MutationObserver((records) => {
    if (
      records.some(
        (record) =>
          !(record.target instanceof Element && record.target.closest(`[${QUICK_FILL_HOST}]`)),
      )
    )
      schedule();
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['hidden', 'aria-hidden', 'class'],
  });
  const observed = new WeakSet<Node>([document.documentElement]);
  const observeRoot = (root: ParentNode) => {
    if (root instanceof ShadowRoot && !observed.has(root)) {
      observed.add(root);
      observer.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['hidden', 'aria-hidden', 'class'],
      });
    }
  };
  const visibility = () => {
    if (document.visibilityState === 'visible') {
      schedule();
      void readStatus();
    }
  };
  document.addEventListener('visibilitychange', visibility);
  document.addEventListener('load', schedule, true);
  const onTheme = () => paint();
  media.addEventListener('change', onTheme);
  const messages = (
    message: { action?: string },
    sender: chrome.runtime.MessageSender,
    respond: (result?: unknown) => void,
  ) => {
    if (sender.id !== chrome.runtime.id) return;
    if (message.action === 'JB_FORM_CANDIDATE') {
      respond(allowed() && likelyApplicationForm());
      return;
    }
    if (!main) return;
    if (message.action === 'JB_QUICK_REFRESH') schedule();
    if (message.action === 'JB_QUICK_RUN_CHANGED') void readStatus();
    if (message.action === 'JB_QUICK_REVEAL') {
      hidden = false;
      forced = true;
      paint();
      respond(true);
    }
  };
  chrome.runtime.onMessage.addListener(messages);
  const storage = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== 'local') return;
    if (QUICK_FILL_KEY in changes) {
      prefs = normalizePreferences(changes[QUICK_FILL_KEY].newValue);
      paint();
      schedule();
    }
    if (
      main &&
      ['profile', 'geminiApiKey', 'geminiModel'].some((key) => key in changes) &&
      run?.stage === 'error'
    ) {
      void request('ACK_SETUP')
        .then(() => readStatus())
        .catch(() => {});
    }
    if ('themePreference' in changes) {
      theme = String(changes.themePreference.newValue ?? 'system');
      paint();
    }
  };
  chrome.storage.onChanged.addListener(storage);
  void (async () => {
    try {
      prefs = await getQuickFillPreferences();
      theme = String(
        (await chrome.storage.local.get('themePreference')).themePreference ?? 'system',
      );
      ready = true;
      schedule();
      if (main) {
        shortcut = await request('SHORTCUT');
        widget?.shortcut(shortcut);
        await readStatus();
      }
    } catch {
      /* Fail closed: a storage error must not enable disabled page UI. */
    }
  })();
  window.addEventListener('pagehide', (event) => {
    if (event.persisted) return;
    disposed = true;
    clearTimeout(timer);
    clearInterval(poll);
    observer.disconnect();
    widget?.destroy();
    chrome.runtime.onMessage.removeListener(messages);
    chrome.storage.onChanged.removeListener(storage);
    document.removeEventListener('visibilitychange', visibility);
    document.removeEventListener('load', schedule, true);
    media.removeEventListener('change', onTheme);
  });
}
