// All form behavior is local. There is no submission endpoint or entry storage.
const sourceGuide = new URLSearchParams(location.search).get('from');
if (sourceGuide === 'walkthrough' || sourceGuide === 'developers') {
  const returnLink = document.querySelector('#return-to-guide');
  returnLink.href = sourceGuide === 'developers' ? '../developers/' : '../';
  returnLink.hidden = false;
}
const form = document.querySelector('#application');
const completion = document.querySelector('#completion');
const limitedFields = [...form.querySelectorAll('[data-maxlength]')];
const composing = new Set();
// Refresh custom constraints before native validity checks, including programmatic values.
form.noValidate = true;
let countTimer;
function updateLength(field) {
  if (composing.has(field)) return;
  const limit = Number(field.dataset.maxlength);
  const over = field.value.length > limit;
  const id = `${field.id}-limit`;
  let hint = document.getElementById(id);
  if (!hint) {
    hint = document.createElement('p');
    hint.id = id;
    hint.className = 'field-limit';
    field.after(hint);
    field.setAttribute('aria-describedby', [field.getAttribute('aria-describedby'), id].filter(Boolean).join(' '));
  }
  const message = over
    ? `${field.value.length - limit} ${field.value.length - limit === 1 ? 'character' : 'characters'} over the ${limit}-character limit`
    : `${field.value.length} / ${limit} characters`;
  field.setCustomValidity(over ? `Use ${limit} characters or fewer.` : '');
  if (over) field.setAttribute('aria-invalid', 'true');
  else field.removeAttribute('aria-invalid');
  hint.dataset.over = String(over);
  hint.hidden = field.id !== 'interest' && !over;
  hint.textContent = field.id === 'interest' && field.value.length < limit * 0.8
    ? `Up to ${limit} characters` : message;
  if (field.id === 'interest') {
    clearTimeout(countTimer);
    countTimer = setTimeout(() => {
      document.getElementById('interest-count-status').textContent = field.value.length >= limit * 0.8 ? message : '';
    }, 650);
  }
}
limitedFields.forEach((field) => {
  field.addEventListener('input', () => updateLength(field));
  field.addEventListener('change', () => updateLength(field));
  field.addEventListener('compositionstart', () => { composing.add(field); clearTimeout(countTimer); });
  field.addEventListener('compositionend', () => { composing.delete(field); updateLength(field); });
});
form.addEventListener('submit', (event) => {
  event.preventDefault();
  limitedFields.forEach(updateLength);
  if (!form.reportValidity()) return;
  completion.hidden = false;
  completion.focus();
});
document.querySelector('#submit').disabled = false;
form.addEventListener('reset', (event) => {
  event.preventDefault();
  window.scrollTo(0, 0);
  location.reload();
});
