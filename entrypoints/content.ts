import { scanAutofill, executeAutofill, undoAutofill, getLastResult, getDebugSession } from '@/src/autofill/index';

export default defineContentScript({
  matches: ['*://*/*'],
  main() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.action === 'AUTOFILL_SCAN') {
        scanAutofill()
          .then(sendResponse)
          .catch(() => sendResponse({ preFilledCount: 0, totalMatched: 0 }));
        return true;
      }

      if (message.action === 'AUTOFILL_FILL') {
        const mode: 'merge' | 'overwrite' = message.mode === 'merge' ? 'merge' : 'overwrite';
        executeAutofill(mode)
          .then(sendResponse)
          .catch(() => sendResponse({ noReview: 0, needReview: 0, lowConfidence: 0, noData: 0, totalScanned: 0 }));
        return true;
      }

      if (message.action === 'CLEAR') {
        undoAutofill();
        sendResponse({ success: true });
        return true;
      }

      if (message.action === 'GET_STATUS') {
        sendResponse(getLastResult());
        return true;
      }

      if (message.action === 'GET_DEBUG_SESSION') {
        sendResponse(getDebugSession());
        return true;
      }
    });
  },
});
