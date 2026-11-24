// WXT replaces this with the configured server origin, including test ports.
declare const __DEV_SERVER_ORIGIN__: string;

const SERVER_CHECK_INTERVAL = 2000;
const SERVER_CHECK_TIMEOUT = 1500;
const SERVER_STATUS_MESSAGE = 'JB_DEV_SERVER_AVAILABLE';

export function registerDevelopmentServerAvailability(): void {
  const url = new URL('/@vite/client', __DEV_SERVER_ORIGIN__.replace(/^ws/, 'http')).href;
  let pending: Promise<boolean> | undefined;
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message.action !== SERVER_STATUS_MESSAGE || sender.id !== chrome.runtime.id) return;
    // Share concurrent checks from open forms; never ask a job page to contact localhost.
    pending ??= fetch(url, {
      method: 'HEAD',
      cache: 'no-store',
      signal: AbortSignal.timeout(SERVER_CHECK_TIMEOUT),
    })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        pending = undefined;
      });
    void pending.then(respond);
    return true;
  });
}

export function watchDevelopmentServer(onChange: (available: boolean) => void): () => void {
  let stopped = false;
  let checking = false;
  let available = false;
  const check = async () => {
    if (stopped || checking) return;
    checking = true;
    let next = false;
    try {
      next = (await chrome.runtime.sendMessage({ action: SERVER_STATUS_MESSAGE })) === true;
    } catch {
      // Worker shutdown and extension reload both hide stale development controls.
    } finally {
      checking = false;
    }
    if (stopped || next === available) return;
    available = next;
    onChange(next);
  };
  const visibility = () => {
    if (document.visibilityState === 'visible') void check();
  };
  document.addEventListener('visibilitychange', visibility);
  const timer = setInterval(() => void check(), SERVER_CHECK_INTERVAL);
  void check();
  return () => {
    stopped = true;
    clearInterval(timer);
    document.removeEventListener('visibilitychange', visibility);
  };
}
