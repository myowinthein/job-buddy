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

// ── Radio / checkbox scanning ─────────────────────────────────────────────────

function isVisibleInput(el: HTMLElement): boolean {
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
    .filter((el) => !!el.name && isVisibleInput(el));

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
    .filter((el) => isVisibleInput(el));

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
