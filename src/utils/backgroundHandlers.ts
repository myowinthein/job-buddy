// Extracted from entrypoints/background.ts so this logic is testable — WXT
// treats every file under entrypoints/ as a browser entrypoint, so test files
// can't live there (see CLAUDE.md's "WXT entrypoint collision" trap).

// Content scripts cannot write to chrome.storage.session (blocked without
// host_permissions for the page URL), so the picker passes focusPath here
// and the background writes it — service workers have unrestricted access.
export function handleOpenOptions(
  focusPath: string | undefined,
  sendResponse: (response: { success: boolean }) => void,
): void {
  const writeAndOpen = () => {
    chrome.runtime.openOptionsPage(() => {
      sendResponse({ success: !chrome.runtime.lastError });
    });
  };
  if (focusPath) {
    chrome.storage.session.set(
      { 'jb:focusOnLoad': { type: 'profilePath', path: focusPath } },
      writeAndOpen,
    );
  } else {
    writeAndOpen();
  }
}
