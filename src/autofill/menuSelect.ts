import { normalize, PLACEHOLDER_OPTION_NORMS } from './normalizer';

/** A visible menu button backed by one hidden, read-only native select. */
export function menuSelect(element: HTMLElement): {
  select: HTMLSelectElement;
  label: string;
  menuId: string;
  value: string;
} | null {
  if (
    !(element instanceof HTMLButtonElement) ||
    element.type !== 'button' ||
    element.getAttribute('aria-haspopup') !== 'true' ||
    !element.dataset.menuId
  )
    return null;
  for (
    let parent = element.parentElement, depth = 0;
    parent && depth < 3;
    parent = parent.parentElement, depth++
  ) {
    if (parent.matches('form,body')) break;
    const selects = parent.querySelectorAll('select');
    if (!selects.length) continue;
    const select = selects[0];
    if (
      selects.length !== 1 ||
      select.disabled ||
      !select.hasAttribute('readonly') ||
      select.getAttribute('aria-hidden') !== 'true' ||
      parent.querySelector('input,textarea') ||
      parent.querySelectorAll('button[data-menu-id]').length !== 1
    )
      return null;
    const label = [...select.labels]
      .map((item) => item.textContent ?? '')
      .join(' ')
      .replace(/\*/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!label) return null;
    const displayed = element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    return {
      select,
      label,
      menuId: element.dataset.menuId,
      value: select.value && !PLACEHOLDER_OPTION_NORMS.has(normalize(displayed)) ? displayed : '',
    };
  }
  return null;
}

export function selectMenu(element: HTMLElement): HTMLElement | null {
  const widget = menuSelect(element);
  if (!widget) return null;
  const root = element.getRootNode() as Document | ShadowRoot;
  const menu = root.getElementById(widget.menuId);
  return menu instanceof HTMLElement && menu.getAttribute('role') === 'menu' ? menu : null;
}

export function selectMenuSearch(element: HTMLElement): HTMLInputElement | null {
  const menu = selectMenu(element);
  const parent = menu?.parentElement;
  if (
    !menu ||
    !parent ||
    parent.matches('form,body') ||
    parent.querySelectorAll('[role="menu"]').length !== 1
  )
    return null;
  const inputs = parent.querySelectorAll<HTMLInputElement>('input:not([type="hidden"])');
  return inputs.length === 1 &&
    /^(?:search|filter)$/i.test(inputs[0].getAttribute('aria-label') ?? '')
    ? inputs[0]
    : null;
}
