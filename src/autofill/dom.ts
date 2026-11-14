import { dropzoneSurface } from './dropzone';
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

/** Query a bounded widget subtree, including its open shadow roots. */
export function queryOpenElements(root: ParentNode, selector: string): HTMLElement[] {
  const matches = [...root.querySelectorAll<HTMLElement>(selector)];
  for (const element of root.querySelectorAll('*'))
    if (element.shadowRoot) matches.push(...queryOpenElements(element.shadowRoot, selector));
  return matches;
}

/** Read rendered slot content rather than the empty light DOM of an inner option. */
export function composedText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (node instanceof Element && node.matches('script,style,[aria-hidden="true"]')) return '';
  const children =
    node instanceof HTMLSlotElement
      ? node.assignedNodes({ flatten: true })
      : [...(node instanceof Element && node.shadowRoot ? node.shadowRoot : node).childNodes];
  return children.map(composedText).join(' ').replace(/\s+/g, ' ').trim();
}

export function isTextEditor(element: HTMLElement): boolean {
  if (element.getAttribute('role') === 'textbox') return true;
  const editable = element.getAttribute('contenteditable');
  return editable !== null && ['', 'true', 'plaintext-only'].includes(editable.toLowerCase());
}

export function isChoiceChecked(element: HTMLElement): boolean {
  return element instanceof HTMLInputElement && ['checkbox', 'radio'].includes(element.type)
    ? element.checked
    : element.getAttribute('aria-checked') === 'true';
}

export function isChoice(element: HTMLElement): boolean {
  return element.matches(
    'input[type="checkbox"],input[type="radio"],[role="checkbox"],[role="radio"]',
  );
}

/** Hidden file inputs are usable only through a specific, visible upload surface. */
export function fileInputProxy(element: HTMLInputElement): HTMLElement | undefined {
  if (element.type !== 'file') return undefined;
  const dropzone = dropzoneSurface(element);
  if (dropzone && isControlAvailable(dropzone) && hasVisibleSurface(dropzone)) return dropzone;
  const button = element.closest<HTMLElement>('button,[role="button"]');
  const proxies = [...associatedLabels(element), ...(button ? [button] : [])];
  // Overlay inputs can have no id/label association and tabIndex=-1. Accept
  // only a local, single-file widget with one explicit file-picker button.
  for (
    let parent = element.parentElement, depth = 0;
    parent && depth < 3;
    parent = parent.parentElement, depth++
  ) {
    if (parent.matches('form,body')) break;
    const controls = queryOpenElements(
      parent,
      'input,select,textarea,[role="combobox"],[role="textbox"],[contenteditable]',
    );
    if (controls.some((control) => control !== element)) break;
    const buttons = queryOpenElements(parent, 'button,[role="button"]');
    if (
      buttons.length === 1 &&
      isControlAvailable(buttons[0]) &&
      hasVisibleSurface(buttons[0]) &&
      /^(?:add|choose|select|browse|upload|attach)(?:\s+(?:a|your))?\s+(?:file|r[eé]sum[eé]|cv|cover\s+letter|portfolio)\s*\*?$/i.test(
        (buttons[0].getAttribute('aria-label') || composedText(buttons[0])).trim(),
      )
    ) {
      proxies.push(parent);
      break;
    }
  }
  return proxies.find((proxy) => {
    if (!isControlAvailable(proxy) || !hasVisibleSurface(proxy)) return false;
    const controls = queryOpenElements(
      proxy,
      'input,select,textarea,[role="combobox"],[role="textbox"],[contenteditable]',
    );
    return (
      controls.every((control) => control === element) &&
      (controls.includes(element) ||
        (proxy instanceof HTMLLabelElement && proxy.control === element))
    );
  });
}

// No geometry requirement here: transparent native choices can have a visible
// label, and detached nodes must also be rejected after an asynchronous wait.
export function isControlAvailable(element: HTMLElement): boolean {
  if (!element.isConnected || element.matches(':disabled')) return false;
  if (
    'readOnly' in element &&
    element.readOnly &&
    element.getAttribute('role') !== 'combobox' &&
    element.getAttribute('aria-haspopup') !== 'listbox'
  )
    return false;
  const fileProxy =
    element instanceof HTMLInputElement && element.type === 'file'
      ? fileInputProxy(element)
      : undefined;
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
      (style.display === 'none' && !(ancestor === element && fileProxy)) ||
      (style.visibility === 'hidden' && !(ancestor === element && fileProxy)) ||
      style.visibility === 'collapse' ||
      (parseFloat(style.opacity) === 0 &&
        (ancestor !== element ||
          !(element instanceof HTMLInputElement) ||
          (!isChoice(element) && element.type !== 'file')))
    )
      return false;
  }
  return true;
}

export function hasVisibleSurface(
  element: HTMLElement,
  cache = new WeakMap<Element, boolean>(),
): boolean {
  if (element instanceof HTMLInputElement && element.type === 'file') {
    const proxy = fileInputProxy(element);
    if (proxy) return hasVisibleSurface(proxy, cache);
  }
  for (const ancestor of composedAncestors(element)) {
    let visible = cache.get(ancestor);
    if (visible === undefined) {
      const style = getComputedStyle(ancestor);
      visible =
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.visibility !== 'collapse' &&
        (parseFloat(style.opacity) !== 0 ||
          (ancestor === element && element instanceof HTMLInputElement && element.type === 'file'));
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

/** Find the nearest composed form, including a native control's form owner. */
export function controlForm(element: HTMLElement): Element | null {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
  )
    if (element.form) return element.form;
  const uploadForm = dropzoneSurface(element)?.closest('form,[role="form"]');
  if (uploadForm) return uploadForm;
  for (let current: Element | null = element; current; current = composedParent(current))
    if (current.matches('form,[role="form"]')) return current;
  return null;
}

/** about:blank/srcdoc controls inherit their embedding origin. */
export function fieldDomain(): string {
  if (location.hostname) return location.hostname;
  try {
    return new URL(location.ancestorOrigins?.[0] || document.referrer).hostname;
  } catch {
    return '';
  }
}
