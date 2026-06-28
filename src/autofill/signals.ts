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

function getLabelText(element: HTMLElement): string {
  // 1. <label for="id">
  if (element.id) {
    try {
      const linked = document.querySelector<HTMLLabelElement>(
        `label[for="${CSS.escape(element.id)}"]`,
      );
      if (linked) return linked.textContent?.trim() ?? '';
    } catch { /* invalid selector — skip */ }
  }

  // 2. element.closest('label')
  const parentLabel = element.closest('label');
  if (parentLabel) return parentLabel.textContent?.trim() ?? '';

  return '';
}

function getNearbyText(element: HTMLElement): string {
  const wrapper = element.closest(WRAPPER_SELECTORS);
  if (!wrapper) return '';
  const textEl = wrapper.querySelector('label, span, p');
  return textEl?.textContent?.trim() ?? '';
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
