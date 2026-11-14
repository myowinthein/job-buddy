function syncOlderControls(hosts: Element[], blocked: boolean) {
  // The marker is shared across isolated worlds so only controls we disabled are restored.
  const marker = 'data-job-buddy-peer-disabled';
  for (const host of hosts) {
    for (const button of host.shadowRoot?.querySelectorAll<HTMLButtonElement>(
      'button.fill, button.undo',
    ) ?? []) {
      if (blocked && !button.disabled) {
        button.setAttribute(marker, '');
        button.disabled = true;
      } else if (!blocked && button.hasAttribute(marker)) {
        button.removeAttribute(marker);
        button.disabled = button.matches('.fill') && !!host.shadowRoot?.querySelector('.spin');
      }
    }
  }
}

/** Runs synchronously in the top document so extension worlds claim one shared lease. */
export function pageActivity(
  action: 'claim' | 'release' | 'blocked',
  owner: string,
  token = '',
  until = 0,
): boolean {
  const attribute = 'data-job-buddy-activity';
  const root = document.documentElement;
  if (!root) return action === 'blocked';
  let current: { owner: string; token: string; until: number } | undefined;
  try {
    const raw = root.getAttribute(attribute);
    const value = raw && raw.length <= 1024 ? JSON.parse(raw) : null;
    if (
      value &&
      typeof value.owner === 'string' &&
      typeof value.token === 'string' &&
      typeof value.until === 'number' &&
      Number.isFinite(value.until) &&
      value.until > Date.now()
    )
      current = value;
  } catch {
    /* Ignore malformed page metadata. */
  }
  const legacy = [...document.querySelectorAll('[data-job-buddy-ui]:not([data-job-buddy-owner])')];
  if (!current) root.removeAttribute(attribute);
  if (action === 'release') {
    if (current?.owner === owner && current.token === token) {
      root.removeAttribute(attribute);
      current = undefined;
    }
    syncOlderControls(legacy, !!current);
    return true;
  }
  // Older builds advertise filling through the spinner in their floating control.
  const legacyBusy = legacy.some((host) => !!host.shadowRoot?.querySelector('.spin'));
  syncOlderControls(legacy, !!current);
  if (action === 'blocked') return (!!current && current.owner !== owner) || legacyBusy;
  if (legacyBusy || (current && (current.owner !== owner || current.token !== token))) return false;
  if (!owner || !token || until <= Date.now()) return false;
  root.setAttribute(attribute, JSON.stringify({ owner, token, until }));
  syncOlderControls(legacy, true);
  return true;
}

export async function tabActivity(
  tabId: number,
  action: 'claim' | 'release' | 'blocked',
  token = '',
  until = 0,
  documentId?: string,
): Promise<boolean> {
  const result = await chrome.tabs.sendMessage(
    tabId,
    { action: 'AUTOFILL_PAGE_ACTIVITY', operation: action, token, until },
    { frameId: 0, ...(documentId ? { documentId } : {}) },
  );
  if (typeof result !== 'boolean') throw new Error('The application page must be refreshed');
  return result;
}
