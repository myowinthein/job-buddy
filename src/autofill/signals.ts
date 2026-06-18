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
  return {
    element,
    type:         inp.type        ?? element.tagName.toLowerCase(),
    name:         inp.name        ?? '',
    id:           element.id      ?? '',
    placeholder:  inp.placeholder ?? '',
    autocomplete: inp.autocomplete ?? '',
    ariaLabel:    element.getAttribute('aria-label') ?? '',
    label:        getLabelText(element),
    nearbyText:   getNearbyText(element),
  };
}
