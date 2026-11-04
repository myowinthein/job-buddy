import { isConsentGroup } from './consent';
import {
  composedAncestors,
  composedParent,
  hasVisibleSurface,
  isChoiceAvailable,
  isControlAvailable,
  isTextEditor,
} from './dom';
import { controlName, createLabelContext, ownText } from './labels';
import type { LabelContext } from './labels';
import { controlForm, createSignalReader, bestLabel } from './signals';
import type { FieldSignals } from './signals';

export type ChoiceElement = HTMLElement & { checked?: boolean; value?: string };
export interface RadioOption {
  element: ChoiceElement;
  label: string;
  value: string;
}
export type CheckboxOption = RadioOption;
interface QuestionScope {
  question?: Element;
  form?: Element | null;
  root?: Node;
}
export interface RadioGroup extends QuestionScope {
  isConsent?: boolean;
  name: string;
  groupLabel: string;
  options: RadioOption[];
}
export interface CheckboxGroup extends RadioGroup {
  isConsent: boolean;
}
export interface ScanOptions {
  allowFileInputs?: boolean;
  scopeApplication?: boolean;
}
export interface FormScan {
  fields: HTMLElement[];
  radioGroups: RadioGroup[];
  checkboxGroups: CheckboxGroup[];
  signals: (element: HTMLElement) => FieldSignals;
}

const INPUT_TYPES = new Set([
  'text',
  'email',
  'tel',
  'url',
  'number',
  'date',
  'month',
  'datetime-local',
  'time',
  'week',
]);
const CAREER =
  /\b(resum[eé]|cv|curriculum vitae|cover letter|work authori[sz]ation|employment|job application|apply for|candidate|linkedin|salary|portfolio|education|work history)\b/i;
const AUXILIARY =
  /\b(newsletter|subscrib(?:e|ing)|sign[ -]?in|log[ -]?in|search|contact us|feedback)\b/i;

// One discovery pass, interleaving open shadow roots and assigned slots at their
// host/slot positions. A snapshot never survives a separate scan invocation.
function collectElements(root: ParentNode = document): HTMLElement[] {
  const elements: HTMLElement[] = [];
  const seen = new Set<Element>();
  const excluded = new WeakMap<Element, boolean>();
  const isOwned = (element: Element): boolean => {
    const cached = excluded.get(element);
    if (cached !== undefined) return cached;
    const parent = composedParent(element);
    const owned = element.hasAttribute('data-job-buddy-ui') || !!(parent && isOwned(parent));
    excluded.set(element, owned);
    return owned;
  };
  const stack: Iterator<Element>[] = [root.querySelectorAll('*').values()];
  while (stack.length) {
    const next = stack.at(-1)!.next();
    if (next.done) {
      stack.pop();
      continue;
    }
    const element = next.value;
    if (seen.has(element)) continue;
    seen.add(element);
    if (isOwned(element)) continue;
    if (element instanceof HTMLElement) elements.push(element);
    if (element.shadowRoot) stack.push(element.shadowRoot.querySelectorAll('*').values());
    if (element instanceof HTMLSlotElement) {
      const assigned = element.assignedElements({ flatten: true });
      if (assigned.length)
        stack.push(assigned.flatMap((node) => [node, ...node.querySelectorAll('*')]).values());
    }
  }
  return elements;
}

function insideWidget(element: HTMLElement): boolean {
  for (let parent = composedParent(element); parent; parent = composedParent(parent)) {
    if (!(parent instanceof HTMLElement)) continue;
    if (
      parent.getAttribute('role') === 'combobox' ||
      isTextEditor(parent) ||
      parent.matches('[role="radio"],[role="checkbox"]')
    )
      return true;
  }
  return false;
}

export function getAriaElementType(element: HTMLElement): 'text' | 'select' | null {
  if (isTextEditor(element)) return 'text';
  return element.getAttribute('role') === 'combobox' ||
    element.getAttribute('aria-haspopup') === 'listbox'
    ? 'select'
    : null;
}

function textControl(element: HTMLElement, options: ScanOptions): boolean {
  if (element instanceof HTMLInputElement) {
    if (element.type === 'file') return !!options.allowFileInputs && element.tabIndex !== -1;
    if (INPUT_TYPES.has(element.type)) return true;
    return ['button', 'search'].includes(element.type) && getAriaElementType(element) === 'select';
  }
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return true;
  return getAriaElementType(element) !== null;
}

function choiceKind(element: HTMLElement): 'radio' | 'checkbox' | null {
  if (element instanceof HTMLInputElement && ['radio', 'checkbox'].includes(element.type))
    return element.type as 'radio' | 'checkbox';
  return element.matches('[role="radio"],[role="checkbox"]')
    ? (element.getAttribute('role') as 'radio' | 'checkbox')
    : null;
}

function questionContainer(element: HTMLElement): Element | undefined {
  for (const ancestor of composedAncestors(element)) {
    if (ancestor !== element && ancestor.matches('fieldset,[role="radiogroup"],[role="group"]'))
      return ancestor;
  }
  return undefined;
}

export function questionLabel(element: HTMLElement, context?: LabelContext): string {
  const question = questionContainer(element);
  if (!question) {
    if (!choiceKind(element)) return '';
    // Many builders use a paragraph followed by option labels, without a fieldset.
    // Read the closest preceding prompt, never another control's label or a form title.
    let branch: Element = element;
    for (let parent = composedParent(branch); parent; branch = parent, parent = composedParent(parent)) {
      for (let sibling = branch.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
        const controls = [sibling, ...sibling.querySelectorAll('input,select,textarea,[role="radio"],[role="checkbox"],[role="combobox"]')]
          .filter(node => node.matches('input,select,textarea,[role="radio"],[role="checkbox"],[role="combobox"]'));
        if (controls.length) {
          if (controls.every(node => node instanceof HTMLElement && controlForm(node) === controlForm(element) && choiceKind(node) === choiceKind(element) &&
            node.getAttribute('name') === element.getAttribute('name'))) continue;
          return '';
        }
        if (sibling.matches('p,label,legend,span,div,h3,h4,h5,h6')) {
          const text = ownText(sibling, context).trim();
          if (text && text.length <= 500) return text;
        }
      }
      if (parent === controlForm(element) || parent === element.ownerDocument.body) break;
    }
    return '';
  }
  if (question instanceof HTMLFieldSetElement) {
    const legend = question.querySelector(':scope > legend');
    if (legend) return ownText(legend, context);
  }
  return controlName(question as HTMLElement, context);
}

function optionLabel(element: HTMLElement, context?: LabelContext): string {
  return (
    controlName(element, context) ||
    (element instanceof HTMLInputElement ? element.value : ownText(element, context))
  );
}

function scopedControls(
  elements: HTMLElement[],
  signals: FormScan['signals'],
  context: LabelContext,
): Set<HTMLElement> {
  const forms = new Map<
    Element,
    { elements: HTMLElement[]; career: boolean; auxiliary: boolean }
  >();
  for (const element of elements) {
    const form = controlForm(element);
    if (!form) continue;
    let data = forms.get(form);
    if (!data) forms.set(form, (data = { elements: [], career: false, auxiliary: false }));
    data.elements.push(element);
  }
  for (const [form, data] of forms) {
    const heading = form.querySelector('h1,h2,h3,legend');
    const title = [
      controlName(form as HTMLElement, context),
      heading ? ownText(heading, context) : '',
      form.id,
      form.getAttribute('name') ?? '',
      form.querySelector('button[type="submit"],input[type="submit"]')?.textContent ?? '',
    ].join(' ');
    const clues = data.elements
      .map((element) => {
        const s = signals(element);
        return [bestLabel(s), s.name, s.autocomplete, questionLabel(element, context)].join(' ');
      })
      .join(' ');
    data.career = CAREER.test(`${title} ${clues}`);
    data.auxiliary =
      AUXILIARY.test(title) ||
      data.elements.some((element) => element.closest('[role="search"],nav,footer'));
  }
  const hasApplication = [...forms.values()].some((form) => form.career);
  return new Set(
    elements.filter((element) => {
      const form = controlForm(element);
      if (form) {
        const data = forms.get(form)!;
        return data.career || (!hasApplication && !data.auxiliary);
      }
      const ancestors = [...composedAncestors(element)];
      const signal = signals(element);
      const locale = /\b(language|locale|translate)\b/i.test(
        [signal.label, signal.ariaLabel, signal.name, signal.id].join(' '),
      );
      if (locale && ancestors.some((ancestor) => ancestor.matches('header,[role="banner"]')) &&
          !ancestors.some((ancestor) => ancestor.matches('main,[role="main"]')))
        return false;
      // Formless application builders and shadow controls remain supported.
      return !ancestors.some((ancestor) =>
        ancestor.matches('nav,footer,[role="navigation"],[role="search"]'),
      );
    }),
  );
}

function groupChoices(
  elements: HTMLElement[],
  kind: 'radio' | 'checkbox',
  context: LabelContext,
): RadioGroup[] {
  const groups = new Map<string, RadioGroup>();
  const ids = new Map<Node, number>();
  const id = (node: Node) => {
    if (!ids.has(node)) ids.set(node, ids.size);
    return ids.get(node)!;
  };
  for (const element of elements) {
    const root = element.getRootNode(),
      form = controlForm(element),
      question = questionContainer(element);
    const name = element.getAttribute('name') ?? '';
    if (kind === 'radio' && !name && question?.getAttribute('role') !== 'radiogroup') continue;
    const key = `${id(root)}:${id(form ?? root)}:${id(question ?? form ?? root)}:${question && (kind === 'checkbox' || !name) ? 'question' : name ? `name:${name}` : `anonymous:${id(element)}`}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        name,
        groupLabel: questionLabel(element, context) || name,
        options: [],
        root,
        form,
        ...(question ? { question } : {}),
      };
      groups.set(key, group);
    }
    const label = optionLabel(element, context);
    group.options.push({
      element,
      label,
      value: element.getAttribute('value') || element.dataset.value || label,
    });
  }
  return [...groups.values()]
    .filter((group) => kind === 'checkbox' || group.options.length >= 2)
    .map((group) => ({ ...group, isConsent: isConsentGroup(group) }));
}

/** Recheck live labels/scope before acting on a saved group after an AI wait. */
export function isChoiceGroupAvailable(group: RadioGroup): boolean {
  return (
    group.options.length > 0 &&
    !group.isConsent &&
    !isConsentGroup(group) &&
    group.options.every(
      ({ element }) =>
        isChoiceAvailable(element) &&
        (!group.root || group.root === element.getRootNode()) &&
        (group.form === undefined || group.form === controlForm(element)) &&
        (!group.question || group.question === questionContainer(element)),
    ) &&
    !isConsentGroup({
      groupLabel: questionLabel(group.options[0].element) || group.groupLabel,
      options: group.options.map(({ element }) => ({ label: optionLabel(element) })),
    })
  );
}

export function scanForm(options: ScanOptions = {}): FormScan {
  const all = collectElements();
  const labels = createLabelContext(all);
  const signals = createSignalReader(all, labels);
  const surfaceCache = new WeakMap<Element, boolean>();
  const candidates = all.filter((element) => {
    const kind = choiceKind(element);
    if ((!textControl(element, options) && !kind) || insideWidget(element)) return false;
    return kind
      ? isChoiceAvailable(element)
      : isControlAvailable(element) && hasVisibleSurface(element, surfaceCache);
  });
  // File metadata can identify an application even if no saved CV can be filled.
  const evidence = all.filter(
    (element) =>
      element instanceof HTMLInputElement &&
      element.type === 'file' &&
      isControlAvailable(element) &&
      hasVisibleSurface(element, surfaceCache),
  );
  const scope = options.scopeApplication
    ? scopedControls([...candidates, ...evidence], signals, labels)
    : null;
  const fields: HTMLElement[] = [],
    radios: HTMLElement[] = [],
    checkboxes: HTMLElement[] = [];
  for (const element of candidates) {
    if (scope && !scope.has(element)) continue;
    const kind = choiceKind(element);
    if (kind) (kind === 'radio' ? radios : checkboxes).push(element);
    else fields.push(element);
  }
  return {
    fields,
    radioGroups: groupChoices(radios, 'radio', labels),
    checkboxGroups: groupChoices(checkboxes, 'checkbox', labels) as CheckboxGroup[],
    signals,
  };
}

// Compatibility entry points for independent callers. The autofill pipeline
// consumes scanForm once so discovery and label indexing are shared.
export function scanFields(options: ScanOptions = {}): HTMLElement[] {
  return scanForm(options).fields.filter((element) => element.matches('input,textarea,select'));
}
export function scanAriaFields(): HTMLElement[] {
  return scanForm().fields.filter((element) => !element.matches('input,textarea,select'));
}
export function scanRadioGroups(): RadioGroup[] {
  return scanForm().radioGroups;
}
export function scanCheckboxGroups(): CheckboxGroup[] {
  return scanForm().checkboxGroups;
}
