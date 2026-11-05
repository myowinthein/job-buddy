// Presence only: no profile, credentials, or autofill actions cross this channel.
const setupNotice = document.querySelector('#job-buddy-setup');
let requestId;
let detectionTimer;
function checkJobBuddy() {
  clearTimeout(detectionTimer);
  requestId = crypto.randomUUID();
  detectionTimer = setTimeout(() => {
    setupNotice.dataset.status = 'not-detected';
    setupNotice.hidden = false;
  }, 1200);
  window.postMessage(
    { channel: 'job-buddy-demo', type: 'presence-request', requestId },
    location.origin,
  );
}
window.addEventListener('message', (event) => {
  if (
    event.source !== window ||
    event.origin !== location.origin ||
    event.data?.channel !== 'job-buddy-demo'
  )
    return;
  if (event.data.type === 'presence-ready') checkJobBuddy();
  if (event.data.type === 'presence-response' && event.data.requestId === requestId) {
    clearTimeout(detectionTimer);
    setupNotice.dataset.status = 'detected';
    setupNotice.hidden = true;
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkJobBuddy();
});
window.addEventListener('pageshow', checkJobBuddy);
checkJobBuddy();
