// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isChoiceGroupAvailable, scanForm } from './scanner';
import { extractSignals } from './signals';
import { fillCheckboxInput, fillField, fillRadioInput, clearFieldValue } from './filler';
import { isConsentGroup } from './consent';

beforeEach(() => {
  document.body.innerHTML = '';
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 100,
    height: 30,
  } as DOMRect);
});
afterEach(() => vi.restoreAllMocks());
const fields = () => scanForm().fields.map((element) => element.id);
const radioPair = (name = 'answer') =>
  `<label><input type="radio" name="${name}" value="yes">Yes</label><label><input type="radio" name="${name}" value="no">No</label>`;

function shadow(id: string, html: string): HTMLElement {
  const host = document.createElement('div');
  host.id = id;
  host.attachShadow({ mode: 'open' }).innerHTML = html;
  document.body.appendChild(host);
  return host;
}

describe('question boundaries and consent', () => {
  it('isolates identical radio names by form, explicit question and shadow root', () => {
    document.body.innerHTML = `<form><fieldset><legend>Work authorization</legend>${radioPair()}</fieldset><fieldset><legend>Privacy consent</legend>${radioPair()}</fieldset></form><form>${radioPair()}</form>`;
    shadow('one', radioPair());
    shadow('two', radioPair());
    const groups = scanForm().radioGroups;
    expect(groups).toHaveLength(5);
    expect(groups.map((group) => group.options.length)).toEqual([2, 2, 2, 2, 2]);
    expect(groups.map((group) => group.isConsent)).toEqual([false, true, false, false, false]);
  });

  it('groups unnamed checkbox options within their question and separates other questions', () => {
    document.body.innerHTML = `<fieldset><legend>Preferred locations</legend><label><input type="checkbox">Remote</label><label><input type="checkbox">Onsite</label></fieldset><fieldset><legend>Languages</legend><label><input type="checkbox">English</label></fieldset>`;
    const groups = scanForm().checkboxGroups;
    expect(groups.map((group) => group.options.map((option) => option.label))).toEqual([
      ['Remote', 'Onsite'],
      ['English'],
    ]);
  });

  it('uses ARIA names for consent options and supports unambiguous processing consent', () => {
    document.body.innerHTML =
      '<input type="checkbox" aria-label="I agree to the privacy policy"><input type="checkbox" aria-label="I accept processing of my personal data">';
    expect(scanForm().checkboxGroups.map((group) => group.isConsent)).toEqual([true, true]);
    expect(
      isConsentGroup({
        groupLabel: 'Which department?',
        options: [{ label: 'Marketing' }, { label: 'Engineering' }],
      }),
    ).toBe(false);
  });

  it.each(['Agree', 'Terms', 'Privacy', 'I accept the confidentiality agreement'])(
    'keeps standalone consent wording excluded: %s',
    (label) => {
      expect(isConsentGroup({ groupLabel: '', options: [{ label }] })).toBe(true);
    },
  );

  it('checks live consent labels and form ownership before applying saved choices', () => {
    document.body.innerHTML = `<form id="a"><fieldset><legend>Work authorization</legend>${radioPair()}</fieldset></form><form id="b"></form>`;
    const group = scanForm().radioGroups[0];
    expect(isChoiceGroupAvailable(group)).toBe(true);
    document.querySelector('legend')!.textContent = 'Privacy consent';
    expect(isChoiceGroupAvailable(group)).toBe(false);
    document.querySelector('legend')!.textContent = 'Work authorization';
    group.options[0].element.setAttribute('form', 'b');
    expect(isChoiceGroupAvailable(group)).toBe(false);
  });
});

describe('ordered discovery and supported widgets', () => {
  it('interleaves native controls, custom widgets and open shadow roots', () => {
    document.body.innerHTML = '<input id="first"><div id="editor" contenteditable=""></div>';
    shadow(
      'host',
      '<input id="shadow"><div id="shadow-editor" contenteditable="plaintext-only"></div>',
    );
    document.body.insertAdjacentHTML('beforeend', '<input id="last">');
    expect(fields()).toEqual(['first', 'editor', 'shadow', 'shadow-editor', 'last']);
  });

  it('places assigned controls at the slot position without scanning them twice', () => {
    const host = shadow('host', '<input id="before"><slot></slot><input id="after">');
    host.innerHTML = '<input id="slotted">';
    expect(fields()).toEqual(['before', 'slotted', 'after']);
  });

  it('owns nested combobox inputs and nested editable nodes only once', () => {
    document.body.innerHTML =
      '<div id="combo" role="combobox"><input id="inner"><button aria-haspopup="listbox">Choose</button></div><div id="outer" contenteditable="true"><span contenteditable="true">Text</span></div>';
    expect(fields()).toEqual(['combo', 'outer']);
  });

  it('supports contenteditable variants and excludes non-answer input types', () => {
    document.body.innerHTML =
      '<div id="empty" contenteditable=""></div><div id="plain" contenteditable="plaintext-only"></div><div contenteditable="false"></div><input type="password"><input type="range"><input type="color"><input type="hidden"><input type="search">';
    expect(fields()).toEqual(['empty', 'plain']);
  });

  it('discovers custom choices and lets their own handlers update state', async () => {
    document.body.innerHTML =
      '<div role="radiogroup" aria-label="Work authorization"><button role="radio" aria-checked="false">Yes</button><button role="radio" aria-checked="false">No</button></div><button id="check" role="checkbox" aria-label="Currently studying here" aria-checked="false"></button>';
    const scan = scanForm();
    expect(scan.radioGroups).toHaveLength(1);
    expect(scan.checkboxGroups).toHaveLength(1);
    expect(scan.fields).toHaveLength(0);
    const radio = scan.radioGroups[0].options[0].element;
    radio.addEventListener('click', () => radio.setAttribute('aria-checked', 'true'));
    expect(await fillRadioInput(radio)).toBe(true);
    const checkbox = document.querySelector<HTMLElement>('#check')!;
    checkbox.addEventListener('click', () =>
      checkbox.setAttribute(
        'aria-checked',
        checkbox.getAttribute('aria-checked') === 'true' ? 'false' : 'true',
      ),
    );
    expect(await fillCheckboxInput(checkbox)).toBe(true);
    clearFieldValue(checkbox);
    expect(checkbox.getAttribute('aria-checked')).toBe('false');
  });
});

describe('eligibility in composed DOM', () => {
  it('keeps fixed-position controls even when offsetParent is null', () => {
    document.body.innerHTML = '<input id="fixed" style="position:fixed">';
    expect(document.querySelector<HTMLElement>('input')!.offsetParent).toBeNull();
    expect(fields()).toEqual(['fixed']);
  });

  it('honors disabled fieldsets, their first legend exception, inert and inherited ARIA state', () => {
    document.body.innerHTML =
      '<fieldset disabled><legend><input id="legend"></legend><input></fieldset><div inert><input></div><div aria-disabled="true"><input></div><div aria-readonly="true"><input></div><input readonly><input id="active">';
    expect(fields()).toEqual(['legend', 'active']);
  });

  it('excludes transparent ancestors, hidden shadow hosts and Job Buddy controls', () => {
    document.body.innerHTML =
      '<div style="opacity:0"><input></div><input style="opacity:0"><div data-job-buddy-ui><input></div>';
    shadow('hidden', '<input>').style.display = 'none';
    shadow('owned', '<input>').setAttribute('data-job-buddy-ui', '');
    expect(fields()).toEqual([]);
  });

  it('includes a transparent native choice with a visible label, but not hidden ancestors', () => {
    document.body.innerHTML =
      '<label><input type="checkbox" style="opacity:0">Remote</label><div style="opacity:0"><label><input type="checkbox">Hidden</label></div>';
    expect(scanForm().checkboxGroups.map((group) => group.options[0].label)).toEqual(['Remote']);
  });
});

describe('safe labels and scope', () => {
  it('reads all associated labels and uses aria-labelledby before aria-label', () => {
    document.body.innerHTML =
      '<label for="name">First</label><label for="name">name</label><span id="aria">Preferred name</span><input id="name" aria-label="Wrong" aria-labelledby="aria">';
    const signal = scanForm().signals(document.querySelector('input')!);
    expect(signal.label).toBe('First name');
    expect(signal.ariaLabel).toBe('Preferred name');
  });

  it('keeps wrapping and explicit labels in document order without borrowing mismatched labels', () => {
    document.body.innerHTML =
      '<label>First<input id="name"></label><label for="name">name</label><label for="other">Wrong<input id="unknown"></label>';
    const scan = scanForm();
    expect(scan.signals(document.querySelector('#name')!).label).toBe('First name');
    expect(scan.signals(document.querySelector('#unknown')!).label).toBe('');
  });

  it('resolves host ARIA references within the correct tree scope', () => {
    document.body.innerHTML = '<span id="title">First name</span>';
    const host = shadow('host', '<span id="title">Inner name</span><input>');
    host.setAttribute('aria-labelledby', 'title');
    expect(extractSignals(host.shadowRoot!.querySelector('input')!).ariaLabel).toBe('First name');
  });

  it('does not borrow a neighboring control label or Job Buddy status as context', () => {
    document.body.innerHTML =
      '<div class="form-group"><label for="last">Last name</label><input id="last"><input id="unknown" aria-describedby="jb"><span id="jb" data-jb-field-description>Job Buddy: Confirmed by you.</span></div>';
    expect(extractSignals(document.querySelector('#unknown')!).nearbyText).toBe('');
  });

  it('scopes an identified application away from newsletter and search forms', () => {
    document.body.innerHTML =
      '<form><h2>Job application</h2><input id="application" type="email"></form><form><h2>Newsletter</h2><input type="email"></form><nav><input type="email"></nav><input id="formless">';
    expect(scanForm({ scopeApplication: true }).fields.map((element) => element.id)).toEqual([
      'application',
      'formless',
    ]);
  });

  it('does not let a hidden application template suppress a visible generic form', () => {
    document.body.innerHTML =
      '<form hidden><h1>Job application</h1><input type="file" name="resume"></form><form><input id="active" name="firstName"></form>';
    expect(
      scanForm({ scopeApplication: true, allowFileInputs: true }).fields.map(
        (element) => element.id,
      ),
    ).toEqual(['active']);
  });

  it('keeps ordinary formless applications and generic forms supported', () => {
    document.body.innerHTML =
      '<input id="first"><form><input id="last"></form><form id="newsletter"><input type="email"></form>';
    expect(scanForm({ scopeApplication: true }).fields.map((element) => element.id)).toEqual([
      'first',
      'last',
    ]);
  });

  it('indexes labels with one document discovery and refreshes them for each scan', () => {
    document.body.innerHTML = '<label for="name">First name</label><input id="name">';
    const query = vi.spyOn(document, 'querySelectorAll');
    const first = scanForm();
    expect(query.mock.calls.filter(([selector]) => selector === '*')).toHaveLength(1);
    const input = first.fields[0];
    expect(first.signals(input).label).toBe('First name');
    document.querySelector('label')!.textContent = 'Last name';
    expect(scanForm().signals(input).label).toBe('Last name');
  });
});

describe('write-time stale control protection', () => {
  it('refuses a detached snapshot node without filling its replacement', async () => {
    document.body.innerHTML = '<input id="first">';
    const original = scanForm().fields[0];
    original.replaceWith(original.cloneNode());
    expect(await fillField(original, 'Jane')).toBe(false);
    expect(document.querySelector<HTMLInputElement>('input')!.value).toBe('');
  });

  it.each(['disabled', 'readonly', 'inert', 'aria-disabled'])(
    'refuses controls made %s after scanning',
    async (attribute) => {
      document.body.innerHTML = '<input>';
      const input = scanForm().fields[0];
      input.setAttribute(attribute, attribute.startsWith('aria-') ? 'true' : '');
      expect(await fillField(input, 'Jane')).toBe(false);
    },
  );

  it.each(['', 'plaintext-only'])(
    'fills a contenteditable="%s" editor and dispatches real input events',
    async (editable) => {
      document.body.innerHTML = `<div contenteditable="${editable}"></div>`;
      const editor = scanForm().fields[0];
      const input = vi.fn();
      editor.addEventListener('input', input);
      expect(await fillField(editor, 'Jane')).toBe(true);
      expect(editor.textContent).toBe('Jane');
      expect(input.mock.calls[0][0]).toBeInstanceOf(InputEvent);
    },
  );
});
