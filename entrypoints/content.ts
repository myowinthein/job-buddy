import { runAutofill, clearHighlights } from '@/src/autofill/index';

export default defineContentScript({
  matches: ['*://*/*'],
  main() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.action === 'AUTOFILL') {
        runAutofill()
          .then(sendResponse)
          .catch(() => sendResponse({ filled: 0, review: 0, unmatched: 0, totalScanned: 0 }));
        return true; // keep message channel open for async response
      }

      if (message.action === 'CLEAR') {
        clearHighlights();
        sendResponse({ success: true });
        return true;
      }
    });
  },
});
