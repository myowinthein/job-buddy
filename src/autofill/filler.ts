import { hasFileAttachment } from './fileAttachment';
import { languageChoiceAliases } from './languageChoices';
import { educationChoiceAliases } from './educationChoices';
import { calendarInput, calendarValue, closeCalendar, sameCalendarDate } from './calendarInput';
import { waitNativeSelectCommit } from './nativeSelectCommit';
import { sameTelephone, telephoneCountry } from './phoneWidget';
import { dropzoneSurface, dropzonePreviews, waitDropzoneFile } from './dropzone';
import {
  composedText,
  composedParent,
  isControlAvailable,
  isChoice,
  isChoiceChecked,
  isTextEditor,
  queryOpenElements,
} from './dom';
import { extractSignals } from './signals';
import { readFieldValue } from './fieldValue';
import { captureField, sameFieldState } from './fieldState';
import type { FieldState } from './fieldState';
import { ownWriteEvents, performWrite, setWriteConfidence } from './writeSession';
import type { WriteDependencies } from './writeSession';
import type { DocumentFile } from '../types/profile';
import { COUNTRIES, countryName } from '../data/countries';
import { searchableSelect } from './reactSelect';
import { menuSelect, selectMenu, selectMenuSearch } from './menuSelect';
import { normalize, similarity, isSkippableOption, PLACEHOLDER_OPTION_NORMS } from './normalizer';
import { CONF_FUZZY_THRESHOLD, CONF_AI_YELLOW } from './constants';

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
const DROPDOWN_WAIT_MS = 4_000;
const UNBOUND_DROPDOWN_WAIT_MS = 300;
const DROPDOWN_RUN_BUDGET_MS = 8_000;
export interface FillFieldContext {
  /** Only supplied for a mapped address.city; never infer locations from arbitrary labels. */
  cityCountry?: string;
  callingCodeCountry?: string;
  /** A country change may recreate an already identified region control. */
  restoreAfter?: (active: () => boolean) => Promise<boolean>;
  dependencies?: WriteDependencies;
  optionAliases?: readonly string[];
}
let dropdownBudget = DROPDOWN_RUN_BUDGET_MS;
export function resetDropdownBudget(): void {
  dropdownBudget = DROPDOWN_RUN_BUDGET_MS;
}

const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
async function settleFramework(): Promise<void> {
  await settle();
  // Controlled widgets can reconcile in a scheduled effect after microtasks.
  // Verify the committed value before snapshotting it or toggling a closing menu.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await settle();
}
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
    // Date masks can cache the previous value on keydown (for example Cleave).
    // A neutral key initializes that bookkeeping without navigation defaults.
    const maskedDate =
      element instanceof HTMLInputElement &&
      /^(?:tel|numeric)$/.test(element.inputMode) &&
      /^(?:[dmy]{1,4}[\s/.-]*){2,3}$/i.test(element.placeholder.trim());
    if (
      maskedDate &&
      !element.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Unidentified',
          bubbles: true,
          composed: true,
          cancelable: true,
        }),
      )
    )
      return;

    if (element instanceof HTMLInputElement) {
      if (nativeInputSetter) nativeInputSetter.call(element, value);
      else element.value = value;
    } else if (element instanceof HTMLTextAreaElement) {
      if (nativeTextareaSetter) nativeTextareaSetter.call(element, value);
      else element.value = value;
    } else element.textContent = value;
    notify(element, value);
    if (maskedDate)
      element.dispatchEvent(
        new KeyboardEvent('keyup', {
          key: 'Unidentified',
          bubbles: true,
          composed: true,
        }),
      );
  });
}
function safeClick(
  element: HTMLElement,
  pointer = false,
  menuMouse = !!menuSelect(element) || !!telephoneCountry(element),
): void {
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
              ...(menuMouse ? { view: element.ownerDocument.defaultView, detail: 1 } : {}),
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
          new MouseEvent('mouseup', {
            ...(menuMouse ? { view: element.ownerDocument.defaultView, detail: 1 } : {}),
            bubbles: true,
            composed: true,
            cancelable: true,
            button: 0,
          }),
        );
      }
      if (element.isConnected) {
        if (pointer && menuMouse)
          element.dispatchEvent(
            new MouseEvent('click', {
              view: element.ownerDocument.defaultView,
              detail: 1,
              bubbles: true,
              composed: true,
              cancelable: true,
              button: 0,
            }),
          );
        else element.click();
      }
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
  aliases: readonly string[] = [],
): T | null {
  if (!target || !normalize(target)) return null;
  for (const norm of [false, true]) {
    const equal = (text: string) =>
      norm ? normalize(text) === normalize(target) : text === target;
    const matches = items.filter((item) => equal(primary(item)) || equal(secondary(item)));
    if (matches.length) return matches.length === 1 ? matches[0] : null;
  }
  for (const alias of aliases) {
    const matches = items.filter(
      (item) =>
        normalize(primary(item)) === normalize(alias) ||
        normalize(secondary(item)) === normalize(alias),
    );
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
  return sameTelephone(element, actual, expected) || sameCalendarDate(element, actual, expected);
}
function valid(element: HTMLElement): boolean {
  if (!isControlAvailable(element) || element.getAttribute('aria-invalid') === 'true') return false;
  if (element instanceof HTMLButtonElement && telephoneCountry(element)) return true;
  // Angular value accessors can reject a value while the inner native input
  // still reports valid. Only inspect the local component, never a whole form.
  for (
    let parent = element.parentElement, depth = 0;
    parent && depth < 3;
    parent = parent.parentElement, depth++
  ) {
    if (parent.matches('body,form,.field,.form-field,.form-group')) break;
    if (parent.tagName.includes('-') && parent.classList.contains('ng-invalid')) return false;
  }
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)
    return (
      element.validity.valid && (element.maxLength < 0 || element.value.length <= element.maxLength)
    );
  return !(element instanceof HTMLSelectElement) || element.validity.valid;
}

function boxes(root: Document | ShadowRoot): HTMLElement[] {
  return queryOpenElements(root, '[role="listbox"],.cdk-overlay-pane').filter(
    node => isControlAvailable(node) && !node.querySelector('[role="listbox"]'),
  );
}
function scopedOptions(trigger: HTMLElement, before: Set<HTMLElement>): HTMLElement[] {
  if (menuSelect(trigger)) {
    const menu = selectMenu(trigger);
    return menu
      ? queryOpenElements(menu, '[role="menuitem"],[role="menuitemradio"],[role="option"]')
      : [];
  }
  const root = trigger.getRootNode() as Document | ShadowRoot;
  const ids = [
    ...new Set(
      `${trigger.getAttribute('aria-controls') ?? ''} ${trigger.getAttribute('aria-owns') ?? ''}`
        .trim()
        .split(/\s+/)
        .filter(Boolean),
    ),
  ];
  if (ids.length) {
    // A native trigger can live inside an input component while its explicitly
    // linked menu belongs to an enclosing component's shadow root.
    for (let scope: Document | ShadowRoot = root; ; ) {
      const menus = ids.map((id) => scope.getElementById(id)).filter((menu) => !!menu);
      if (menus.length) return menus.flatMap((menu) => queryOpenElements(menu, '[role="option"]'));
      if (!(scope instanceof ShadowRoot)) return [];
      scope = scope.host.getRootNode() as Document | ShadowRoot;
    }
  }
  const parent =
    trigger.getAttribute('role') === 'combobox' && trigger.querySelector('[role="listbox"]')
      ? trigger
      : trigger.parentElement;
  if (
    parent &&
    !parent.matches('body,form') &&
    parent.querySelectorAll(
      '[role="combobox"],[aria-haspopup="listbox"],button[aria-haspopup="true"][data-menu-id]',
    ).length <= 1
  ) {
    const local = parent.querySelectorAll<HTMLElement>('[role="listbox"]');
    if (local.length === 1) return queryOpenElements(local[0], '[role="option"]');
  }
  const candidates = [...new Set([...boxes(root), ...boxes(document)])].filter(
    (box) =>
      !before.has(box) ||
      (!!trigger.id && box.getAttribute('aria-labelledby')?.split(/\s+/).includes(trigger.id)),
  );
  if (candidates.length !== 1) return [];
  const options = queryOpenElements(candidates[0], '[role="option"]');
  if (options.length || !searchableSelect(trigger)?.trigger) return options;
  return queryOpenElements(candidates[0], 'button[type="button"]').filter(
    button => button.querySelector('.option-label'),
  );
}
function dropdownSearch(trigger: HTMLElement, before: Set<HTMLElement>): HTMLInputElement | null {
  const linked = selectMenuSearch(trigger);
  if (linked) return linked;
  const candidates = boxes(document).filter(box => !before.has(box));
  if (candidates.length !== 1) return null;
  const area = candidates[0].closest('.cdk-overlay-pane') ?? candidates[0];
  const inputs = area.querySelectorAll<HTMLInputElement>('input[type="search"]');
  return inputs.length === 1 ? inputs[0] : null;
}
/** Real pointer clicks land on the option's label and bubble through its
 * presentation wrappers. A click dispatched on the outer role node cannot
 * reach handlers attached to an inner wrapper. Avoid nested action controls. */
function optionClickTarget(option: HTMLElement): HTMLElement {
  const walker = option.ownerDocument.createTreeWalker(option, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (
      node.textContent?.trim() &&
      parent instanceof HTMLElement &&
      !parent.closest('svg,button,a,input,select,textarea,[role="button"],[aria-hidden="true"]') &&
      isControlAvailable(parent)
    )
      return parent;
  }
  return option;
}
function ariaOption(
  options: HTMLElement[],
  value: string,
  placeholder = false,
  context: FillFieldContext = {},
): HTMLElement | null {
  const eligible = options.filter(
    (option) =>
      isControlAvailable(option) &&
      (placeholder ||
        !PLACEHOLDER_OPTION_NORMS.has(
          normalize(option.getAttribute('aria-label') || composedText(option)),
        )),
  );
  const country = context.cityCountry;
  if (
    /^\+\d+$/.test(value) &&
    (context.callingCodeCountry || eligible.some(option => /\(\+\d+\)/.test(composedText(option))))
  ) {
    const names = context.callingCodeCountry
      ? [context.callingCodeCountry, countryName(context.callingCodeCountry)]
      : [];
    const qualified = eligible.filter((option) => {
      const label = normalize(option.getAttribute('aria-label') || composedText(option));
      return names.some(
        (name) =>
          label === normalize(`${name} ${value}`) || label === normalize(`${value} ${name}`),
      );
    });
    if (qualified.length) return qualified.length === 1 ? qualified[0] : null;
    const countriesForCode = COUNTRIES.filter(country => country.callingCode === value);
    if (
      !context.callingCodeCountry ||
      (countriesForCode.length === 1 && countriesForCode[0].code === context.callingCodeCountry)
    ) {
      const matchingCodes = eligible.filter(
        option => /\(\+(\d+)\)/.exec(composedText(option))?.[1] === value.slice(1),
      );
      if (matchingCodes.length) return matchingCodes.length === 1 ? matchingCodes[0] : null;
    }
    // Bare codes remain supported, but never choose another country sharing a code.
    const bare = eligible.filter(
      (option) =>
        normalize(option.getAttribute('aria-label') || composedText(option)) === normalize(value),
    );
    return bare.length === 1 ? bare[0] : null;
  }
  if (country) {
    const cities = eligible.filter((option) => {
      const parts = (option.getAttribute('aria-label') || composedText(option))
        .split(',')
        .map(normalize);
      return (
        parts.length > 1 && parts[0] === normalize(value) && parts.at(-1) === normalize(country)
      );
    });
    if (cities.length) return cities.length === 1 ? cities[0] : null;
    // A qualified city from a different country must never win a fuzzy match.
    return findBestMatch(
      eligible.filter((option) => !composedText(option).includes(',')),
      value,
      composedText,
      (option) => option.getAttribute('aria-label')?.trim() ?? '',
    );
  }
  return findBestMatch(
    eligible,
    value,
    composedText,
    (option) => option.getAttribute('aria-label')?.trim() ?? '',
    context.optionAliases,
  );
}
async function waitOption(
  trigger: HTMLElement,
  before: Set<HTMLElement>,
  value: string,
  active: () => boolean,
  placeholder: boolean,
  context: FillFieldContext,
): Promise<HTMLElement | null> {
  const linked =
    trigger.hasAttribute('aria-controls') ||
    trigger.hasAttribute('aria-owns') ||
    trigger.getAttribute('aria-expanded') === 'true' ||
    !!menuSelect(trigger) || !!searchableSelect(trigger) || !!telephoneCountry(trigger);
  const limit = Math.min(dropdownBudget, linked ? DROPDOWN_WAIT_MS : UNBOUND_DROPDOWN_WAIT_MS);
  const start = Date.now();
  const signals = extractSignals(trigger);
  const root = trigger.getRootNode();
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let finished = false;
    let searches = 0;
    const countries = COUNTRIES.filter(country => country.callingCode === value);
    const country = context.callingCodeCountry || (telephoneCountry(trigger) && countries.length === 1 ? countries[0].code : '');
    const queries = [...new Set([value, ...(country ? [country, countryName(country)] : [])])];
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
      // An exact declared alias may already be visible. Filtering by the
      // longer profile value first can hide it and burn the whole wait budget.
      if (context.optionAliases?.length) {
        const visible = ariaOption(scopedOptions(trigger, before), value, placeholder, context);
        const exact = new Set([value, ...context.optionAliases].map(normalize));
        if (visible && [composedText(visible), visible.getAttribute('aria-label') ?? ''].some((label) => exact.has(normalize(label))))
          return finish(visible);
      }
      const search = dropdownSearch(trigger, before);
      if (searches < queries.length && search && isControlAvailable(search)) {
        setText(search, queries[searches++]);
      }
      const options = scopedOptions(trigger, before);
      const option = ariaOption(options, value, placeholder, {
        ...context,
        optionAliases: [
          ...(context.optionAliases ?? []),
          ...educationChoiceAliases(signals, value, options.map(composedText)),
        ],
      });
      if (option) return finish(option);
      if (
        Date.now() - start >= limit ||
        (options.length &&
          !(trigger instanceof HTMLInputElement) &&
          !menuSelect(trigger) &&
          !search &&
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
function applicationPanel(element: HTMLElement): Element | null {
  for (let parent = composedParent(element); parent; parent = composedParent(parent)) {
    if (parent.matches('dialog,[role="dialog"],[aria-modal="true"]')) return parent;
  }
  return null;
}
async function closeDropdown(
  element: HTMLElement,
  active: () => boolean = () => true,
  before?: Set<HTMLElement>,
): Promise<void> {
  // A completed selection may already have closed its menu. Escape at that
  // point can dismiss the enclosing application dialog instead.
  if (element.getAttribute('aria-expanded') === 'false') return;
  const custom = searchableSelect(element);
  if (custom?.trigger) {
    const root = element.getRootNode() as Document | ShadowRoot;
    const opened = before ? [...new Set([...boxes(root), ...boxes(document)])].filter(box => !before.has(box)) : [];
    if (opened.length === 1) safeClick(custom.trigger, true);
    await settleFramework();
    return;
  }
  // Dialog focus traps can handle Escape in the capture phase, before any
  // widget handler can stop it. Use the widget toggle and the caller's blur
  // cleanup instead, so a dropdown cannot dismiss the application itself.
  if (applicationPanel(element)) {
    if (
      !(element instanceof HTMLInputElement) &&
      !(element instanceof HTMLTextAreaElement) &&
      !element.isContentEditable &&
      element.getAttribute('aria-expanded') === 'true'
    )
      safeClick(element, true);
    await settleFramework();
    return;
  }
  ownWriteEvents(() =>
    element.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }),
    ),
  );
  await settleFramework();
  // A widget can close on keydown while its enclosing dialog closes on keyup.
  // Do not send a second dismissal after the widget has handled the first one.
  if (!active() || element.getAttribute('aria-expanded') === 'false') return;
  ownWriteEvents(() =>
    element.dispatchEvent(
      new KeyboardEvent('keyup', { key: 'Escape', bubbles: true, composed: true }),
    ),
  );
  await settleFramework();
  if (active() && element.getAttribute('aria-expanded') === 'true') safeClick(element, true);
  await settleFramework();
}
async function rawDropdown(
  element: HTMLElement,
  value: string,
  active: () => boolean,
  placeholder = false,
  context: FillFieldContext = {},
): Promise<boolean> {
  const signals = extractSignals(element);
  context = { ...context, optionAliases: [...(context.optionAliases ?? []), ...languageChoiceAliases(signals, value), ...educationChoiceAliases(signals, value)] };
  const root = element.getRootNode() as Document | ShadowRoot;
  const before = new Set([...boxes(root), ...boxes(document)]);
  const wasOpen = element.getAttribute('aria-expanded') === 'true';
  const trigger = searchableSelect(element)?.trigger ?? element;
  try {
    if (!active() || !isControlAvailable(element)) return false;
    focus(element);
    if (!active() || !isControlAvailable(element)) return false;
    if (!wasOpen) safeClick(trigger, true);
    if (
      element instanceof HTMLInputElement &&
      !element.readOnly &&
      !searchableSelect(element)?.trigger &&
      !['button', 'submit', 'hidden'].includes(element.type)
    )
      setText(element, value);
    await settle();
    const option = await waitOption(element, before, value, active, placeholder, context);
    if (!option || !active() || !isControlAvailable(option)) return false;
    const text = composedText(option);
    const label = option.getAttribute('aria-label') || text;
    const priorValue = readFieldValue(element);
    const priorBacking = menuSelect(element)?.select.value;
    const priorExplicit = [
      element.getAttribute('aria-valuetext'),
      element.dataset.selected,
      element.dataset.value,
    ];
    const target = optionClickTarget(option);
    const pointer = target === option || !!menuSelect(element);
    safeClick(target, pointer, !!menuSelect(element));
    await settleFramework();
    // Controlled menu buttons can commit their facade and backing select on
    // the next frame. Checking immediately can reject and undo a valid choice.
    if (menuSelect(element)) {
      await waitNativeSelectCommit(() => {
        const answer = readFieldValue(element);
        return !!menuSelect(element)?.select.value && [value, label].some(
          expected => normalize(answer) === normalize(expected),
        );
      }, active);
    }
    let retained = readFieldValue(element);
    let selected = option.isConnected && option.getAttribute('aria-selected') === 'true';
    // Inner presentation nodes can be recreated on mousedown. Prefer their
    // click handler, then retain pointer-based selection for widgets that need it.
    if (
      !pointer &&
      retained === priorValue &&
      !selected &&
      active() &&
      isControlAvailable(option)
    ) {
      safeClick(optionClickTarget(option), true, !!menuSelect(element));
      await settleFramework();
      retained = readFieldValue(element);
      selected = option.isConnected && option.getAttribute('aria-selected') === 'true';
    }
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
      optionConfidence(element, value, label, text);
      if (!selected && !knownValue) setWriteConfidence(element, CONF_AI_YELLOW);
    }
    return (
      accepted &&
      valid(element) &&
      (priorBacking === undefined ||
        retained === priorValue ||
        menuSelect(element)?.select.value !== priorBacking)
    );
  } finally {
    if (active() && !wasOpen) await closeDropdown(element, active, before);
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
    if (
      parent.querySelectorAll(
        '[role="combobox"],[aria-haspopup="listbox"],button[aria-haspopup="true"][data-menu-id]',
      ).length > 1
    )
      return null;
    const controls = [
      ...parent.querySelectorAll<HTMLElement>(
        'input,select,textarea,[role="combobox"],[role="textbox"],button[aria-haspopup="true"][data-menu-id]',
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
/** Puts a control back to a captured state; Undo and rollback both go through it. */
export async function restore(
  element: HTMLElement,
  state: FieldState,
  active: () => boolean,
): Promise<boolean> {
  if (!active() || !isControlAvailable(element)) return false;
  if (searchableSelect(element)) {
    if (state.value) return rawDropdown(element, state.value, active);
    const clear = clearControl(element);
    if (clear && isControlAvailable(clear)) safeClick(clear);
    else {
      focus(element);
      setText(element, '');
      ownWriteEvents(() =>
        element.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Backspace',
            code: 'Backspace',
            bubbles: true,
            composed: true,
            cancelable: true,
          }),
        ),
      );
    }
    await settleFramework();
    if (active()) await closeDropdown(element, active);
    blur(element);
    await settleFramework();
    return sameFieldState(state, captureField(element));
  }
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
    if (!(await waitNativeSelectCommit(() => sameFieldState(state, captureField(element)), active)))
      return false;
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
  await settleFramework();
  if (state.options && element instanceof HTMLSelectElement)
    return waitNativeSelectCommit(() => sameFieldState(state, captureField(element)), active);
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
  context: FillFieldContext = {},
): Promise<boolean> {
  if (
    (!value.length && !(element instanceof HTMLSelectElement && element.multiple)) ||
    !active() ||
    !isControlAvailable(element)
  )
    return false;
  if (
    typeof value === 'string' &&
    (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) &&
    element.maxLength >= 0 &&
    value.length > element.maxLength
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
                [...languageChoiceAliases(extractSignals(element), value), ...educationChoiceAliases(extractSignals(element), value, eligible.map(option => option.text.trim()))],
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
        const retained = () => (
          valid(element) &&
          [...element.selectedOptions].length === targets.length &&
          targets.every((option) => option!.selected)
        );
        if (!(await waitNativeSelectCommit(retained, current))) return false;
        blur(element);
        return waitNativeSelectCommit(retained, current);
      }
      if (Array.isArray(value)) return false;
      if (
        element.getAttribute('role') === 'combobox' ||
        element.getAttribute('aria-haspopup') === 'listbox' ||
        !!menuSelect(element) || !!searchableSelect(element) || (element instanceof HTMLButtonElement && !!telephoneCountry(element))
      )
        return rawDropdown(element, value, current, false, context);
      if (
        !(
          element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement ||
          isTextEditor(element)
        )
      )
        return false;
      focus(element);
      if (calendarInput(element)) await settleFramework();
      if (
        !current() ||
        !isControlAvailable(element) ||
        !sameFieldState(before, captureField(element))
      )
        return false;
      const target = element instanceof HTMLInputElement
        ? (element.matches('.mat-datepicker-input[data-mat-calendar]') ? value : dateValue(calendarInput(element) ? calendarValue(element, value) : value, element))
        : value;
      setText(element, target);
      if (calendarInput(element)) {
        await settleFramework();
        await closeCalendar(element, current);
      }
      blur(element);
      await settleFramework();
      return valid(element) && equivalent(element, target);
    },
    async (state, current) => {
      if (!(await restore(element, state, current))) return false;
      return !context.restoreAfter || (await context.restoreAfter(current));
    },
    context.dependencies,
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
  if (hasFileAttachment(element, data.name)) return true;
  const surface = dropzoneSurface(element);
  const previews = surface ? dropzonePreviews(element) : [];
  let added: HTMLElement | null = null;
  const restoreFile = async (state: FieldState, active: () => boolean) => {
    if (!surface) return restore(element, state, active);
    if (!active() || !previews.every((preview) => preview.isConnected)) return false;
    // Remove only the preview created by this write, preserving earlier files.
    const created =
      added ?? dropzonePreviews(element).find((preview) => !previews.includes(preview));
    if (created?.isConnected) {
      const remove = created.querySelector<HTMLElement>('[data-dz-remove]');
      if (!remove || !isControlAvailable(remove)) return false;
      safeClick(remove);
      await settleFramework();
      if (created.isConnected) return false;
    }
    const transfer = new DataTransfer();
    state.files?.forEach((file) => transfer.items.add(file));
    ownWriteEvents(() => {
      element.files = transfer.files;
    });
    return sameFieldState(state, captureField(element));
  };
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
      if (
        surface &&
        previews.some(
          (preview) => preview.querySelector('[data-dz-name]')?.textContent?.trim() === data.name,
        )
      ) {
        return (
          before.files?.some((file) => file.name === data.name && file.size === data.size) ?? false
        );
      }
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
        if (surface) {
          // A normal change makes Dropzone destroy/recreate its native picker.
          // Use its public drop interaction while retaining this ledger anchor.
          surface.dispatchEvent(
            new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }),
          );
        } else notify(element);
      });
      blur(element);
      if (surface) {
        added = await waitDropzoneFile(element, file, previews, current);
        if (!added) return false;
      }
      await settle();
      return (
        valid(element) &&
        element.files?.length === 1 &&
        element.files[0].name === file.name &&
        element.files[0].size === file.size
      );
    },
    restoreFile,
    surface
      ? {
          target: surface.closest('form,[role="form"]')!,
          matches: (event) =>
            event.type === 'drop' ||
            (event.target instanceof Element &&
              !!event.target.closest('.dz-preview,.dz-clickable')),
        }
      : undefined,
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
