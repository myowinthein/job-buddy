// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fillField, resetDropdownBudget } from './filler';
import { resetWriteSession } from './writeSession';

beforeEach(() => {
  resetWriteSession();
  resetDropdownBudget();
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 200,
    height: 40,
  } as DOMRect);
});
afterEach(() => {
  document.body.innerHTML = '';
  resetWriteSession();
  vi.restoreAllMocks();
});

it.each(['keydown', 'keyup'] as const)(
  'closes a dropdown handled on %s without an unnecessary second dismissal',
  async (closeOn) => {
    document.body.innerHTML =
      '<section><button type="button" role="combobox" aria-label="Country" aria-expanded="false" aria-controls="countries"></button><div id="countries" role="listbox" hidden><div role="option">United States</div></div></section>';
    const trigger = document.querySelector('button')!;
    const list = document.querySelector<HTMLElement>('#countries')!;
    trigger.addEventListener('click', () => {
      list.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
    });
    list.firstElementChild!.addEventListener('click', () => {
      trigger.textContent = 'United States';
      trigger.dataset.selected = 'US';
    });
    const keys: string[] = [];
    for (const type of ['keydown', 'keyup'])
      trigger.addEventListener(type, (event) => {
        if ((event as KeyboardEvent).key !== 'Escape') return;
        event.stopPropagation();
        keys.push(type);
        if (type === closeOn) {
          queueMicrotask(() => {
            trigger.setAttribute('aria-expanded', 'false');
            list.hidden = true;
          });
        }
      });
    let dismissed = false;
    document.querySelector('section')!.addEventListener('keyup', (event) => {
      if ((event as KeyboardEvent).key === 'Escape') dismissed = true;
    });
    document.querySelector('section')!.addEventListener('keydown', (event) => {
      if ((event as KeyboardEvent).key === 'Escape') dismissed = true;
    });
    expect(await fillField(trigger, 'United States')).toBe(true);
    expect(trigger.dataset.selected).toBe('US');
    expect(list.hidden).toBe(true);
    expect(dismissed).toBe(false);
    expect(keys).toEqual(closeOn === 'keydown' ? ['keydown'] : ['keydown', 'keyup']);
  },
);

it.each(['input', 'button'] as const)(
  'closes a modal %s without sending Escape to its capture-phase focus trap',
  async (tag) => {
    document.body.innerHTML = `<section role="dialog"><${tag} type="${tag === 'input' ? 'text' : 'button'}" role="combobox" aria-label="Country" aria-expanded="false" aria-controls="countries">${tag === 'button' ? '</button>' : ''}<div id="countries" role="listbox" hidden><div role="option">United States</div></div></section>`;
    const trigger = document.querySelector<HTMLElement>(tag)!;
    const list = document.querySelector<HTMLElement>('#countries')!;
    trigger.addEventListener('click', () => {
      list.hidden = !list.hidden;
      trigger.setAttribute('aria-expanded', String(!list.hidden));
    });
    trigger.addEventListener('blur', () => {
      list.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    });
    list.firstElementChild!.addEventListener('click', () => {
      if (trigger instanceof HTMLInputElement) trigger.value = 'United States';
      else trigger.textContent = 'United States';
      trigger.dataset.selected = 'US';
    });
    const escape = vi.fn();
    const capture = (event: Event) => {
      if ((event as KeyboardEvent).key === 'Escape') escape();
    };
    document.addEventListener('keydown', capture, true);
    document.addEventListener('keyup', capture, true);
    try {
      expect(await fillField(trigger, 'United States')).toBe(true);
      expect(trigger.dataset.selected).toBe('US');
      expect(list.hidden).toBe(true);
      expect(escape).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('keydown', capture, true);
      document.removeEventListener('keyup', capture, true);
    }
  },
);
