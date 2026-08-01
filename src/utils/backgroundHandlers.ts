// Extracted from entrypoints/background.ts so this logic is testable — WXT
// treats every file under entrypoints/ as a browser entrypoint, so test files
// can't live there (see CLAUDE.md's "WXT entrypoint collision" trap).

import { sessionSet } from './sessionStorage';

// Content scripts cannot write to chrome.storage.session (blocked without
// host_permissions for the page URL), so the picker passes focusPath here
// and the background writes it — service workers have unrestricted access.
export async function handleOpenOptions(
  focusPath: string | undefined,
  sendResponse: (response: { success: boolean }) => void,
): Promise<void> {
  if (focusPath) {
    await sessionSet({ 'jb:focusOnLoad': { type: 'profilePath', path: focusPath } });
  }
  chrome.runtime.openOptionsPage(() => {
    sendResponse({ success: !chrome.runtime.lastError });
  });
}
