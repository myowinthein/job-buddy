import { associatedLabels } from './dom';

export interface LabelContext {
  labels: Map<Node, Map<string, HTMLLabelElement[]>>;
  text: WeakMap<Element, string>;
}

export function createLabelContext(elements: HTMLElement[]): LabelContext {
  const context: LabelContext = { labels: new Map(), text: new WeakMap() };
  for (const element of elements) {
    if (!(element instanceof HTMLLabelElement) || !element.htmlFor) continue;
    const root = element.getRootNode();
    let labels = context.labels.get(root);
    if (!labels) context.labels.set(root, (labels = new Map()));
    const matches = labels.get(element.htmlFor) ?? [];
    matches.push(element);
    labels.set(element.htmlFor, matches);
  }
  return context;
}

// Exclude the answer widgets and Job Buddy's own feedback from label prose.
export function ownText(element: Element, context?: LabelContext): string {
  const cached = context?.text.get(element);
  if (cached !== undefined) return cached;
  const clone = element.cloneNode(true) as Element;
  clone
    .querySelectorAll(
      'input,select,textarea,button,[role="button"],[role="combobox"],[role="textbox"],[role="radio"],[role="checkbox"],[role="dialog"],[role="grid"],[role="listbox"],[role="menu"],[aria-hidden="true"],[hidden],[contenteditable],[data-jb-field-description],.react-datepicker__aria-live,.react-datepicker-popper,script,style,svg',
    )
    .forEach((node) => node.remove());
  const text = (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
  context?.text.set(element, text);
  return text;
}

export function ariaReference(element: Element, attribute: string): string {
  const root = element.getRootNode() as Document | ShadowRoot;
  return (element.getAttribute(attribute) ?? '')
    .split(/\s+/)
    .map((id) => {
      const reference = root.getElementById?.(id);
      return reference?.hasAttribute('data-jb-field-description') ||
        (attribute === 'aria-labelledby' && reference?.matches('.react-datepicker__aria-live,[role="status"],[role="log"]'))
        ? ''
        : reference
          ? attribute === 'aria-labelledby'
            ? ownText(reference)
            : (reference.textContent?.trim() ?? '')
          : '';
    })
    .filter(Boolean)
    .join(' ');
}

export function ariaName(element: Element): string {
  return (
    ariaReference(element, 'aria-labelledby') || element.getAttribute('aria-label')?.trim() || ''
  );
}

export function labelText(element: HTMLElement, context?: LabelContext): string {
  const linked =
    element.id && context
      ? (context.labels.get(element.getRootNode())?.get(element.id) ?? [])
      : associatedLabels(element);
  const wrapping = element.closest('label');
  const labels = [
    ...new Set([
      ...linked,
      ...(wrapping && (!wrapping.htmlFor || wrapping.htmlFor === element.id) ? [wrapping] : []),
    ]),
  ].sort((a, b) =>
    a === b ? 0 : a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
  );
  return labels
    .map((label) => ownText(label, context))
    .filter(Boolean)
    .join(' ');
}

export function controlName(element: HTMLElement, context?: LabelContext): string {
  return (
    ariaName(element) || labelText(element, context) || element.getAttribute('label')?.trim() || ''
  );
}

/** A generic choice label can have its real prompt immediately above its wrapper. */
export function precedingChoicePrompt(element: HTMLElement, context?: LabelContext): string {
  if (!element || typeof element.getAttribute !== 'function') return '';
  if (
    !(typeof HTMLSelectElement !== 'undefined' && element instanceof HTMLSelectElement) &&
    element.getAttribute('role') !== 'combobox' &&
    element.getAttribute('aria-haspopup') !== 'listbox'
  )
    return '';
  const generic = (text: string) =>
    /^(?:please\s+select|select(?:\s+one)?|choose(?:\s+one)?)[\s:*]*$/i.test(text);
  const name = controlName(element, context);
  if (name && !generic(name)) return '';
  const root = element.getRootNode();
  const controls = 'input,select,textarea,[role="combobox"],[role="textbox"],[contenteditable]';
  for (
    let branch: Element = element, parent = branch.parentElement;
    parent;
    branch = parent, parent = parent.parentElement
  ) {
    if (parent.getRootNode() !== root || parent.matches('body,form,[role="form"]')) break;
    if (parent.querySelectorAll(controls).length !== 1) break;
    for (
      let sibling = branch.previousElementSibling;
      sibling;
      sibling = sibling.previousElementSibling
    ) {
      if (sibling.matches(controls) || sibling.querySelector(controls)) return '';
      if (!sibling.matches('p,label,legend,span,div,h1,h2,h3,h4,h5,h6')) continue;
      const text = ownText(sibling, context);
      if (text && !generic(text)) return text;
    }
  }
  return '';
}
