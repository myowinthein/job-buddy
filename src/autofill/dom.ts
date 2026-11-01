/** DOM helpers shared by discovery and the write-time safety checks. */
export function composedParent(element: Element): Element | null {
  if (element.assignedSlot) return element.assignedSlot;
  if (element.parentElement) return element.parentElement;
  const root = element.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

export function* composedAncestors(element: Element): Generator<Element> {
  for (let current: Element | null = element; current; current = composedParent(current))
    yield current;
}

export function isTextEditor(element: HTMLElement): boolean {
  if (element.getAttribute('role') === 'textbox') return true;
  const editable = element.getAttribute('contenteditable');
  return editable !== null && ['', 'true', 'plaintext-only'].includes(editable.toLowerCase());
}

export function isChoiceChecked(element: HTMLElement): boolean {
  return element instanceof HTMLInputElement
    ? element.checked
    : element.getAttribute('aria-checked') === 'true';
}

export function isChoice(element: HTMLElement): boolean {
  return element.matches(
    'input[type="checkbox"],input[type="radio"],[role="checkbox"],[role="radio"]',
  );
}

// No geometry requirement here: transparent native choices can have a visible
// label, and detached nodes must also be rejected after an asynchronous wait.
export function isControlAvailable(element: HTMLElement): boolean {
  if (!element.isConnected || element.matches(':disabled')) return false;
  if ('readOnly' in element && element.readOnly) return false;
  for (const ancestor of composedAncestors(element)) {
    if (
      ancestor.hasAttribute('data-job-buddy-ui') ||
      ancestor.hasAttribute('hidden') ||
      ancestor.hasAttribute('inert') ||
      ancestor.getAttribute('aria-hidden') === 'true' ||
      ancestor.getAttribute('aria-disabled') === 'true' ||
      ancestor.getAttribute('aria-readonly') === 'true'
    )
      return false;
    const style = getComputedStyle(ancestor);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.visibility === 'collapse' ||
      (parseFloat(style.opacity) === 0 &&
        (ancestor !== element || !(element instanceof HTMLInputElement) || !isChoice(element)))
    )
      return false;
  }
  return true;
}

export function hasVisibleSurface(
  element: HTMLElement,
  cache = new WeakMap<Element, boolean>(),
): boolean {
  for (const ancestor of composedAncestors(element)) {
    let visible = cache.get(ancestor);
    if (visible === undefined) {
      const style = getComputedStyle(ancestor);
      visible =
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.visibility !== 'collapse' &&
        parseFloat(style.opacity) !== 0;
      cache.set(ancestor, visible);
    }
    if (!visible) return false;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function associatedLabels(element: HTMLElement): HTMLLabelElement[] {
  const labels = (element as HTMLInputElement).labels;
  if (labels) return Array.from(labels);
  const parent = element.closest('label');
  return parent && (!parent.htmlFor || parent.htmlFor === element.id) ? [parent] : [];
}

export function isChoiceAvailable(element: HTMLElement): boolean {
  if (!isControlAvailable(element)) return false;
  if (hasVisibleSurface(element)) return true;
  // CSS often hides the real checkbox/radio while its label is the clickable UI.
  if (!(element instanceof HTMLInputElement)) return false;
  // isControlAvailable already rejects transparent/hidden ancestors. The
  // parent itself may legitimately have no box (for example display:contents).
  return associatedLabels(element).some(
    (label) => isControlAvailable(label) && hasVisibleSurface(label),
  );
}
