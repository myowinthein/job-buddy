import { composedParent, controlForm, isChoice } from './dom';
import { ariaName, ownText } from './labels';
import { bestLabel } from './signals';
import { isConsentGroup } from './consent';
import { menuSelect } from './menuSelect';
import type { FieldSignals } from './signals';

/** Match layers a post-pass may rewrite: label-derived ones, never learned or autocomplete. */
export const ADJUSTABLE_LAYERS: ReadonlySet<string> = new Set([
  'dictionary_exact',
  'fuzzy',
  'context',
]);

export function visibleQuestion(signals: FieldSignals): string {
  return [signals.label, signals.ariaLabel, signals.placeholder].filter(Boolean).join(' ');
}

/** A related profile passage is not an answer to a request for a personal explanation. */
export function narrativeQuestion(text: string): boolean {
  return /\b(?:describe|explain|elaborate|walk\s+(?:us|me)\s+through)\b|\b(?:give|provide|share)\s+(?:us\s+)?(?:an?\s+)?(?:specific\s+)?example\b|\btell\s+us\s+about\b|\bhow\s+(?:would|did|do)\s+you\b|\bwhy\s+(?:do|did|would|are|have)\s+you\b|\bwhat\s+(?:attracts?|attracted|motivates?|motivated|interests?|interested)\s+you\b/i.test(text);
}

/** Questions about someone else or data the profile cannot represent stay manual. */
export function ruleQuestionBlocked(signals: FieldSignals): boolean {
  const text = visibleQuestion(signals);
  const selection =
    (typeof HTMLSelectElement !== 'undefined' && signals.element instanceof HTMLSelectElement) ||
    signals.element?.getAttribute('role') === 'combobox' ||
    signals.element?.getAttribute('aria-haspopup') === 'listbox' || !!(signals.element && menuSelect(signals.element));
  return (
    (!selection &&
      signals.type !== 'file' &&
      !(signals.element && isChoice(signals.element)) &&
      narrativeQuestion(signals.label || signals.ariaLabel || signals.placeholder || '')) ||
    (selection &&
      isConsentGroup({ groupLabel: `${text} ${signals.nearbyText ?? ''}`, options: [] })) ||
    /\b(emergency\s+contact|referee|referrer|spouse|next\s+of\s+kin|reference(?:'s)?\s+(?:name|email|phone)|manager(?:'s)?\s+(?:name|email|phone))\b/i.test(
      text,
    ) ||
    /\b(nationality|country\s+of\s+(?:origin|birth)|citizenship|employment\s+type)\b/i.test(text) ||
    (signals.type === 'file' &&
      /\b(work\s+permit|passport|identity|identification|certificates?|transcripts?|licenses?|licences?)\b/i.test(
        `${text} ${signals.nearbyText ?? ''}`,
      ))
  );
}

export function scopeRoot(element: HTMLElement): Node {
  return controlForm(element) ?? element.ownerDocument;
}

export function containsControl(container: Element, element: HTMLElement): boolean {
  for (let current: Element | null = element; current; current = composedParent(current))
    if (current === container) return true;
  return false;
}

/** Prefer the smallest structural entry containing exactly one repeated anchor. */
export function entryIndex(
  element: HTMLElement,
  anchors: HTMLElement[],
  order: HTMLElement[] = [],
): number {
  const exact = anchors.indexOf(element);
  if (exact >= 0) return exact;
  for (let container = composedParent(element); container; container = composedParent(container)) {
    const indices = anchors.flatMap((anchor, i) => (containsControl(container, anchor) ? [i] : []));
    if (indices.length === 1) return indices[0];
    if (indices.length > 1) break;
  }
  let preceding = 0;
  anchors.forEach((anchor, i) => {
    if (
      anchor === element ||
      (order.length
        ? order.indexOf(anchor) <= order.indexOf(element)
        : anchor.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING)
    )
      preceding = i;
  });
  return preceding;
}

export function sectionFamily(element: HTMLElement): 'education' | 'workHistory' | undefined {
  if (typeof element?.getRootNode !== 'function') return undefined;
  for (let container = composedParent(element); container; container = composedParent(container)) {
    const legend = container.querySelector(
      ':scope > legend,:scope > h1,:scope > h2,:scope > h3,:scope > h4',
    );
    const lists = container.querySelectorAll(':scope > ul,:scope > ol,:scope > [role="list"]');
    const list = lists.length === 1 && containsControl(lists[0], element) ? lists[0] : null;
    const listHeading = list
      ? [...container.children]
          .filter(
            (child) =>
              child !== list &&
              !child.querySelector('input,select,textarea,[role="combobox"],[role="textbox"]'),
          )
          .map((child) => ownText(child))
          .find((text) =>
            /^(?:education|academic history|employment|work experience|experience|work history)(?:\s*\(optional\))?$/i.test(
              text,
            ),
          )
      : '';
    const text = `${ariaName(container)} ${legend ? ownText(legend) : ''} ${listHeading ?? ''}`;
    const education = /\b(education|school|university|college|academic)\b/i.test(text);
    const work =
      !/\b(application|apply|authorization|eligibility|permit|visa)\b/i.test(text) &&
      /\b(work|employment|experience|job)\b/i.test(text);
    if (education !== work) return education ? 'education' : 'workHistory';
    if (container.matches('form')) break;
  }
  return undefined;
}

export function questionText(signals: FieldSignals): string {
  return `${bestLabel(signals)} ${signals.nearbyText ?? ''}`;
}
