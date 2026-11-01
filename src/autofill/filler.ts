import { isControlAvailable, isChoice, isChoiceChecked, isTextEditor } from './dom';
import { extractSignals } from './signals';
import { readFieldValue } from './fieldValue';
import { captureField, sameFieldState } from './fieldState';
import type { FieldState } from './fieldState';
import { ownWriteEvents, performWrite, setWriteConfidence } from './writeSession';
import type { DocumentFile } from '../types/profile';
import { normalize, similarity, isSkippableOption, PLACEHOLDER_OPTION_NORMS } from './normalizer';
import { CONF_FUZZY_THRESHOLD, CONF_AI_YELLOW } from './constants';

export { getWriteConfidence, resetWriteSession, undoWrites } from './writeSession';
const nativeInputSetter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype,
  'value',
)?.set;
const nativeTextareaSetter = Object.getOwnPropertyDescriptor(
  window.HTMLTextAreaElement.prototype,
  'value',
)?.set;
const nativeCheckedSetter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype,
  'checked',
)?.set;
export const DROPDOWN_WAIT_MS = 1_500;
export const UNBOUND_DROPDOWN_WAIT_MS = 300;
export const DROPDOWN_RUN_BUDGET_MS = 3_000;
let dropdownBudget = DROPDOWN_RUN_BUDGET_MS;
export function resetDropdownBudget(): void {
  dropdownBudget = DROPDOWN_RUN_BUDGET_MS;
}

const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
function focus(element: HTMLElement): void {
  try {
    ownWriteEvents(() => element.focus({ preventScroll: true }));
  } catch {
    /* Some custom controls cannot focus. */
  }
}
function notify(element: HTMLElement, value?: string): void {
  ownWriteEvents(() => {
    element.dispatchEvent(
      value === undefined
        ? new Event('input', { bubbles: true, composed: true })
        : new InputEvent('input', {
            bubbles: true,
            composed: true,
            inputType: value ? 'insertText' : 'deleteContentBackward',
            data: value || null,
          }),
    );
    element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  });
}
function blur(element: HTMLElement): void {
  ownWriteEvents(() => {
    const root = element.getRootNode() as Document | ShadowRoot;
    if (root.activeElement === element) element.blur();
    else {
      element.dispatchEvent(new FocusEvent('blur', { composed: true }));
      element.dispatchEvent(new FocusEvent('focusout', { bubbles: true, composed: true }));
    }
  });
}
function setText(element: HTMLElement, value: string): void {
  ownWriteEvents(() => {
    if (element instanceof HTMLInputElement) {
      if (nativeInputSetter) nativeInputSetter.call(element, value);
      else element.value = value;
    } else if (element instanceof HTMLTextAreaElement) {
      if (nativeTextareaSetter) nativeTextareaSetter.call(element, value);
      else element.value = value;
    } else element.textContent = value;
    notify(element, value);
  });
}
function safeClick(element: HTMLElement, pointer = false): void {
  // Cancel native navigation/submission while allowing the widget's handlers.
  const blockDefault = (event: Event) => {
    if (
      (element instanceof HTMLButtonElement && element.type === 'submit') ||
      (element instanceof HTMLInputElement && ['submit', 'image'].includes(element.type)) ||
      element instanceof HTMLAnchorElement
    )
      event.preventDefault();
  };
  const form = (element as HTMLButtonElement).form ?? element.closest('form');
  const blockSubmit = (event: Event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  element.addEventListener('click', blockDefault, true);
  form?.addEventListener('submit', blockSubmit, true);
  try {
    ownWriteEvents(() => {
      if (pointer) {
        const mouseDown =
          typeof PointerEvent === 'undefined' ||
          element.dispatchEvent(
            new PointerEvent('pointerdown', {
              bubbles: true,
              composed: true,
              cancelable: true,
              pointerType: 'mouse',
              pointerId: 1,
              isPrimary: true,
              button: 0,
              buttons: 1,
            }),
          );
        if (mouseDown && element.isConnected)
          element.dispatchEvent(
            new MouseEvent('mousedown', {
              bubbles: true,
              composed: true,
              cancelable: true,
              button: 0,
              buttons: 1,
            }),
          );
        if (!element.isConnected) return;
        if (typeof PointerEvent !== 'undefined')
          element.dispatchEvent(
            new PointerEvent('pointerup', {
              bubbles: true,
              composed: true,
              pointerType: 'mouse',
              pointerId: 1,
              isPrimary: true,
              button: 0,
            }),
          );
        element.dispatchEvent(
          new MouseEvent('mouseup', { bubbles: true, composed: true, cancelable: true, button: 0 }),
        );
      }
      if (element.isConnected) element.click();
    });
  } finally {
    element.removeEventListener('click', blockDefault, true);
    form?.removeEventListener('submit', blockSubmit, true);
  }
}
function dateValue(value: string, element: HTMLInputElement): string {
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!date || element.type === 'date') return value;
  const format = /\b(yyyy|mm|dd)([/.-])(yyyy|mm|dd)\2(yyyy|mm|dd)\b/i.exec(element.placeholder);
  if (
    !format ||
    new Set([format[1], format[3], format[4]].map((part) => part.toLowerCase())).size !== 3
  )
    return value;
  const parts: Record<string, string> = { yyyy: date[1], mm: date[2], dd: date[3] };
  return [format[1], format[3], format[4]].map((part) => parts[part.toLowerCase()]).join(format[2]);
}
function negative(text: string): boolean {
  return /\b(no|not|never|without|none|decline|neither|cannot|unable|ineligible|unauthorized|unavailable|unwilling|unemployed)\b|n['’]t\b|\bnon[- ]/i.test(
    text,
  );
}
function compatible(a: string, b: string): boolean {
  return (
    negative(a) === negative(b) && (a.match(/\d+/g) ?? []).join() === (b.match(/\d+/g) ?? []).join()
  );
}
export function findBestMatch<T>(
  items: T[],
  target: string,
  primary: (item: T) => string,
  secondary: (item: T) => string,
): T | null {
  if (!target || !normalize(target)) return null;
  for (const norm of [false, true]) {
    const equal = (text: string) =>
      norm ? normalize(text) === normalize(target) : text === target;
    const matches = items.filter((item) => equal(primary(item)) || equal(secondary(item)));
    if (matches.length) return matches.length === 1 ? matches[0] : null;
  }
  const scores = items
    .map((item) => ({
      item,
      score: Math.max(
        ...[primary(item), secondary(item)]
          .filter((text) => text && compatible(target, text))
          .map((text) => similarity(normalize(text), normalize(target))),
        0,
      ),
    }))
    .sort((a, b) => b.score - a.score);
  return scores[0]?.score >= CONF_FUZZY_THRESHOLD && scores[0].score > (scores[1]?.score ?? 0)
    ? scores[0].item
    : null;
}
function optionConfidence(element: HTMLElement, target: string, ...answers: string[]): void {
  setWriteConfidence(
    element,
    answers.some((answer) => normalize(answer) === normalize(target)) ? 1 : CONF_AI_YELLOW,
  );
}
function equivalent(element: HTMLElement, expected: string): boolean {
  const actual = readFieldValue(element);
  if (actual === expected) return true;
  // Accept punctuation-only telephone masks, never missing digits or changed answers.
  return (
    element instanceof HTMLInputElement &&
    element.type === 'tel' &&
    /^\+?[\d\s().-]+$/.test(actual) &&
    /^\+?[\d\s().-]+$/.test(expected) &&
    actual.replace(/\D/g, '') === expected.replace(/\D/g, '')
  );
}
function valid(element: HTMLElement): boolean {
  if (!isControlAvailable(element)) return false;
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)
    return (
      element.validity.valid && (element.maxLength < 0 || element.value.length <= element.maxLength)
    );
  return !(element instanceof HTMLSelectElement) || element.validity.valid;
}

function boxes(root: Document | ShadowRoot): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('[role="listbox"]')].filter(isControlAvailable);
}
function scopedOptions(trigger: HTMLElement, before: Set<HTMLElement>): HTMLElement[] {
  const root = trigger.getRootNode() as Document | ShadowRoot;
  const ids =
    `${trigger.getAttribute('aria-controls') ?? ''} ${trigger.getAttribute('aria-owns') ?? ''}`
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  if (ids.length)
    return ids.flatMap((id) => [
      ...(root.getElementById(id)?.querySelectorAll<HTMLElement>('[role="option"]') ?? []),
    ]);
  const parent =
    trigger.getAttribute('role') === 'combobox' && trigger.querySelector('[role="listbox"]')
      ? trigger
      : trigger.parentElement;
  if (
    parent &&
    !parent.matches('body,form') &&
    parent.querySelectorAll('[role="combobox"],[aria-haspopup="listbox"]').length <= 1
  ) {
    const local = parent.querySelectorAll<HTMLElement>('[role="listbox"]');
    if (local.length === 1) return [...local[0].querySelectorAll<HTMLElement>('[role="option"]')];
  }
  const candidates = [...new Set([...boxes(root), ...boxes(document)])].filter(
    (box) =>
      !before.has(box) ||
      (!!trigger.id && box.getAttribute('aria-labelledby')?.split(/\s+/).includes(trigger.id)),
  );
  return candidates.length === 1
    ? [...candidates[0].querySelectorAll<HTMLElement>('[role="option"]')]
    : [];
}
function ariaOption(
  options: HTMLElement[],
  value: string,
  placeholder = false,
): HTMLElement | null {
  const eligible = options.filter(
    (option) =>
      isControlAvailable(option) &&
      (placeholder ||
        !PLACEHOLDER_OPTION_NORMS.has(
          normalize(option.getAttribute('aria-label') || option.textContent || ''),
        )),
  );
  return findBestMatch(
    eligible,
    value,
    (option) => option.textContent?.trim() ?? '',
    (option) => option.getAttribute('aria-label')?.trim() ?? '',
  );
}
async function waitOption(
  trigger: HTMLElement,
  before: Set<HTMLElement>,
  value: string,
  active: () => boolean,
  placeholder: boolean,
): Promise<HTMLElement | null> {
  const linked =
    trigger.hasAttribute('aria-controls') ||
    trigger.hasAttribute('aria-owns') ||
    trigger.getAttribute('aria-expanded') === 'true';
  const limit = Math.min(dropdownBudget, linked ? DROPDOWN_WAIT_MS : UNBOUND_DROPDOWN_WAIT_MS);
  const start = Date.now();
  const root = trigger.getRootNode();
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let finished = false;
    const observer = new MutationObserver(check);
    function finish(option: HTMLElement | null) {
      if (finished) return;
      finished = true;
      observer.disconnect();
      clearTimeout(timer);
      dropdownBudget = Math.max(0, dropdownBudget - (Date.now() - start));
      resolve(option);
    }
    function check() {
      clearTimeout(timer);
      if (!active() || !isControlAvailable(trigger)) return finish(null);
      const options = scopedOptions(trigger, before);
      const option = ariaOption(options, value, placeholder);
      if (option) return finish(option);
      if (
        Date.now() - start >= limit ||
        (options.length &&
          !(trigger instanceof HTMLInputElement) &&
          trigger.getAttribute('aria-busy') !== 'true')
      )
        return finish(null);
      timer = setTimeout(check, Math.min(50, Math.max(0, limit - (Date.now() - start))));
    }
    observer.observe(document, { childList: true, subtree: true, attributes: true });
    if (root instanceof ShadowRoot)
      observer.observe(root, { childList: true, subtree: true, attributes: true });
    check();
  });
}
async function closeDropdown(
  element: HTMLElement,
  active: () => boolean = () => true,
): Promise<void> {
  ownWriteEvents(() => {
    element.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }),
    );
    element.dispatchEvent(
      new KeyboardEvent('keyup', { key: 'Escape', bubbles: true, composed: true }),
    );
  });
  await settle();
  if (active() && element.getAttribute('aria-expanded') === 'true') safeClick(element, true);
  await settle();
}
async function rawDropdown(
  element: HTMLElement,
  value: string,
  active: () => boolean,
  placeholder = false,
): Promise<boolean> {
  const root = element.getRootNode() as Document | ShadowRoot;
  const before = new Set([...boxes(root), ...boxes(document)]);
  const wasOpen = element.getAttribute('aria-expanded') === 'true';
  try {
    if (!active() || !isControlAvailable(element)) return false;
    focus(element);
    if (!active() || !isControlAvailable(element)) return false;
    if (!wasOpen) safeClick(element, true);
    if (
      element instanceof HTMLInputElement &&
      !element.readOnly &&
      !['button', 'submit', 'hidden'].includes(element.type)
    )
      setText(element, value);
    await settle();
    const option = await waitOption(element, before, value, active, placeholder);
    if (!option || !active() || !isControlAvailable(option)) return false;
    const label = option.getAttribute('aria-label') || option.textContent?.trim() || '';
    const priorValue = readFieldValue(element);
    const priorExplicit = [
      element.getAttribute('aria-valuetext'),
      element.dataset.selected,
      element.dataset.value,
    ];
    safeClick(option, true);
    await settle();
    const retained = readFieldValue(element);
    const selected = option.isConnected && option.getAttribute('aria-selected') === 'true';
    const knownValue =
      !!retained &&
      [value, label, option.getAttribute('data-value')].some(
        (answer) => answer && normalize(retained) === normalize(answer),
      );
    const changedExplicit = [
      element.getAttribute('aria-valuetext'),
      element.dataset.selected,
      element.dataset.value,
    ].some((answer, i) => answer && answer !== priorExplicit[i]);
    const accepted =
      selected ||
      changedExplicit ||
      (knownValue &&
        (retained !== priorValue ||
          element.getAttribute('aria-expanded') === 'false' ||
          !(element instanceof HTMLInputElement) ||
          !option.isConnected));
    if (accepted) {
      optionConfidence(element, value, label, option.textContent ?? '');
      if (!selected && !knownValue) setWriteConfidence(element, CONF_AI_YELLOW);
    }
    return accepted && isControlAvailable(element);
  } finally {
    if (active() && !wasOpen) await closeDropdown(element, active);
    if (active()) blur(element);
  }
}
async function rawChoice(element: HTMLElement, checked: boolean): Promise<boolean> {
  if (element instanceof HTMLInputElement && element.indeterminate)
    ownWriteEvents(() => {
      element.indeterminate = false;
    });
  if (
    isChoiceChecked(element) === checked &&
    !(element instanceof HTMLInputElement && element.indeterminate)
  )
    return true;
  if (element instanceof HTMLInputElement && element.type === 'radio' && !checked) {
    ownWriteEvents(() => {
      nativeCheckedSetter?.call(element, false);
      element.dispatchEvent(new Event('click', { bubbles: true, composed: true }));
      notify(element);
    });
  } else safeClick(element);
  await settle();
  if (isChoiceChecked(element) !== checked) {
    await new Promise<void>((resolve) => {
      const start = Date.now();
      const check = () =>
        isChoiceChecked(element) === checked || Date.now() - start >= 150
          ? resolve()
          : setTimeout(check, 15);
      check();
    });
  }
  return (
    element.isConnected &&
    isChoiceChecked(element) === checked &&
    !(element instanceof HTMLInputElement && element.indeterminate)
  );
}
function clearControl(element: HTMLElement): HTMLElement | null {
  for (
    let parent = element.parentElement;
    parent && !parent.matches('form,body');
    parent = parent.parentElement
  ) {
    if (parent.querySelectorAll('[role="combobox"],[aria-haspopup="listbox"]').length > 1)
      return null;
    const controls = [
      ...parent.querySelectorAll<HTMLElement>(
        'input,select,textarea,[role="combobox"],[role="textbox"]',
      ),
    ].filter(
      (control) =>
        control !== element &&
        !element.contains(control) &&
        ((control instanceof HTMLInputElement && control.type === 'file') ||
          (isControlAvailable(control) &&
            !(control instanceof HTMLInputElement && control.type === 'hidden'))),
    );
    if (controls.length) return null;
    const buttons = parent.querySelectorAll<HTMLElement>(
      'button[aria-label*="Clear" i],[role="button"][aria-label*="Clear" i]',
    );
    if (buttons.length === 1) {
      const name = buttons[0].getAttribute('aria-label') ?? '';
      const signals = extractSignals(element);
      const question = [signals.label, signals.ariaLabel, signals.placeholder].join(' ');
      const detail = name.replace(/^clear\s*(?:selected\s+)?/i, '').trim();
      if (
        !detail ||
        /^(selection|selected value|value|input|item)$/i.test(detail) ||
        normalize(question).includes(normalize(detail))
      )
        return buttons[0];
      return null;
    }
    if (buttons.length > 1) return null;
  }
  return null;
}
async function restore(
  element: HTMLElement,
  state: FieldState,
  active: () => boolean,
): Promise<boolean> {
  if (!active() || !isControlAvailable(element)) return false;
  if (state.choices) {
    for (const item of [...state.choices].sort((a, b) => Number(b.checked) - Number(a.checked))) {
      if (!active() || !isControlAvailable(item.element)) return false;
      await rawChoice(item.element, item.checked);
      if (item.element instanceof HTMLInputElement) item.element.indeterminate = item.indeterminate;
    }
  } else if (state.options && element instanceof HTMLSelectElement) {
    if (state.options.some((item) => !element.contains(item.option))) return false;
    ownWriteEvents(() => {
      element.selectedIndex = -1;
      for (const item of state.options!) item.option.selected = item.selected;
      notify(element);
    });
  } else if (state.files && element instanceof HTMLInputElement) {
    const transfer = new DataTransfer();
    state.files.forEach((file) => transfer.items.add(file));
    ownWriteEvents(() => {
      element.files = transfer.files;
      notify(element);
    });
  } else if (
    (element instanceof HTMLInputElement && !['button', 'submit'].includes(element.type)) ||
    element instanceof HTMLTextAreaElement ||
    isTextEditor(element)
  ) {
    if (state.content)
      ownWriteEvents(() => {
        element.replaceChildren(...state.content!.map((node) => node.cloneNode(true)));
        notify(element, state.value);
      });
    else setText(element, state.value);
  } else {
    // Restore through the widget's API surface; never fake its visible label.
    if (state.value) return rawDropdown(element, state.value, active);
    const clear = clearControl(element);
    if (clear && isControlAvailable(clear)) {
      safeClick(clear);
      await settle();
    } else {
      const root = element.getRootNode() as Document | ShadowRoot;
      const before = new Set([...boxes(root), ...boxes(document)]);
      safeClick(element, true);
      const options = scopedOptions(element, before);
      const placeholder = options.find((option) =>
        PLACEHOLDER_OPTION_NORMS.has(
          normalize(option.getAttribute('aria-label') || option.textContent || ''),
        ),
      );
      if (placeholder && isControlAvailable(placeholder)) safeClick(placeholder, true);
      await closeDropdown(element, active);
    }
  }
  blur(element);
  await settle();
  if (state.selection && !state.value && !sameFieldState(state, captureField(element))) {
    const clear = clearControl(element);
    if (clear && active() && isControlAvailable(clear)) {
      safeClick(clear);
      await settle();
    }
  }
  return sameFieldState(state, captureField(element));
}

export async function fillField(
  element: HTMLElement,
  value: string | string[],
  active: () => boolean = () => true,
): Promise<boolean> {
  if (
    (!value.length && !(element instanceof HTMLSelectElement && element.multiple)) ||
    !active() ||
    !isControlAvailable(element)
  )
    return false;
  setWriteConfidence(element, 1);
  return performWrite(
    element,
    active,
    async (before, current) => {
      if (element instanceof HTMLSelectElement) {
        const eligible = [...element.options].filter((option) => !isSkippableOption(option));
        const targets = Array.isArray(value)
          ? value.map((target) => {
              const matches = eligible.filter((option) => option.value === target);
              return matches.length === 1 ? matches[0] : null;
            })
          : [
              findBestMatch(
                eligible,
                value,
                (option) => option.value,
                (option) => option.text.trim(),
              ),
            ];
        if (targets.some((option) => !option) || (!element.multiple && targets.length !== 1))
          return false;
        focus(element);
        if (
          !current() ||
          !isControlAvailable(element) ||
          !sameFieldState(before, captureField(element))
        )
          return false;
        if (typeof value === 'string')
          optionConfidence(element, value, targets[0]!.value, targets[0]!.text);
        ownWriteEvents(() => {
          element.selectedIndex = -1;
          for (const option of targets) option!.selected = true;
          notify(element);
        });
        blur(element);
        await settle();
        return (
          valid(element) &&
          [...element.selectedOptions].length === targets.length &&
          targets.every((option) => option!.selected)
        );
      }
      if (Array.isArray(value)) return false;
      if (
        element.getAttribute('role') === 'combobox' ||
        element.getAttribute('aria-haspopup') === 'listbox'
      )
        return rawDropdown(element, value, current);
      if (
        !(
          element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement ||
          isTextEditor(element)
        )
      )
        return false;
      focus(element);
      if (
        !current() ||
        !isControlAvailable(element) ||
        !sameFieldState(before, captureField(element))
      )
        return false;
      const target = element instanceof HTMLInputElement ? dateValue(value, element) : value;
      setText(element, target);
      blur(element);
      await settle();
      return valid(element) && equivalent(element, target);
    },
    (state, current) => restore(element, state, current),
  );
}

export async function fillFileField(
  element: HTMLInputElement,
  data: DocumentFile,
): Promise<boolean> {
  const match = /^data:([^;]+);base64,(.+)$/.exec(data.base64);
  if (!match || !isControlAvailable(element)) return false;
  const accept = element.accept
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (
    accept.length &&
    !accept.some((item) =>
      item.startsWith('.')
        ? data.name.toLowerCase().endsWith(item)
        : item.endsWith('/*')
          ? match[1].toLowerCase().startsWith(item.slice(0, -1))
          : item === match[1].toLowerCase(),
    )
  )
    return false;
  return performWrite(
    element,
    () => true,
    async (before, current) => {
      focus(element);
      if (
        !current() ||
        !isControlAvailable(element) ||
        !sameFieldState(before, captureField(element))
      )
        return false;
      const binary = atob(match[2]);
      const file = new File(
        [Uint8Array.from(binary, (character) => character.charCodeAt(0))],
        data.name,
        { type: match[1] },
      );
      const transfer = new DataTransfer();
      transfer.items.add(file);
      ownWriteEvents(() => {
        element.files = transfer.files;
        notify(element);
      });
      blur(element);
      await settle();
      return (
        valid(element) &&
        element.files?.length === 1 &&
        element.files[0].name === file.name &&
        element.files[0].size === file.size
      );
    },
    (state, active) => restore(element, state, active),
  );
}
export async function fillCheckboxInput(element: HTMLElement, checked = true): Promise<boolean> {
  if (!isControlAvailable(element) || !isChoice(element)) return false;
  return performWrite(
    element,
    () => true,
    async (_, active) => {
      focus(element);
      if (!active() || !isControlAvailable(element)) return false;
      const result = await rawChoice(element, checked);
      blur(element);
      return (
        result &&
        isControlAvailable(element) &&
        (!(element instanceof HTMLInputElement) || element.validity.valid)
      );
    },
    (state, active) => restore(element, state, active),
  );
}
export const fillRadioInput = (element: HTMLElement): Promise<boolean> =>
  fillCheckboxInput(element);
export async function clearFieldValue(element: HTMLElement): Promise<boolean> {
  try {
    const state = captureField(element);
    if (state.choices)
      state.choices = state.choices.map((item) => ({
        ...item,
        checked: false,
        indeterminate: false,
      }));
    if (state.options) state.options = state.options.map((item) => ({ ...item, selected: false }));
    if (state.files) state.files = [];
    state.value = '';
    if (state.content) state.content = [];
    return await restore(element, state, () => true);
  } catch {
    return false;
  }
}
