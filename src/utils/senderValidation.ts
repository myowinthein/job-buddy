/**
 * The page domain a content-script sender belongs to. Inherited-origin frames
 * (about:blank, srcdoc) use the sender's origin; non-HTTP senders have none.
 */
export function senderDomain(sender: chrome.runtime.MessageSender): string | null {
  try {
    const url = new URL(/^https?:/.test(sender.url ?? '') ? sender.url! : (sender.origin ?? ''));
    return ['http:', 'https:'].includes(url.protocol) ? url.hostname : null;
  } catch {
    return null;
  }
}

/** A label patch is an object of strings or counted entries for one domain. */
export function validLabelSignals(mappings: unknown, domain: string): object | null {
  const signals = (mappings as Record<string, unknown> | null | undefined)?.[domain];
  if (!signals || typeof signals !== 'object' || Array.isArray(signals)) return null;
  const valid = Object.values(signals).every(
    (value) =>
      typeof value === 'string' ||
      (value &&
        typeof value === 'object' &&
        typeof (value as { path?: unknown }).path === 'string'),
  );
  return valid ? signals : null;
}
