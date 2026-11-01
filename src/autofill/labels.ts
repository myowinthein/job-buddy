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
      'input,select,textarea,button,[role="combobox"],[role="textbox"],[role="radio"],[role="checkbox"],[contenteditable],[data-jb-field-description],script,style',
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
      return reference?.hasAttribute('data-jb-field-description')
        ? ''
        : (reference?.textContent?.trim() ?? '');
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
