/** A searchable select's input is its query editor, not its committed answer. */
export interface SearchableSelect {
  control: HTMLElement;
  value: string;
  trigger?: HTMLElement;
}
const part = (element: Element, suffix: string) =>
  [...element.classList].some((name) => name.endsWith(`__${suffix}`));

/** Older React Select versions link a menu by ID but omit ARIA option roles. */
export function searchableSelectOptions(element: HTMLElement, menu: Element): HTMLElement[] | null {
  const select = searchableSelect(element);
  if (!select || select.trigger) return null;
  return [...menu.querySelectorAll<HTMLElement>('[role="option"],[class*="__option"]')].filter(
    (option) => option.getAttribute('role') === 'option' || part(option, 'option'),
  );
}

export function searchableSelect(element: HTMLElement): SearchableSelect | null {
  if (!(element instanceof HTMLInputElement)) return null;
  // Some component libraries declare searchability without ARIA roles. Require
  // both a separate committed-value surface and exactly one query editor.
  const widget = element.closest<HTMLElement>('[data-searchable="true"]');
  if (widget && widget.querySelectorAll('input,select,textarea').length === 1) {
    const trigger = widget.querySelector<HTMLElement>('.trigger');
    const values = trigger?.querySelectorAll<HTMLElement>('.value');
    if (trigger && values?.length === 1)
      return {
        control: widget,
        trigger,
        value: values[0].classList.contains('placeholder')
          ? ''
          : (values[0].textContent?.trim() ?? ''),
      };
  }
  if (element.getAttribute('role') !== 'combobox') return null;
  let container = element.parentElement;
  for (let depth = 0; container && depth < 3; depth++, container = container.parentElement) {
    if (!part(container, 'value-container')) continue;
    const control = container.parentElement;
    if (!control || !part(control, 'control')) return null;
    const editors = control.querySelectorAll(
      'input:not([type="hidden"]),select,textarea,[role="combobox"],[role="textbox"]',
    );
    if (editors.length !== 1 || editors[0] !== element) return null;
    const values = [...container.children].filter((child) => part(child, 'single-value'));
    if (values.length > 1 || container.querySelector('[class*="__multi-value"]')) return null;
    return { control, value: values[0]?.textContent?.trim() ?? '' };
  }
  return null;
}
