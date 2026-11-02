import { isChoice, isChoiceChecked, isTextEditor } from './dom';
import { extractSignals } from './signals';
import { questionLabel } from './scanner';
import { sectionFamily } from './ruleContext';
import { readFieldValue } from './fieldValue';

export interface FieldState {
  value: string;
  selection?: string[];
  choices?: { element: HTMLElement; checked: boolean; indeterminate: boolean }[];
  options?: { option: HTMLOptionElement; selected: boolean }[];
  files?: File[];
  content?: Node[];
}

export function fieldIdentity(element: HTMLElement): string {
  const { type, name, id, label, ariaLabel, placeholder } = extractSignals(element);
  return JSON.stringify({
    type,
    name,
    // Controlled inputs can regenerate IDs on each render. A stable name and
    // accessible label still identify the question on the same DOM node.
    id: name && (label || ariaLabel) ? undefined : id,
    label,
    ariaLabel,
    placeholder,
    role: element.getAttribute('role'),
    question: questionLabel(element),
    section: sectionFamily(element),
  });
}

export function captureField(element: HTMLElement, content = false): FieldState {
  const state: FieldState = { value: readFieldValue(element) };
  if (
    element.getAttribute('role') === 'combobox' ||
    element.getAttribute('aria-haspopup') === 'listbox'
  )
    state.selection = [
      element.getAttribute('aria-valuetext') ?? '',
      element.dataset.selected ?? '',
      element.dataset.value ?? '',
    ];
  if (isChoice(element)) {
    let elements = [element];
    if (element instanceof HTMLInputElement && element.type === 'radio' && element.name) {
      elements = [
        ...(element.getRootNode() as Document | ShadowRoot).querySelectorAll<HTMLInputElement>(
          'input[type="radio"]',
        ),
      ].filter((other) => other.name === element.name && other.form === element.form);
    }
    if (
      !(element instanceof HTMLInputElement && element.type === 'radio') &&
      element.getAttribute('role') === 'radio'
    ) {
      const group = element.closest('[role="radiogroup"]');
      if (group)
        elements = [...group.querySelectorAll<HTMLElement>('[role="radio"]')].filter(
          (item) => item.closest('[role="radiogroup"]') === group,
        );
    }
    state.choices = elements.map((item) => ({
      element: item,
      checked: isChoiceChecked(item),
      indeterminate: item instanceof HTMLInputElement && item.indeterminate,
    }));
  } else if (element instanceof HTMLSelectElement) {
    state.options = [...element.options].map((option) => ({ option, selected: option.selected }));
  } else if (element instanceof HTMLInputElement && element.type === 'file') {
    state.files = Array.from(element.files ?? []);
  } else if (
    content &&
    isTextEditor(element) &&
    !(element instanceof HTMLInputElement) &&
    !(element instanceof HTMLTextAreaElement)
  ) {
    state.content = [...element.childNodes].map((node) => node.cloneNode(true));
  }
  return state;
}

export function sameFieldState(a: FieldState, b: FieldState): boolean {
  if (a.value !== b.value || JSON.stringify(a.selection) !== JSON.stringify(b.selection))
    return false;
  if (a.choices || b.choices)
    return (
      !!a.choices &&
      !!b.choices &&
      a.choices.length === b.choices.length &&
      a.choices.every(
        (item, i) =>
          item.element === b.choices![i].element &&
          item.checked === b.choices![i].checked &&
          item.indeterminate === b.choices![i].indeterminate,
      )
    );
  if (a.options || b.options)
    return (
      !!a.options &&
      !!b.options &&
      a.options.length === b.options.length &&
      a.options.every(
        (item, i) =>
          item.option === b.options![i].option && item.selected === b.options![i].selected,
      )
    );
  if (a.files || b.files)
    return (
      !!a.files &&
      !!b.files &&
      a.files.length === b.files.length &&
      a.files.every(
        (file, i) =>
          file.name === b.files![i].name &&
          file.size === b.files![i].size &&
          file.type === b.files![i].type &&
          file.lastModified === b.files![i].lastModified,
      )
    );
  return true;
}
