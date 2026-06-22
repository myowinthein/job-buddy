const EXCLUDED_INPUT_TYPES = new Set([
  'hidden', 'submit', 'button', 'checkbox',
  'radio', 'file', 'image', 'reset',
]);

interface ScanOptions {
  // When true, visible `<input type="file">` elements are *not* filtered out.
  // The caller (executeAutofill) sets this only when the profile actually has a
  // CV file available, so file inputs never appear in pendingMatches otherwise.
  allowFileInputs?: boolean;
}

export function scanFields(options: ScanOptions = {}): HTMLElement[] {
  const elements = Array.from(
    document.querySelectorAll<HTMLElement>('input, textarea, select'),
  );

  return elements.filter((el) => {
    // Excluded input types (hidden, submit, button, etc.)
    if (el instanceof HTMLInputElement) {
      const type = el.type.toLowerCase();
      // 'file' is conditionally allowed; everything else in EXCLUDED stays excluded.
      if (type === 'file') {
        if (!options.allowFileInputs) return false;
        // Custom upload widgets (Fluent UI / Fabric, MUI, Mantine, etc.) render
        // a styled button as the user-facing surface and hide the real file
        // input behind it. They almost always set tabindex="-1" on the input
        // because keyboard focus is meant to live on the button wrapper, not
        // the input. A genuinely user-facing file input would not have this.
        // Skip in MVP — custom widgets are Phase 2.
        if (el.getAttribute('tabindex') === '-1') return false;
      } else if (EXCLUDED_INPUT_TYPES.has(type)) {
        return false;
      }
    }

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
