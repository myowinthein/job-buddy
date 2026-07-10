const EXCLUDED_INPUT_TYPES = new Set([
  'hidden', 'submit', 'button', 'checkbox',
  'radio', 'file', 'image', 'reset',
]);

// Native HTML tags that are already handled by the native scanner —
// ARIA scanner excludes elements whose tag is in this set to avoid duplicates.
const NATIVE_FORM_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

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

      // ARIA override: an input with aria-haspopup="listbox" acts as a custom
      // select trigger regardless of its type (e.g. Revolut uses
      // <input type="button" aria-haspopup="listbox"> for the phone calling-code
      // picker). Let it through before the type exclusion check.
      if (el.getAttribute('aria-haspopup') === 'listbox') {
        // fall through to the remaining visibility checks below
      } else if (type === 'file') {
        // 'file' is conditionally allowed; everything else in EXCLUDED stays excluded.
        if (!options.allowFileInputs) return false;
        // Custom upload widgets (Fluent UI / Fabric, MUI, Mantine, etc.) render
        // a styled button as the user-facing surface and hide the real file
        // input behind it. They almost always set tabindex="-1" on the input
        // because keyboard focus is meant to live on the button wrapper, not
        // the input. A genuinely user-facing file input would not have this.
        if (el.getAttribute('tabindex') === '-1') return false;
      } else if (EXCLUDED_INPUT_TYPES.has(type)) {
        return false;
      }
    }

    // Skip inputs that live inside a non-native [role="combobox"] container.
    // The outer combobox element is scanned separately by scanAriaFields() and
    // receives click-based filling. Letting the inner search input through would
    // result in a text fill that doesn't actually select an option.
    if (el instanceof HTMLInputElement) {
      const ancestor = el.closest('[role="combobox"]');
      if (ancestor && !NATIVE_FORM_TAGS.has(ancestor.tagName)) return false;
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

// ── Radio / checkbox scanning ─────────────────────────────────────────────────

// Does not handle aria-disabled — that is an ARIA-only concern added by isAriaVisible.
function isElementVisible(el: HTMLElement): boolean {
  if ((el as HTMLInputElement).disabled) return false;
  if (el.closest('[hidden]') !== null) return false;
  if (el.closest('[aria-hidden="true"]') !== null) return false;
  if (el.offsetParent === null) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  if (parseFloat(style.opacity) === 0) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function getOptionLabel(el: HTMLInputElement): string {
  if (el.id) {
    try {
      const linked = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(el.id)}"]`);
      if (linked) {
        const clone = linked.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('input').forEach((i) => i.remove());
        return clone.textContent?.trim() ?? '';
      }
    } catch { /* skip */ }
  }
  const parentLabel = el.closest('label');
  if (parentLabel) {
    const clone = parentLabel.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('input').forEach((i) => i.remove());
    return clone.textContent?.trim() ?? '';
  }
  return el.value || '';
}

function getGroupLegend(el: HTMLElement): string {
  const fieldset = el.closest('fieldset');
  if (fieldset) {
    const legend = fieldset.querySelector(':scope > legend');
    if (legend) return legend.textContent?.trim() ?? '';
  }
  return '';
}

const CONSENT_TERMS = ['agree', 'terms', 'privacy', 'gdpr', 'consent', 'marketing'];

function isConsentText(text: string): boolean {
  const lower = text.toLowerCase();
  return CONSENT_TERMS.some((t) => lower.includes(t));
}

export interface RadioOption {
  element: HTMLInputElement;
  label:   string;
  value:   string;
}

export interface RadioGroup {
  name:       string;
  groupLabel: string;
  options:    RadioOption[];
}

export interface CheckboxOption {
  element: HTMLInputElement;
  label:   string;
  value:   string;
}

export interface CheckboxGroup {
  name:       string;
  groupLabel: string;
  isConsent:  boolean;
  options:    CheckboxOption[];
}

export function scanRadioGroups(): RadioGroup[] {
  const all = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="radio"]'))
    .filter((el) => !!el.name && isElementVisible(el));

  const byName = new Map<string, HTMLInputElement[]>();
  for (const el of all) {
    const arr = byName.get(el.name) ?? [];
    arr.push(el);
    byName.set(el.name, arr);
  }

  const groups: RadioGroup[] = [];
  for (const [name, els] of byName) {
    if (els.length < 2) continue;
    const options = els.map((el) => ({ element: el, label: getOptionLabel(el), value: el.value }));
    const groupLabel = getGroupLegend(els[0]) || name;
    groups.push({ name, groupLabel, options });
  }
  return groups;
}

export function scanCheckboxGroups(): CheckboxGroup[] {
  const all = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
    .filter((el) => isElementVisible(el));

  const byName = new Map<string, HTMLInputElement[]>();
  let anonCount = 0;
  for (const el of all) {
    const key = el.name || `__cb_anon_${anonCount++}`;
    const arr = byName.get(key) ?? [];
    arr.push(el);
    byName.set(key, arr);
  }

  const groups: CheckboxGroup[] = [];
  for (const [, els] of byName) {
    const options = els.map((el) => ({ element: el, label: getOptionLabel(el), value: el.value }));
    const groupLabel = getGroupLegend(els[0]) || (els[0].name ?? '');
    const isConsent = isConsentText(groupLabel) || options.some((o) => isConsentText(o.label));
    groups.push({ name: els[0].name ?? '', groupLabel, isConsent, options });
  }
  return groups;
}

// ── ARIA / custom-component scanning ─────────────────────────────────────────
//
// Covers four common patterns used by modern React/Vue job portals:
//   aria-haspopup="listbox" — trigger button for a custom dropdown/select
//   role="combobox"         — searchable select wrapper (e.g. React-Select outer div)
//   role="textbox"          — non-native editable region
//   contenteditable="true"  — free-edit div/span used as text input

function isAriaVisible(el: HTMLElement): boolean {
  if (el.getAttribute('aria-disabled') === 'true') return false;
  return isElementVisible(el);
}

/** Returns 'text' for custom text fields, 'select' for custom dropdowns, null otherwise. */
export function getAriaElementType(el: HTMLElement): 'text' | 'select' | null {
  const role = el.getAttribute('role');
  if (role === 'textbox' || el.getAttribute('contenteditable') === 'true') return 'text';
  if (role === 'combobox' || el.getAttribute('aria-haspopup') === 'listbox') return 'select';
  return null;
}

/**
 * Scans the page for visible ARIA custom form components that are NOT native
 * input/textarea/select elements. Returns them in document order, deduplicated.
 *
 * These elements go through the same signal extraction and mapping pipeline as
 * native fields. Only the fill phase differs (click-based for listbox/combobox,
 * textContent-based for textbox/contenteditable).
 */
export function scanAriaFields(): HTMLElement[] {
  const results: HTMLElement[] = [];
  const seen = new Set<Element>();

  function addIfEligible(el: HTMLElement): void {
    if (seen.has(el)) return;
    if (NATIVE_FORM_TAGS.has(el.tagName)) return; // handled by native scanner
    if (!isAriaVisible(el)) return;
    seen.add(el);
    results.push(el);
  }

  // Text-input equivalents
  document.querySelectorAll<HTMLElement>('[role="textbox"]').forEach(addIfEligible);
  document.querySelectorAll<HTMLElement>('[contenteditable="true"]').forEach(addIfEligible);

  // Select/dropdown equivalents
  document.querySelectorAll<HTMLElement>('[aria-haspopup="listbox"]').forEach(addIfEligible);
  document.querySelectorAll<HTMLElement>('[role="combobox"]').forEach(addIfEligible);

  return results;
}
