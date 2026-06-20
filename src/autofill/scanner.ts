const EXCLUDED_INPUT_TYPES = new Set([
  'hidden', 'submit', 'button', 'checkbox',
  'radio', 'file', 'image', 'reset',
]);

export function scanFields(): HTMLElement[] {
  const elements = Array.from(
    document.querySelectorAll<HTMLElement>('input, textarea, select'),
  );

  return elements.filter((el) => {
    // Excluded input types (hidden, submit, button, etc.)
    if (
      el instanceof HTMLInputElement &&
      EXCLUDED_INPUT_TYPES.has(el.type.toLowerCase())
    ) return false;

    // Disabled or read-only — not user-editable
    if ((el as HTMLInputElement).disabled) return false;
    if ('readOnly' in el && (el as HTMLInputElement | HTMLTextAreaElement).readOnly) return false;

    // hidden attribute on self or any ancestor
    if (el.closest('[hidden]') !== null) return false;

    // aria-hidden="true" on self or any ancestor
    if (el.closest('[aria-hidden="true"]') !== null) return false;

    // offsetParent is null for display:none elements and their descendants
    if (el.offsetParent === null) return false;

    const style = window.getComputedStyle(el);
    if (style.display === 'none') return false;
    if (style.visibility === 'hidden') return false;
    if (parseFloat(style.opacity) === 0) return false;

    // Zero-size elements are not visible to users
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;

    return true;
  });
}
