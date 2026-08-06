export interface FieldSignals {
  element:      HTMLElement;
  type:         string;
  name:         string;
  id:           string;
  placeholder:  string;
  autocomplete: string;
  ariaLabel:    string;
  label:        string;
  nearbyText:   string;
}

const WRAPPER_SELECTORS =
  '.form-field, .form-group, .field, .input-wrapper, .form-item';

// Resolves space-separated element IDs from aria-labelledby / aria-describedby
// into their visible text content, joined by a space.
function resolveAriaRef(attr: string | null): string {
  if (!attr) return '';
  return attr.split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
    .filter(Boolean)
    .join(' ');
}

// A <label> (or nearby-text wrapper) that wraps its own control — e.g.
// <label>Phone Code<select>…200 country options…</select></label>, a common
// accessible-forms pattern — has that control's entire rendered content
// (every <option>, for a <select>) inside its own textContent, which would
// otherwise swamp a few words of real prose with hundreds of concatenated
// option strings. Strip nested form controls before reading text so the
// result is just the label's own words.
function ownText(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll('input, select, textarea, button').forEach((n) => n.remove());
  return clone.textContent?.trim() ?? '';
}

function getLabelText(element: HTMLElement): string {
  // 1. <label for="id">
  if (element.id) {
    try {
      const linked = document.querySelector<HTMLLabelElement>(
        `label[for="${CSS.escape(element.id)}"]`,
      );
      if (linked) return ownText(linked);
    } catch { /* invalid selector — skip */ }
  }

  // 2. element.closest('label')
  const parentLabel = element.closest('label');
  if (parentLabel) return ownText(parentLabel);

  return '';
}

function getNearbyText(element: HTMLElement): string {
  const wrapper = element.closest(WRAPPER_SELECTORS);
  if (!wrapper) return '';
  const textEl = wrapper.querySelector('label, span, p');
  return textEl ? ownText(textEl) : '';
}

// Picks the first non-empty human-readable label from a FieldSignals object:
// label → ariaLabel → placeholder → name. Returns '' if all are empty so the
// caller can chain `|| fallback` for further fallbacks (id, 'this field', etc.).
export function bestLabel(signals: FieldSignals): string {
  return signals.label || signals.ariaLabel || signals.placeholder || signals.name || '';
}

// Display-only label for UI surfaces like the Learned Mappings page — extends
// bestLabel with nearbyText as a last resort, for custom-question fields that
// have visible descriptive text but no proper label/ariaLabel/placeholder/name
// (only an auto-generated id, e.g. some ATS "Question 3" fields). nearbyText
// is never used for actual field matching (mapper.ts's Layer 0 only reads
// label/ariaLabel/placeholder/name/id), so this has no effect on autofill
// behavior. Capped in length to avoid storing an entire paragraph.
export function displayLabel(signals: FieldSignals): string | undefined {
  const label = (bestLabel(signals) || signals.nearbyText || '').trim();
  return label ? label.slice(0, 120) : undefined;
}

export function extractSignals(element: HTMLElement): FieldSignals {
  const inp = element as HTMLInputElement;
  const isNative = element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT';

  // For ARIA custom components, derive the semantic type from the role attribute
  // rather than the HTML tag (which would be 'div', 'span', etc.).
  let type: string;
  if (isNative) {
    type = inp.type ?? element.tagName.toLowerCase();
  } else {
    const role = element.getAttribute('role');
    type = role ?? (element.hasAttribute('contenteditable') ? 'textbox' : element.tagName.toLowerCase());
  }

  // aria-label: prefer explicit attribute, resolve aria-labelledby as fallback.
  const explicitAriaLabel = element.getAttribute('aria-label') ?? '';
  const labelledByText    = resolveAriaRef(element.getAttribute('aria-labelledby'));
  const ariaLabel         = explicitAriaLabel || labelledByText;

  // placeholder: native attribute first, then ARIA attribute.
  const placeholder = inp.placeholder || element.getAttribute('aria-placeholder') || '';

  // autocomplete: native attribute, then generic attribute (some frameworks use it on divs).
  const autocomplete = inp.autocomplete || element.getAttribute('autocomplete') || '';

  return {
    element,
    type,
    name:         inp.name ?? '',
    id:           element.id ?? '',
    placeholder,
    autocomplete,
    ariaLabel,
    label:        getLabelText(element),
    nearbyText:   getNearbyText(element),
  };
}
