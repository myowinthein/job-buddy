import { dropzoneLabel } from './dropzone';
import {
  composedAncestors,
  composedText,
  fileInputProxy,
  isTextEditor,
  queryOpenElements,
} from './dom';
import {
  ariaName,
  ariaReference,
  createLabelContext,
  labelText,
  ownText,
  precedingChoicePrompt,
} from './labels';
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
    dropzoneLabel(element) ||
    fileButtonLabel(element) ||
    shadowHosts(element)
      .map((host) => labelText(host, context) || host.getAttribute('label') || ariaName(host))
      .find(Boolean) ||
    ''
  );
}

/** A single-control file widget may expose its document name only on its button. */
function fileButtonLabel(element: HTMLElement): string {
  if (!(element instanceof HTMLInputElement) || element.type !== 'file' || ariaName(element))
    return '';
  const proxy = fileInputProxy(element);
  const buttons = proxy ? queryOpenElements(proxy, 'button,[role="button"]') : [];
  return buttons.length === 1 ? ariaName(buttons[0]) || composedText(buttons[0]) : '';
}

function getNearbyText(element: HTMLElement, context?: LabelContext): string {
  const description = ariaReference(element, 'aria-describedby');
  const prompt = precedingChoicePrompt(element, context);
  if (prompt) return [description, prompt].filter(Boolean).join(' ');
  // Drop zones often label only their file chooser, with the document question
  // in a heading outside the shadow host. Keep this as context, never a learned key.
  if (element instanceof HTMLInputElement && element.type === 'file') {
    for (const ancestor of composedAncestors(element)) {
      if (ancestor.matches('body,form,[role="form"]')) break;
      const controls = queryOpenElements(ancestor, CONTROL_SELECTOR);
      if (
        controls.some(
          (control) =>
            control !== element &&
            !(control instanceof HTMLInputElement && control.type === 'hidden'),
        )
      )
        break;
      if (ancestor.matches('fieldset,[role="group"]')) {
        const prompt =
          ariaName(ancestor) ||
          (ancestor.querySelector(':scope > legend')
            ? ownText(ancestor.querySelector(':scope > legend')!, context)
            : '');
        if (prompt) return [description, prompt].filter(Boolean).join(' ');
      }
      const headings = queryOpenElements(ancestor, 'h1,h2,h3,h4,h5,h6,[role="heading"]');
      if (headings.length === 1) return composedText(headings[0]) || description;
      const prompts = queryOpenElements(ancestor, 'label').filter(
        (label) =>
          label instanceof HTMLLabelElement && (!label.control || label.control === element) &&
          !/^(?:choose|select|browse|upload|attach|add)(?:\s+(?:a|your))?\s+files?(?:\s+or\s+drop\s+it\s+here)?\s*\*?$/i.test(composedText(label).trim()),
      );
      if (prompts.length === 1 && composedText(prompts[0])) return composedText(prompts[0]);
      const titles = [...ancestor.querySelectorAll(':scope > p')].filter((prompt) =>
        /^(?:r[eé]sum[eé]|cv|resume\s*\/\s*cv|cover\s+letter|portfolio)\s*\*?$/i.test(
          composedText(prompt),
        ),
      );
      if (titles.length === 1) return composedText(titles[0]);
    }
  }
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
