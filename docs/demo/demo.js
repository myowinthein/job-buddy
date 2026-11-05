// This page has no submission endpoint, analytics, or storage of form entries.
// Job Buddy's own provider requests remain part of the extension's normal flow.
const form = document.querySelector('#application');
const completion = document.querySelector('#completion');
const testFields = document.querySelector('#test-fields');
const testToggle = document.querySelector('#test-mode');
const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const counters = { work: 0, education: 0 };

form.addEventListener('submit', (event) => {
  event.preventDefault();
  completion.hidden = false;
  completion.focus();
});
document.querySelector('#finish-demo').disabled = false;

function setTestMode(enabled) {
  testFields.hidden = !enabled;
  testToggle.setAttribute('aria-pressed', String(enabled));
  testToggle.textContent = enabled ? 'Hide test fields' : 'Show test fields';
  for (const control of testFields.querySelectorAll('input, select, textarea'))
    control.disabled = !enabled;
}

function addEntry(type) {
  const index = ++counters[type];
  const work = type === 'work';
  const entry = document.createElement('fieldset');
  entry.className = 'entry field';
  const heading = document.createElement('legend');
  heading.textContent = `${work ? 'Experience' : 'Education'} ${index}`;
  entry.append(heading);
  const grid = document.createElement('div');
  grid.className = 'field-grid';
  const fields = work
    ? [
        ['Company', 'company', 'text'],
        ['Job title', 'title', 'text'],
        ['Start date', 'startDate', 'month'],
        ['End date', 'endDate', 'month'],
      ]
    : [
        ['Institution', 'institution', 'text'],
        ['Degree', 'degree', 'text'],
        ['Field of study', 'fieldOfStudy', 'text'],
        ['Graduation year', 'graduationYear', 'number'],
      ];
  for (const [title, key, inputType] of fields) {
    const field = document.createElement('div');
    field.className = 'field';
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.id = `${type}-${index - 1}-${key}`;
    input.name = `${work ? 'workHistory' : 'education'}[${index - 1}].${key}`;
    input.type = inputType;
    input.disabled = testFields.hidden;
    label.htmlFor = input.id;
    label.textContent = title;
    if (inputType === 'number') {
      input.min = '1900';
      input.max = '2100';
      input.step = '1';
    } else if (inputType === 'text') input.maxLength = 200;
    field.append(label, input);
    grid.append(field);
  }
  entry.append(grid);
  const actions = document.createElement('div');
  actions.className = 'entry-actions';
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'text-button';
  remove.textContent = 'Remove entry';
  remove.setAttribute('aria-label', `Remove ${heading.textContent.toLowerCase()}`);
  remove.addEventListener('click', () => {
    entry.remove();
    document.querySelector(work ? '#add-work' : '#add-education').focus();
  });
  actions.append(remove);
  entry.append(actions);
  document.querySelector(work ? '#work-entries' : '#education-entries').append(entry);
  return entry;
}

if (local) {
  document.querySelector('#test-controls').hidden = false;
  for (const type of ['work', 'education']) {
    addEntry(type);
    addEntry(type);
  }
  setTestMode(new URL(location.href).searchParams.get('test') === '1');
  testToggle.addEventListener('click', () => setTestMode(testFields.hidden));
  for (const type of ['work', 'education']) {
    document.querySelector(`#add-${type}`).addEventListener('click', () => {
      const entry = addEntry(type);
      entry.querySelector('input').focus();
    });
  }
  document.querySelector('#existing-answers').addEventListener('click', () => {
    for (const [id, value] of [
      ['first-name', 'Existing name'],
      ['city', 'Existing city'],
    ]) {
      const input = document.getElementById(id);
      input.value = value;
      input.dispatchEvent(
        new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }),
      );
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    document.querySelector('#first-name').focus();
  });
}

form.addEventListener('reset', (event) => {
  event.preventDefault();
  // A fresh document also clears extension feedback and pending scan state.
  window.scrollTo(0, 0);
  location.reload();
});
