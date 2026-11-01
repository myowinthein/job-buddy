// Keep WXT's ID so its hot-reload updates this registration rather than adding
// a second script. Production uses the generated static manifest entry.
export const DEV_CONTENT_SCRIPT_ID = 'wxt:content-scripts/content.js';

export async function registerDevelopmentContentScript(): Promise<void> {
  const script: chrome.scripting.RegisteredContentScript = {
    id: DEV_CONTENT_SCRIPT_ID,
    matches: ['*://*/*'],
    js: ['content-scripts/content.js'],
    allFrames: true,
    matchOriginAsFallback: true,
    runAt: 'document_idle',
    persistAcrossSessions: true,
  };
  const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [script.id] });
  if (registered.length) {
    await chrome.scripting.updateContentScripts([script]);
    return;
  }
  try {
    await chrome.scripting.registerContentScripts([script]);
  } catch (error) {
    // WXT can register the same ID while its websocket connects. Reconcile that
    // race without hiding actual permission or registration failures.
    const current = await chrome.scripting.getRegisteredContentScripts({ ids: [script.id] });
    if (!current.length) throw error;
    await chrome.scripting.updateContentScripts([script]);
  }
}
