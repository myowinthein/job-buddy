// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fillField,
  fillCheckboxInput,
  fillRadioInput,
  fillFileField,
  resetDropdownBudget,
  findBestMatch,
} from './filler';
import { getWriteConfidence, resetWriteSession, undoWrites } from './writeSession';
import { clearHighlights, applyHighlight } from './highlighter';

beforeEach(() => {
  resetWriteSession();
  resetDropdownBudget();
  document.body.innerHTML = '';
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 100,
    height: 30,
  } as DOMRect);
});
afterEach(() => {
  resetWriteSession();
  clearHighlights();
  vi.restoreAllMocks();
});
function input(html: string) {
  document.body.innerHTML = html;
  return document.querySelector<HTMLInputElement>('input')!;
}

describe('verified field writes', () => {
  it.each(['I do not have a disability', 'Not authorized'])(
    'never fuzzy-matches a negated answer to its opposite: %s',
    async (value) => {
      document.body.innerHTML =
        '<select><option value="">Select</option><option>I do have a disability</option><option>Authorized</option></select>';
      const select = document.querySelector('select')!;
      expect(await fillField(select, value)).toBe(false);
      expect(select.value).toBe('');
    },
  );
  it('rejects ambiguous option labels/values and numeric or negative qualifiers', () => {
    const options = [
      { value: '0', label: '1' },
      { value: '1', label: '2' },
    ];
    expect(
      findBestMatch(
        options,
        '1',
        (x) => x.value,
        (x) => x.label,
      ),
    ).toBeNull();
    expect(
      findBestMatch(
        [{ value: '11 years', label: '11 years' }],
        '10 years',
        (x) => x.value,
        (x) => x.label,
      ),
    ).toBeNull();
  });
  it('marks a fuzzy option match for review', async () => {
    document.body.innerHTML =
      '<select><option>Select</option><option value="GB">United Kingdom</option></select>';
    const select = document.querySelector('select')!;
    expect(await fillField(select, 'United Kingdm')).toBe(true);
    expect(select.value).toBe('GB');
    expect(getWriteConfidence(select)).toBeLessThan(0.85);
  });
  it.each(['YYYY-MM-DD', 'YYYY/MM/DD', 'DD.MM.YYYY', 'MM/DD/YYYY'])(
    'honors the whole date format %s',
    async (format) => {
      const element = input(`<input placeholder="${format}">`);
      expect(await fillField(element, '1996-06-01')).toBe(true);
      const tokens: Record<string, string> = { YYYY: '1996', MM: '06', DD: '01' };
      expect(element.value).toBe(format.replace(/YYYY|MM|DD/g, (part) => tokens[part]));
    },
  );
  it('restores a valid original value after an invalid replacement', async () => {
    const element = input('<input pattern="[A-Z]{3}" value="BOB">');
    expect(await fillField(element, 'Alex')).toBe(false);
    expect(element.value).toBe('BOB');
    expect((await undoWrites()).success).toBe(true);
    expect(element.value).toBe('BOB');
  });
  it('waits through microtask reconciliation and rejects removed answers', async () => {
    const element = input('<input>');
    element.oninput = () =>
      queueMicrotask(() => {
        element.value = '';
      });
    expect(await fillField(element, 'Alex')).toBe(false);
    expect(element.value).toBe('');
  });
  it('accepts a valid punctuation-only phone mask', async () => {
    const element = input('<input type="tel">');
    element.oninput = () => {
      element.value = element.value.replace(/^(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3');
    };
    expect(await fillField(element, '2025550100')).toBe(true);
    expect(element.value).toBe('(202) 555-0100');
  });
  it('accepts regenerated DOM IDs when the same named and labelled question retains its value', async () => {
    const element = input(
      '<label for="generated-1">Address</label><input id="generated-1" name="streetAddress.value">',
    );
    const label = document.querySelector('label')!;
    let revision = 1;
    element.oninput = () => {
      element.id = `generated-${++revision}`;
      label.htmlFor = element.id;
    };
    expect(await fillField(element, '88 Sample Street')).toBe(true);
    expect(element.value).toBe('88 Sample Street');
    expect(element.id).not.toBe('generated-1');
    expect((await undoWrites()).success).toBe(true);
    expect(element.value).toBe('');
  });

  it.each(['name', 'label'])(
    'still rejects a regenerated ID when the question %s changes',
    async (changed) => {
      const element = input(
        '<label for="generated-1">Address</label><input id="generated-1" name="streetAddress.value">',
      );
      const label = document.querySelector('label')!;
      element.oninput = () => {
        element.id = 'generated-2';
        label.htmlFor = element.id;
        if (changed === 'name') element.name = 'emergencyContact.address';
        else label.textContent = 'Emergency contact address';
      };
      expect(await fillField(element, '88 Sample Street')).toBe(false);
    },
  );

  it('retains the ID check without both a name and an accessible label', async () => {
    const element = input('<input id="address" name="unknown">');
    element.oninput = () => {
      element.id = 'another-question';
    };
    expect(await fillField(element, '88 Sample Street')).toBe(false);
  });

  it('rechecks availability after focus', async () => {
    const element = input('<input value="Existing">');
    element.onfocus = () => {
      element.disabled = true;
    };
    expect(await fillField(element, 'Alex')).toBe(false);
    expect(element.value).toBe('Existing');
  });
  it('sends composed input events and actual focusout, including select input events', async () => {
    document.body.innerHTML =
      '<div id="host"></div><select><option value="">Select</option><option value="TH">Thailand</option></select>';
    const host = document.querySelector<HTMLElement>('#host')!,
      root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<input>';
    const seen: string[] = [];
    host.addEventListener('input', () => seen.push('shadow input'));
    host.addEventListener('focusout', () => seen.push('shadow blur'));
    await fillField(root.querySelector('input')!, 'Alex');
    const select = document.querySelector('select')!;
    select.addEventListener('input', () => seen.push('select input'));
    await fillField(select, 'TH');
    expect(seen).toEqual(['shadow input', 'shadow blur', 'select input']);
  });
  it('checks and unchecks through native activation and clears indeterminate state', async () => {
    const element = input('<input type="checkbox">');
    element.indeterminate = true;
    expect(await fillCheckboxInput(element)).toBe(true);
    expect(element.indeterminate).toBe(false);
    expect(await fillCheckboxInput(element, false)).toBe(true);
    expect(element.checked).toBe(false);
  });
  it('uses the ARIA state of an input-button checkbox', async () => {
    const element = input('<input type="button" role="checkbox" aria-checked="false">');
    element.onclick = () =>
      element.setAttribute('aria-checked', String(element.getAttribute('aria-checked') !== 'true'));
    expect(await fillCheckboxInput(element)).toBe(true);
    expect(element.getAttribute('aria-checked')).toBe('true');
  });
  it('checks all selected options and restores the complete previous selection', async () => {
    document.body.innerHTML =
      '<select multiple><option value="en">English</option><option value="my">Burmese</option><option value="fr" selected>French</option></select>';
    const select = document.querySelector('select')!;
    expect(await fillField(select, ['en', 'my'])).toBe(true);
    expect([...select.selectedOptions].map((o) => o.value)).toEqual(['en', 'my']);
    expect((await undoWrites()).success).toBe(true);
    expect(select.value).toBe('fr');
  });
  it('rejects incompatible file types before reconstruction', async () => {
    const element = input('<input type="file" accept=".docx">');
    expect(
      await fillFileField(element, {
        name: 'synthetic.pdf',
        size: 3,
        base64: 'data:application/pdf;base64,YWJj',
      }),
    ).toBe(false);
    expect(element.files?.length).toBe(0);
  });
});

it('activates dropdowns and options that use mousedown handlers', async () => {
  document.body.innerHTML =
    '<label id="label">Country</label><button type="button" id="trigger" role="combobox" aria-labelledby="label" aria-controls="list">Select</button><div id="list" role="listbox" hidden><div role="option">Thailand</div></div>';
  const trigger = document.querySelector<HTMLElement>('#trigger')!;
  const list = document.querySelector<HTMLElement>('#list')!;
  trigger.onmousedown = () => {
    list.hidden = false;
  };
  document.querySelector<HTMLElement>('[role="option"]')!.onmousedown = () => {
    trigger.dataset.selected = 'Thailand';
    trigger.textContent = 'Thailand';
    list.hidden = true;
  };
  expect(await fillField(trigger, 'Thailand')).toBe(true);
  expect(trigger.dataset.selected).toBe('Thailand');
});

describe('Undo ownership', () => {
  it('restores pre-existing answers but preserves subsequent edits', async () => {
    const element = input('<input value="Before">');
    await fillField(element, 'Alex');
    expect((await undoWrites()).success).toBe(true);
    expect(element.value).toBe('Before');
    await fillField(element, 'Alex');
    element.value = 'Manually revised';
    expect((await undoWrites()).success).toBe(true);
    expect(element.value).toBe('Manually revised');
  });
  it('does not touch a repurposed field', async () => {
    const element = input('<label id="label">First name<input></label>');
    await fillField(element, 'Alex');
    document.querySelector('#label')!.firstChild!.textContent = 'Emergency contact';
    element.value = 'Another person';
    expect((await undoWrites()).success).toBe(true);
    expect(element.value).toBe('Another person');
  });
  it('restores a previous radio choice without changing option values', async () => {
    document.body.innerHTML =
      '<input type="radio" name="choice" value="a" checked><input type="radio" name="choice" value="b">';
    const [a, b] = [...document.querySelectorAll('input')];
    expect(await fillRadioInput(b)).toBe(true);
    expect(b.checked).toBe(true);
    expect((await undoWrites()).success).toBe(true);
    expect(a.checked).toBe(true);
    expect(b.value).toBe('b');
  });
  it('restores delayed ARIA checkboxes with one activation per change', async () => {
    document.body.innerHTML = '<button role="checkbox" aria-checked="false">Current job</button>';
    const element = document.querySelector('button')!;
    let clicks = 0;
    element.onclick = () => {
      clicks++;
      setTimeout(
        () =>
          element.setAttribute(
            'aria-checked',
            String(element.getAttribute('aria-checked') !== 'true'),
          ),
        10,
      );
    };
    expect(await fillCheckboxInput(element)).toBe(true);
    expect((await undoWrites()).success).toBe(true);
    expect(element.getAttribute('aria-checked')).toBe('false');
    expect(clicks).toBe(2);
  });
  it('waits for a pending widget activation before restoring it', async () => {
    document.body.innerHTML = '<button role="checkbox" aria-checked="false">Current job</button>';
    const element = document.querySelector('button')!;
    element.onclick = () =>
      setTimeout(
        () =>
          element.setAttribute(
            'aria-checked',
            String(element.getAttribute('aria-checked') !== 'true'),
          ),
        10,
      );
    const writing = fillCheckboxInput(element);
    const undoing = undoWrites();
    await writing;
    expect((await undoing).success).toBe(true);
    expect(element.getAttribute('aria-checked')).toBe('false');
  });
  it('restores a previous ARIA radio without trying to toggle off the selected option', async () => {
    document.body.innerHTML =
      '<div role="radiogroup" aria-label="Choice"><button role="radio" aria-checked="true">A</button><button role="radio" aria-checked="false">B</button></div>';
    const [a, b] = [...document.querySelectorAll('button')];
    let clicks = 0;
    for (const option of [a, b])
      option.onclick = () => {
        clicks++;
        a.setAttribute('aria-checked', String(option === a));
        b.setAttribute('aria-checked', String(option === b));
      };
    expect(await fillRadioInput(b)).toBe(true);
    expect((await undoWrites()).success).toBe(true);
    expect(a.getAttribute('aria-checked')).toBe('true');
    expect(clicks).toBe(2);
  });
  it('never uses an unrelated remove action to reset a dropdown', async () => {
    document.body.innerHTML =
      '<div><label id="country-label">Country</label><button type="button" id="country" role="combobox" aria-labelledby="country-label" aria-controls="choices">Select</button><button aria-label="Remove resume" id="remove">Remove</button><div id="choices" role="listbox"><div role="option">Thailand</div></div></div>';
    const trigger = document.querySelector<HTMLElement>('#country')!;
    let removed = false;
    document.querySelector<HTMLElement>('#remove')!.onclick = () => {
      removed = true;
    };
    document.querySelector<HTMLElement>('[role="option"]')!.onclick = () => {
      trigger.textContent = 'Thailand';
      trigger.dataset.selected = 'Thailand';
    };
    expect(await fillField(trigger, 'Thailand')).toBe(true);
    expect((await undoWrites()).success).toBe(false);
    expect(removed).toBe(false);
  });
  it('clears unowned shadow-root feedback', () => {
    document.body.innerHTML = '<div id="host"></div>';
    const root = document.querySelector('#host')!.attachShadow({ mode: 'open' });
    root.innerHTML = '<input>';
    const element = root.querySelector('input')!;
    applyHighlight(element, 0);
    clearHighlights();
    expect(element.style.backgroundColor).toBe('');
  });
});
