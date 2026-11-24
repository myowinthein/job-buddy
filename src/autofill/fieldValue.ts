import { telephoneCountry } from './phoneWidget';
import { dropzonePreviews } from './dropzone';
import { isTextEditor, isChoice, isChoiceChecked } from './dom';
import { isSkippableOption, normalize, PLACEHOLDER_OPTION_NORMS } from './normalizer';
import { searchableSelect } from './reactSelect';
import { menuSelect } from './menuSelect';

// Read answers rather than control labels or unchecked input submission values.
export function readFieldValue(element: HTMLElement): string {
  if (element instanceof HTMLButtonElement) {
    const phone = telephoneCountry(element);
    if (phone) return phone.code;
  }
  const menu = menuSelect(element);
  if (menu) return menu.value;
  const select = searchableSelect(element);
  if (select) return select.value;
  if (isChoice(element)) return isChoiceChecked(element) ? 'checked' : '';
  if (element instanceof HTMLInputElement) {
    if (element.type === 'file')
      return element.files?.length || dropzonePreviews(element).length ? 'selected file' : '';
    if (!(element.type === 'button' && (element.getAttribute('aria-haspopup') === 'listbox' || element.getAttribute('role') === 'combobox')))
      return element.value;
  }
  if (element instanceof HTMLTextAreaElement) return element.value;
  if (element instanceof HTMLSelectElement) {
    const option = element.options[element.selectedIndex];
    return option && !isSkippableOption(option) ? element.value : '';
  }
  if (isTextEditor(element)) {
    return (element.textContent ?? '').replace(/\u200b/g, '').trim();
  }
  const explicit =
    element.getAttribute('aria-valuetext') ?? element.dataset.selected ?? element.dataset.value;
  if (explicit != null) return explicit;
  if (element instanceof HTMLInputElement) return '';
  const text = element.textContent?.trim() ?? '';
  return PLACEHOLDER_OPTION_NORMS.has(normalize(text)) ? '' : text;
}
