/** Collect visible controls in their natural keyboard order. */
export function getTabbableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], summary, input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
    ),
  ).filter((element) => {
    if (element.tabIndex < 0 || element.matches(':disabled')) return false;
    for (
      let ancestor: HTMLElement | null = element;
      ancestor && ancestor !== root;
      ancestor = ancestor.parentElement
    ) {
      const style = getComputedStyle(ancestor);
      if (
        ancestor.hidden ||
        ancestor.hasAttribute('inert') ||
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.visibility === 'collapse'
      )
        return false;
      if (
        ancestor instanceof HTMLDetailsElement &&
        !ancestor.open &&
        !ancestor.querySelector('summary')?.contains(element)
      )
        return false;
    }
    return true;
  });
}
