// @vitest-environment jsdom
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { fillField, clearFieldValue, fillFileField } from './filler';

beforeEach(() => {
  document.body.innerHTML = '';
});

// ── helpers ───────────────────────────────────────────────────────────────────

function makeSelect(
  options: Array<{ text: string; value: string; disabled?: boolean }>,
): HTMLSelectElement {
  const sel = document.createElement('select');
  for (const { text, value, disabled } of options) {
    const opt = document.createElement('option');
    opt.text  = text;
    opt.value = value;
    if (disabled) opt.disabled = true;
    sel.add(opt);
  }
  document.body.appendChild(sel);
  return sel;
}

function selectedValue(sel: HTMLSelectElement): string {
  return sel.options[sel.selectedIndex]?.value ?? '';
}

function selectedText(sel: HTMLSelectElement): string {
  return sel.options[sel.selectedIndex]?.text ?? '';
}

function waitChange(el: HTMLElement): Promise<void> {
  return new Promise((resolve) => el.addEventListener('change', () => resolve(), { once: true }));
}

// ── fillField with <select> ───────────────────────────────────────────────────

describe('fillField — select: exact value match (pass 1)', () => {
  it('selects the option whose value attribute matches exactly', async () => {
    const sel = makeSelect([
      { text: 'Please select', value: '' },
      { text: 'Thailand',      value: 'TH' },
      { text: 'Germany',       value: 'DE' },
    ]);
    await fillField(sel, 'TH');
    expect(selectedValue(sel)).toBe('TH');
    expect(selectedText(sel)).toBe('Thailand');
  });

  it('prefers exact value match over a text that happens to equal the fill target', async () => {
    // option A has value "GB"; a different option B has text "GB"
    const sel = makeSelect([
      { text: 'Great Britain', value: 'GB' },
      { text: 'GB',            value: 'greatbritain' },
    ]);
    await fillField(sel, 'GB');
    // pass 1 fires on 'Great Britain' because its value === 'GB'
    expect(selectedValue(sel)).toBe('GB');
    expect(selectedText(sel)).toBe('Great Britain');
  });
});

describe('fillField — select: exact text match (pass 2)', () => {
  it('selects by option text when value does not match', async () => {
    const sel = makeSelect([
      { text: 'Thailand', value: 'TH' },
      { text: 'Germany',  value: 'DE' },
    ]);
    await fillField(sel, 'Thailand');
    expect(selectedValue(sel)).toBe('TH');
  });
});

describe('fillField — select: normalized value match (pass 3)', () => {
  it('matches when fill value case-differs from option value', async () => {
    const sel = makeSelect([
      { text: 'Full-time', value: 'FULL_TIME' },
      { text: 'Part-time', value: 'PART_TIME' },
    ]);
    await fillField(sel, 'full_time');
    expect(selectedValue(sel)).toBe('FULL_TIME');
  });
});

describe('fillField — select: normalized text match (pass 4)', () => {
  it('matches when fill value matches normalized option text', async () => {
    const sel = makeSelect([
      { text: 'Full-Time', value: 'full-time' },
      { text: 'Part-Time', value: 'part-time' },
    ]);
    // 'fulltime' normalizes to same as 'Full-Time' (non-alnum stripped)
    await fillField(sel, 'Full-Time');
    expect(selectedValue(sel)).toBe('full-time');
  });
});

describe('fillField — select: fuzzy match (pass 5)', () => {
  it('selects a close-enough option when score meets threshold', async () => {
    const sel = makeSelect([
      { text: 'United Kingdom', value: 'GB' },
      { text: 'United States',  value: 'US' },
    ]);
    await fillField(sel, 'United Kingdon'); // typo — close to "United Kingdom"
    expect(selectedValue(sel)).toBe('GB');
  });

  it('does not select if fuzzy score is too low', async () => {
    const sel = makeSelect([
      { text: 'Thailand', value: 'TH' },
      { text: 'Germany',  value: 'DE' },
    ]);
    // 'xyzabc123' has no reasonable match
    const before = sel.selectedIndex;
    await fillField(sel, 'xyzabc123');
    expect(sel.selectedIndex).toBe(before);
  });
});

describe('fillField — select: disabled option filtering', () => {
  it('skips disabled options even if they match exactly by value', async () => {
    const sel = makeSelect([
      { text: 'Thailand', value: 'TH', disabled: true },
      { text: 'Germany',  value: 'DE' },
    ]);
    await fillField(sel, 'TH');
    // Should NOT select the disabled Thailand option.
    // Falls through all passes with no non-disabled match on 'TH' — nothing selected.
    expect(selectedValue(sel)).not.toBe('TH');
  });

  it('selects a non-disabled option that matches when the disabled one would have won', async () => {
    const sel = makeSelect([
      { text: 'Thailand', value: 'TH', disabled: true },
      { text: 'Thailand (alt)', value: 'TH_ALT' },
    ]);
    // 'Thailand (alt)' normalises to 'thailandalt' ≠ 'thailand',
    // but fuzzy score should be high enough
    await fillField(sel, 'Thailand');
    expect(selectedValue(sel)).toBe('TH_ALT');
  });
});

describe('fillField — select: placeholder option filtering', () => {
  it('ignores options with empty value (common placeholder pattern)', async () => {
    const sel = makeSelect([
      { text: 'Please select', value: '' },
      { text: 'Thailand',      value: 'TH' },
    ]);
    // If we fill with "Please select" it should NOT match the placeholder
    await fillField(sel, 'Please select');
    // 'Please select' normalises to 'pleaseselect' which is in PLACEHOLDER_NORMS;
    // no other option matches — nothing changes
    const before = 0; // default selectedIndex
    expect(sel.selectedIndex).toBe(before);
  });

  it('ignores options whose text normalises to "select"', async () => {
    const sel = makeSelect([
      { text: 'Select',    value: 'placeholder' },
      { text: 'Thailand',  value: 'TH' },
    ]);
    await fillField(sel, 'Select');
    // 'Select' option is skipped; 'Thailand' does not match 'Select'
    // → nothing fills
    expect(selectedValue(sel)).toBe('placeholder'); // stays at default index
  });

  it('ignores options whose text normalises to "selectone"', async () => {
    const sel = makeSelect([
      { text: 'Select one', value: 'x' },
      { text: 'Germany',    value: 'DE' },
    ]);
    await fillField(sel, 'Germany');
    expect(selectedValue(sel)).toBe('DE');
  });

  it('ignores options whose text normalises to "choose"', async () => {
    const sel = makeSelect([
      { text: 'Choose',  value: 'x' },
      { text: 'Germany', value: 'DE' },
    ]);
    await fillField(sel, 'Germany');
    expect(selectedValue(sel)).toBe('DE');
  });

  it('treats "-- Select --" as a placeholder (normalises to "select")', async () => {
    const sel = makeSelect([
      { text: '-- Select --', value: 'x' },
      { text: 'Germany',      value: 'DE' },
    ]);
    await fillField(sel, 'Germany');
    expect(selectedValue(sel)).toBe('DE');
  });
});

describe('fillField — select: change event', () => {
  it('dispatches a change event after filling', async () => {
    const sel = makeSelect([
      { text: 'Thailand', value: 'TH' },
      { text: 'Germany',  value: 'DE' },
    ]);
    const changed = waitChange(sel);
    void fillField(sel, 'Germany');
    await expect(changed).resolves.toBeUndefined();
  });
});

// ── fillField: date reformatting ──────────────────────────────────────────────
// The resolver always produces YYYY-MM-DD for date paths. Masked-input widgets
// that display MM/DD/YYYY parse our value character-by-character and produce
// output like "02/dd/yyyy" (month clamped to 02, day/year remain as placeholders).
// fillField detects the placeholder format and reformats before writing.

describe('fillField — date reformatting for MM/DD/YYYY placeholder', () => {
  it('reformats YYYY-MM-DD to MM/DD/YYYY when placeholder is mm/dd/yyyy', async () => {
    const el = document.createElement('input');
    el.type = 'text';
    el.placeholder = 'mm/dd/yyyy';
    document.body.appendChild(el);
    await fillField(el, '2024-02-15');
    expect(el.value).toBe('02/15/2024');
  });

  it('fixes the 02/dd/yyyy malformed case — month-only fill no longer happens', async () => {
    // Previously fillField wrote "2024-02-15" raw; the masking library processed
    // "20" as the month digit pair → clamped to "02", leaving "dd" and "yyyy"
    // as unfilled mask placeholders. Now the value is pre-reformatted.
    const el = document.createElement('input');
    el.type = 'text';
    el.placeholder = 'mm/dd/yyyy';
    document.body.appendChild(el);
    await fillField(el, '2024-02-15');
    expect(el.value).not.toBe('2024-02-15'); // old raw value
    expect(el.value).toBe('02/15/2024');     // correctly reformatted
  });

  it('uses / separator when placeholder uses /', async () => {
    const el = document.createElement('input');
    el.type = 'text';
    el.placeholder = 'MM/DD/YYYY';
    document.body.appendChild(el);
    await fillField(el, '2024-12-03');
    expect(el.value).toBe('12/03/2024');
  });

  it('uses - separator when placeholder uses -', async () => {
    const el = document.createElement('input');
    el.type = 'text';
    el.placeholder = 'mm-dd-yyyy';
    document.body.appendChild(el);
    await fillField(el, '2024-02-15');
    expect(el.value).toBe('02-15-2024');
  });
});

describe('fillField — date reformatting for DD/MM/YYYY placeholder', () => {
  it('reformats YYYY-MM-DD to DD/MM/YYYY when placeholder is dd/mm/yyyy', async () => {
    const el = document.createElement('input');
    el.type = 'text';
    el.placeholder = 'dd/mm/yyyy';
    document.body.appendChild(el);
    await fillField(el, '2024-02-15');
    expect(el.value).toBe('15/02/2024');
  });

  it('uses - separator when placeholder uses -', async () => {
    const el = document.createElement('input');
    el.type = 'text';
    el.placeholder = 'dd-mm-yyyy';
    document.body.appendChild(el);
    await fillField(el, '2024-02-15');
    expect(el.value).toBe('15-02-2024');
  });
});

describe('fillField — date reformatting: no conversion cases', () => {
  it('does not reformat for a native date input (type="date")', async () => {
    const el = document.createElement('input');
    el.type = 'date';
    document.body.appendChild(el);
    await fillField(el, '2024-02-15');
    expect(el.value).toBe('2024-02-15');
  });

  it('does not reformat when placeholder has no date format hint', async () => {
    const el = document.createElement('input');
    el.type = 'text';
    el.placeholder = 'Enter a date';
    document.body.appendChild(el);
    await fillField(el, '2024-02-15');
    expect(el.value).toBe('2024-02-15');
  });

  it('does not reformat non-date string values', async () => {
    const el = document.createElement('input');
    el.type = 'text';
    el.placeholder = 'mm/dd/yyyy';
    document.body.appendChild(el);
    await fillField(el, 'Jane Doe');
    expect(el.value).toBe('Jane Doe');
  });

  it('does not reformat when placeholder has no hint (no placeholder at all)', async () => {
    const el = document.createElement('input');
    el.type = 'text';
    document.body.appendChild(el);
    await fillField(el, '2024-06-15');
    expect(el.value).toBe('2024-06-15');
  });
});

// ── fillField with text input — regression guard ──────────────────────────────

describe('fillField — text input (regression)', () => {
  it('sets the value of a text input', async () => {
    const el = document.createElement('input');
    el.type = 'text';
    document.body.appendChild(el);
    await fillField(el, 'Jane Doe');
    expect(el.value).toBe('Jane Doe');
  });

  it('does nothing for an empty fill value', async () => {
    const el = document.createElement('input');
    el.type = 'text';
    el.value = 'original';
    document.body.appendChild(el);
    await fillField(el, '');
    expect(el.value).toBe('original');
  });
});

// ── fillFileField ─────────────────────────────────────────────────────────────
// jsdom implements neither DataTransfer nor a settable HTMLInputElement.files
// with a plain object, so we stub both: a minimal DataTransfer that produces a
// FileList-like object, and a per-element `files` accessor that accepts it.

class FakeDataTransfer {
  private _files: File[] = [];
  items = { add: (f: File) => { this._files.push(f); } };
  get files(): FileList {
    const arr = this._files.slice();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fl: any = { length: arr.length, item: (i: number) => arr[i] ?? null };
    arr.forEach((f, i) => { fl[i] = f; });
    return fl as FileList;
  }
}

function makeFileInput(): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'file';
  let stored: FileList | null = null;
  Object.defineProperty(input, 'files', {
    configurable: true,
    get() { return stored; },
    set(v: FileList | null) { stored = v; },
  });
  document.body.appendChild(input);
  return input;
}

describe('fillFileField', () => {
  beforeEach(() => {
    vi.stubGlobal('DataTransfer', FakeDataTransfer);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reconstructs the File and dispatches input AND change events', async () => {
    const input = makeFileInput();
    let inputFired = false;
    let changeFired = false;
    input.addEventListener('input',  () => { inputFired = true; });
    input.addEventListener('change', () => { changeFired = true; });

    // "data:text/plain;base64," + base64("hello") = "aGVsbG8="
    const ok = await fillFileField(input, {
      name: 'resume.txt',
      size: 5,
      base64: 'data:text/plain;base64,aGVsbG8=',
    });

    expect(ok).toBe(true);
    expect(input.files?.length).toBe(1);
    expect(input.files?.[0].name).toBe('resume.txt');
    expect(input.files?.[0].type).toBe('text/plain');
    expect(inputFired).toBe(true);
    expect(changeFired).toBe(true);
  });

  it('returns false and does not dispatch when the data-URL prefix is malformed', async () => {
    const input = makeFileInput();
    let fired = false;
    input.addEventListener('input', () => { fired = true; });

    // Has a comma, but the prefix is not "data:<mime>;base64".
    const ok = await fillFileField(input, {
      name: 'resume.txt',
      size: 5,
      base64: 'notadataurl:text/plain,aGVsbG8=',
    });

    expect(ok).toBe(false);
    expect(input.files).toBeNull();
    expect(fired).toBe(false);
  });

  it('returns false when the base64 string has no comma separator', async () => {
    const input = makeFileInput();
    const ok = await fillFileField(input, {
      name: 'resume.txt',
      size: 5,
      base64: 'data:text/plain;base64;aGVsbG8=', // no comma at all
    });
    expect(ok).toBe(false);
    expect(input.files).toBeNull();
  });

  it('returns false when the payload after the comma is empty', async () => {
    const input = makeFileInput();
    const ok = await fillFileField(input, {
      name: 'resume.txt',
      size: 0,
      base64: 'data:text/plain;base64,',
    });
    expect(ok).toBe(false);
  });
});

// ── clearFieldValue — select ──────────────────────────────────────────────────

describe('clearFieldValue — select', () => {
  it('resets selectedIndex to 0', () => {
    const sel = makeSelect([
      { text: 'A', value: 'a' },
      { text: 'B', value: 'b' },
    ]);
    sel.selectedIndex = 1;
    clearFieldValue(sel);
    expect(sel.selectedIndex).toBe(0);
  });
});

// ── ARIA custom text fields ───────────────────────────────────────────────────

describe('fillField — role="textbox"', () => {
  it('sets textContent of a div[role="textbox"]', async () => {
    const el = document.createElement('div');
    el.setAttribute('role', 'textbox');
    document.body.appendChild(el);
    await fillField(el, 'Jane Doe');
    expect(el.textContent).toBe('Jane Doe');
  });

  it('dispatches an input event', async () => {
    const el = document.createElement('div');
    el.setAttribute('role', 'textbox');
    document.body.appendChild(el);
    let fired = false;
    el.addEventListener('input', () => { fired = true; });
    await fillField(el, 'hello');
    expect(fired).toBe(true);
  });

  it('does nothing when value is empty', async () => {
    const el = document.createElement('div');
    el.setAttribute('role', 'textbox');
    el.textContent = 'existing';
    document.body.appendChild(el);
    await fillField(el, '');
    expect(el.textContent).toBe('existing');
  });
});

describe('fillField — contenteditable="true"', () => {
  it('sets textContent of a contenteditable div', async () => {
    const el = document.createElement('div');
    el.setAttribute('contenteditable', 'true');
    document.body.appendChild(el);
    await fillField(el, 'Bangkok');
    expect(el.textContent).toBe('Bangkok');
  });

  it('dispatches a change event', async () => {
    const el = document.createElement('div');
    el.setAttribute('contenteditable', 'true');
    document.body.appendChild(el);
    let fired = false;
    el.addEventListener('change', () => { fired = true; });
    await fillField(el, 'Bangkok');
    expect(fired).toBe(true);
  });
});

describe('clearFieldValue — ARIA textbox', () => {
  it('clears textContent of a div[role="textbox"]', async () => {
    const el = document.createElement('div');
    el.setAttribute('role', 'textbox');
    el.textContent = 'original';
    document.body.appendChild(el);
    clearFieldValue(el);
    expect(el.textContent).toBe('');
  });

  it('is a no-op for ARIA combobox (cannot reverse dropdown selection)', () => {
    const el = document.createElement('div');
    el.setAttribute('role', 'combobox');
    el.textContent = 'Thailand';
    document.body.appendChild(el);
    clearFieldValue(el); // must not throw
    // textContent is NOT cleared for combobox
    expect(el.textContent).toBe('Thailand');
  });
});

// ── ARIA listbox / combobox filling ──────────────────────────────────────────

describe('fillField — aria-haspopup="listbox" (custom dropdown)', () => {
  it('clicks the trigger and selects a matching option by text', async () => {
    const trigger = document.createElement('button');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-controls', 'my-list');
    document.body.appendChild(trigger);

    // Populate options synchronously on click — simulates a sync dropdown open.
    let optionClicked = '';
    trigger.addEventListener('click', () => {
      const lb = document.createElement('ul');
      lb.id = 'my-list';
      lb.setAttribute('role', 'listbox');
      ['Thailand', 'Germany', 'Singapore'].forEach((name) => {
        const opt = document.createElement('li');
        opt.setAttribute('role', 'option');
        opt.textContent = name;
        opt.addEventListener('click', () => { optionClicked = name; });
        lb.appendChild(opt);
      });
      document.body.appendChild(lb);
    });

    await fillField(trigger, 'Thailand');
    expect(optionClicked).toBe('Thailand');
  });

  it('selects by fuzzy match when no exact match exists', async () => {
    const trigger = document.createElement('button');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-controls', 'fl-list');
    document.body.appendChild(trigger);

    let optionClicked = '';
    trigger.addEventListener('click', () => {
      const lb = document.createElement('ul');
      lb.id = 'fl-list';
      lb.setAttribute('role', 'listbox');
      const opt = document.createElement('li');
      opt.setAttribute('role', 'option');
      opt.textContent = 'United Kingdom';
      opt.addEventListener('click', () => { optionClicked = 'United Kingdom'; });
      lb.appendChild(opt);
      document.body.appendChild(lb);
    });

    await fillField(trigger, 'United Kingdon'); // deliberate typo
    expect(optionClicked).toBe('United Kingdom');
  });

  it('does not select a disabled option', async () => {
    const trigger = document.createElement('button');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-controls', 'dis-list');
    document.body.appendChild(trigger);

    let optionClicked = '';
    trigger.addEventListener('click', () => {
      const lb = document.createElement('ul');
      lb.id = 'dis-list';
      lb.setAttribute('role', 'listbox');
      const opt = document.createElement('li');
      opt.setAttribute('role', 'option');
      opt.setAttribute('aria-disabled', 'true');
      opt.textContent = 'Thailand';
      opt.addEventListener('click', () => { optionClicked = 'Thailand'; });
      lb.appendChild(opt);
      document.body.appendChild(lb);
    });

    await fillField(trigger, 'Thailand');
    expect(optionClicked).toBe(''); // disabled option must not be clicked
  });

  it('does not select a placeholder option', async () => {
    const trigger = document.createElement('button');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-controls', 'ph-list');
    document.body.appendChild(trigger);

    let optionClicked = '';
    trigger.addEventListener('click', () => {
      const lb = document.createElement('ul');
      lb.id = 'ph-list';
      lb.setAttribute('role', 'listbox');
      // Placeholder option whose text normalises to "pleaseselect"
      const placeholder = document.createElement('li');
      placeholder.setAttribute('role', 'option');
      placeholder.textContent = 'Please select';
      placeholder.addEventListener('click', () => { optionClicked = 'placeholder'; });
      lb.appendChild(placeholder);
      document.body.appendChild(lb);
    });

    await fillField(trigger, 'Please select');
    expect(optionClicked).toBe(''); // placeholder must not be clicked
  });

  it('resolves via global portal listbox when no aria-controls is set', async () => {
    const trigger = document.createElement('button');
    trigger.setAttribute('aria-haspopup', 'listbox');
    document.body.appendChild(trigger);

    let optionClicked = '';
    trigger.addEventListener('click', () => {
      const lb = document.createElement('ul');
      lb.setAttribute('role', 'listbox');
      const opt = document.createElement('li');
      opt.setAttribute('role', 'option');
      opt.textContent = 'Singapore';
      opt.addEventListener('click', () => { optionClicked = 'Singapore'; });
      lb.appendChild(opt);
      document.body.appendChild(lb); // appended as a portal to body
    });

    await fillField(trigger, 'Singapore');
    expect(optionClicked).toBe('Singapore');
  });

  it('does not throw when the dropdown does not open', async () => {
    const trigger = document.createElement('button');
    trigger.setAttribute('aria-haspopup', 'listbox');
    // No aria-controls, no click handler that adds a listbox
    document.body.appendChild(trigger);
    // Must not throw; should resolve silently
    await expect(fillField(trigger, 'Thailand')).resolves.toBeUndefined();
  });

  it('does not select anything when no option matches', async () => {
    const trigger = document.createElement('button');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-controls', 'nm-list');
    document.body.appendChild(trigger);

    let optionClicked = '';
    trigger.addEventListener('click', () => {
      const lb = document.createElement('ul');
      lb.id = 'nm-list';
      lb.setAttribute('role', 'listbox');
      const opt = document.createElement('li');
      opt.setAttribute('role', 'option');
      opt.textContent = 'Germany';
      opt.addEventListener('click', () => { optionClicked = 'Germany'; });
      lb.appendChild(opt);
      document.body.appendChild(lb);
    });

    await fillField(trigger, 'zzz_no_match_possible_here');
    expect(optionClicked).toBe(''); // score below threshold
  });
});
