// Completion is local; this form has no submission endpoint or stored entries.
const form = document.querySelector('#application');
const completion = document.querySelector('#completion');

form.addEventListener('submit', (event) => {
  event.preventDefault();
  completion.hidden = false;
  completion.focus();
});
document.querySelector('#finish-demo').disabled = false;

form.addEventListener('reset', (event) => {
  event.preventDefault();
  // A fresh document also clears extension feedback and pending scan state.
  window.scrollTo(0, 0);
  location.reload();
});
