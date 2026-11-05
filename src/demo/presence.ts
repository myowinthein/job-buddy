const CHANNEL = 'job-buddy-demo';

export function isDemoURL(url: URL): boolean {
  if (url.origin === 'https://myowinthein.github.io')
    return /^\/job-buddy\/demo\/(?:index\.html)?$/.test(url.pathname);
  return (
    url.protocol === 'http:' &&
    ['127.0.0.1', 'localhost'].includes(url.hostname) &&
    /^\/(?:docs\/|job-buddy\/)?demo\/(?:index\.html)?$/.test(url.pathname)
  );
}

// Only acknowledge presence on our demo. Never forward page messages to Chrome
// APIs, start a fill, or expose settings/profile data through this channel.
export function installDemoPresence(): void {
  if (window.top !== window || !isDemoURL(new URL(location.href))) return;
  const active = () => {
    try {
      return Boolean(chrome.runtime?.id);
    } catch {
      return false; // An older content script can remain after extension reload.
    }
  };
  window.addEventListener('message', (event: MessageEvent) => {
    const data = event.data;
    if (
      event.source !== window ||
      event.origin !== location.origin ||
      !isDemoURL(new URL(location.href)) ||
      data?.channel !== CHANNEL ||
      data.type !== 'presence-request' ||
      typeof data.requestId !== 'string' ||
      !/^[a-zA-Z0-9-]{1,64}$/.test(data.requestId) ||
      !active()
    )
      return;
    window.postMessage(
      { channel: CHANNEL, type: 'presence-response', requestId: data.requestId },
      location.origin,
    );
  });
  // Handles injection after the page's first request, including a new install.
  if (active()) window.postMessage({ channel: CHANNEL, type: 'presence-ready' }, location.origin);
}
