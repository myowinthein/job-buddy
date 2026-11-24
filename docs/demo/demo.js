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
const clearCompletion = () => { completion.hidden = true; };
form.addEventListener('input', clearCompletion);
form.addEventListener('change', clearCompletion);
const validationFields = [...form.querySelectorAll('input, select, textarea')].filter(
  (field, index, fields) => field.willValidate && (field.type !== 'radio'
    || fields.findIndex((other) => other.type === 'radio' && other.name === field.name) === index),
);
let validationShown = false;
function updateValidation(field) {
  const group = field.type === 'radio'
    ? [...form.querySelectorAll('input[type="radio"]')].filter((other) => other.name === field.name)
    : [field];
  const invalid = !field.validity.valid;
  const id = `${field.id || field.name}-error`;
  let error = document.getElementById(id);
  // Overlength fields already have a specific, associated error from updateLength.
  const showError = invalid && !(field.dataset.maxlength && field.value.length > Number(field.dataset.maxlength));
  if (showError) {
    if (!error) {
      error = document.createElement('p');
      error.id = id;
      error.className = 'field-error';
      const anchor = field.type === 'radio'
        ? field.closest('fieldset').querySelector('.radio-options')
        : field.closest('.consent') || field;
      anchor.after(error);
    }
    error.textContent = field.validationMessage;
  } else error?.remove();
  group.forEach((control) => {
    if (invalid) control.setAttribute('aria-invalid', 'true');
    else control.removeAttribute('aria-invalid');
    const descriptions = (control.getAttribute('aria-describedby') || '').split(/\s+/).filter((token) => token && token !== id);
    if (showError) descriptions.push(id);
    if (descriptions.length) control.setAttribute('aria-describedby', descriptions.join(' '));
    else control.removeAttribute('aria-describedby');
  });
}
function refreshValidation() {
  if (validationShown) validationFields.forEach(updateValidation);
}
form.addEventListener('input', refreshValidation);
form.addEventListener('change', refreshValidation);
form.addEventListener('submit', (event) => {
  event.preventDefault();
  clearCompletion();
  limitedFields.forEach(updateLength);
  validationShown = true;
  refreshValidation();
  const invalid = validationFields.find((field) => !field.validity.valid);
  if (invalid) {
    invalid.focus({ preventScroll: true });
    invalid.scrollIntoView({ block: 'center' });
    return;
  }
  completion.hidden = false;
  completion.focus();
});
document.querySelector('#submit').disabled = false;
form.addEventListener('reset', (event) => {
  event.preventDefault();
  window.scrollTo(0, 0);
  location.reload();
});
