import { composedParent, isTextEditor } from './dom';
import { ariaName, ariaReference, createLabelContext, labelText, ownText } from './labels';
import type { LabelContext } from './labels';

export interface FieldSignals {
  element: HTMLElement;
  type: string;
  name: string;
  id: string;
  placeholder: string;
  autocomplete: string;
  ariaLabel: string;
  label: string;
  nearbyText: string;
}

const WRAPPER_SELECTORS = '.form-field,.form-group,.field,.input-wrapper,.form-item,[role="group"]';
const CONTROL_SELECTOR =
  'input,select,textarea,[role="textbox"],[role="combobox"],[contenteditable]';

function shadowHosts(element: HTMLElement): HTMLElement[] {
  const hosts: HTMLElement[] = [];
  let root = element.getRootNode();
  while (root instanceof ShadowRoot) {
    hosts.push(root.host as HTMLElement);
    root = root.host.getRootNode();
  }
  return hosts;
}

function withHostFallback(element: HTMLElement, getValue: (el: HTMLElement) => string): string {
  return getValue(element) || shadowHosts(element).map(getValue).find(Boolean) || '';
}

function getLabelText(element: HTMLElement, context?: LabelContext): string {
  return (
    labelText(element, context) ||
    shadowHosts(element)
      .map((host) => labelText(host, context) || host.getAttribute('label') || ariaName(host))
      .find(Boolean) ||
    ''
  );
}

function getNearbyText(element: HTMLElement, context?: LabelContext): string {
  const description = ariaReference(element, 'aria-describedby');
  const wrapper = element.closest(WRAPPER_SELECTORS);
  if (!wrapper) return description;
  // Shared wrappers are not evidence that another control's label belongs here.
  const controls = [...wrapper.querySelectorAll<HTMLElement>(CONTROL_SELECTOR)].filter(
    (control) => !control.parentElement?.closest('[role="combobox"],[contenteditable]'),
  );
  if (controls.length !== 1 || controls[0] !== element) return description;
  const text =
    [...wrapper.querySelectorAll('label,span,p')]
      .filter(
        (node) =>
          !node.hasAttribute('data-jb-field-description') &&
          (!(node instanceof HTMLLabelElement) || !node.htmlFor || node.control === element) &&
          !node.closest('[role="combobox"],[role="textbox"],[contenteditable]'),
      )
      .map((node) => ownText(node, context))
      .find(Boolean) ?? '';
  return [description, text].filter(Boolean).join(' ');
}

export function bestLabel(signals: FieldSignals): string {
  return signals.label || signals.ariaLabel || signals.placeholder || signals.name || '';
}

export function displayLabel(signals: FieldSignals): string | undefined {
  const label = (bestLabel(signals) || signals.nearbyText || '').trim();
  return label || undefined;
}

export function extractSignals(element: HTMLElement, context?: LabelContext): FieldSignals {
  const native = element.matches('input,textarea,select');
  return {
    element,
    type: native
      ? (element as HTMLInputElement).type || element.tagName.toLowerCase()
      : element.getAttribute('role') ||
        (isTextEditor(element) ? 'textbox' : element.tagName.toLowerCase()),
    name: withHostFallback(element, (el) => el.getAttribute('name') || ''),
    id: withHostFallback(element, (el) => el.id || ''),
    placeholder: withHostFallback(
      element,
      (el) => el.getAttribute('placeholder') || el.getAttribute('aria-placeholder') || '',
    ),
    autocomplete: withHostFallback(element, (el) => el.getAttribute('autocomplete') || ''),
    ariaLabel: withHostFallback(element, ariaName),
    label: getLabelText(element, context),
    nearbyText: getNearbyText(element, context),
  };
}

/** A fresh reader per scan; no cached DOM labels survive into the next run. */
export function createSignalReader(
  elements: HTMLElement[],
  context = createLabelContext(elements),
): (element: HTMLElement) => FieldSignals {
  const cache = new WeakMap<HTMLElement, FieldSignals>();
  return (element) => {
    let signals = cache.get(element);
    if (!signals) cache.set(element, (signals = extractSignals(element, context)));
    return signals;
  };
}

/** Find the nearest composed form, including a native control's form owner. */
export function controlForm(element: HTMLElement): Element | null {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
  )
    if (element.form) return element.form;
  for (let current: Element | null = element; current; current = composedParent(current))
    if (current.matches('form,[role="form"]')) return current;
  return null;
}
