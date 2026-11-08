import { QUICK_FILL_CONTROL, QUICK_FILL_HOST } from './detect';

export const DETECTION_ATTRIBUTES = [
  'hidden',
  'aria-hidden',
  'class',
  'style',
  'disabled',
  'type',
  'role',
  'name',
  'id',
  'autocomplete',
  'aria-label',
  'placeholder',
  'for',
];
const SIGNAL_TEXT = 'label,h1,h2,h3,legend,title';
const CANDIDATE = `${QUICK_FILL_CONTROL},iframe,style,${SIGNAL_TEXT}`;
const visibilityStyles = (value: string | null) =>
  value?.match(/(?:^|;)\s*(?:display|visibility|content-visibility|all)\s*:[^;]*/gi)?.join(';') ??
  '';

/** Ignore decorative updates without losing new, hidden or relabelled forms. */
export function affectsApplicationDetection(
  records: MutationRecord[],
  roots: ReadonlySet<ShadowRoot>,
): boolean {
  const containsControls = (element: Element) =>
    element.matches(QUICK_FILL_CONTROL) ||
    !!element.querySelector(QUICK_FILL_CONTROL) ||
    [...roots].some((root) => element.contains(root.host));
  const candidateNode = (node: Node): boolean => {
    if (!(node instanceof Element)) return false;
    if (node.closest(`[${QUICK_FILL_HOST}]`)) return false;
    if (node.matches(CANDIDATE) || node.querySelector(CANDIDATE) || node.shadowRoot) return true;
    // Only inspect a newly added/removed branch for previously unknown shadow hosts.
    // Ordinary class/style changes never walk every element on the page.
    return [...node.querySelectorAll('*')].some((element) => !!element.shadowRoot);
  };
  return records.some((record) => {
    const target =
      record.target instanceof Element
        ? record.target
        : record.target instanceof ShadowRoot
          ? record.target.host
          : record.target.parentElement;
    if (!target || target.closest(`[${QUICK_FILL_HOST}]`)) return false;
    if (record.type === 'attributes') {
      if (record.attributeName === 'type' && target.matches('input')) return true;
      if (
        record.attributeName === 'role' &&
        /^(textbox|combobox|form)$/.test(record.oldValue ?? '')
      )
        return true;
      // Autofill tints and pointer movements change styles without changing eligibility.
      if (
        record.attributeName === 'style' &&
        visibilityStyles(record.oldValue) === visibilityStyles(target.getAttribute('style'))
      )
        return false;
      if (
        ['for', 'aria-label'].includes(record.attributeName ?? '') &&
        target.matches('label,form,[role="form"]')
      )
        return true;
      return containsControls(target);
    }
    if (target.closest(`${QUICK_FILL_CONTROL},style,${SIGNAL_TEXT}`)) return true;
    return [...record.addedNodes, ...record.removedNodes].some(candidateNode);
  });
}
