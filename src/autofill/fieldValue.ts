import { isSkippableOption, normalize, PLACEHOLDER_OPTION_NORMS } from './normalizer';

// Read answers rather than control labels or unchecked input submission values.
export function readFieldValue(element: HTMLElement): string {
  if (element instanceof HTMLInputElement) {
    if (element.type === 'checkbox' || element.type === 'radio')
      return element.checked ? 'checked' : '';
    if (element.type === 'file') return element.files?.length ? 'selected file' : '';
    if (!(element.type === 'button' && element.getAttribute('aria-haspopup') === 'listbox'))
      return element.value;
  }
  if (element instanceof HTMLTextAreaElement) return element.value;
  if (element instanceof HTMLSelectElement) {
    const option = element.selectedOptions[0];
    return option && !isSkippableOption(option) ? element.value : '';
  }
  if (
    element.getAttribute('role') === 'textbox' ||
    element.getAttribute('contenteditable') === 'true'
  ) {
    return (element.textContent ?? '').replace(/\u200b/g, '').trim();
  }
  const explicit =
    element.getAttribute('aria-valuetext') ?? element.dataset.selected ?? element.dataset.value;
  if (explicit != null) return explicit;
  if (element instanceof HTMLInputElement) return '';
  const text = element.textContent?.trim() ?? '';
  return PLACEHOLDER_OPTION_NORMS.has(normalize(text)) ? '' : text;
}
