import { composedParent } from './dom';
import { ariaName, ownText } from './labels';
import { controlForm, bestLabel } from './signals';
import type { FieldSignals } from './signals';

/** Match layers a post-pass may rewrite: label-derived ones, never learned or autocomplete. */
export const ADJUSTABLE_LAYERS: ReadonlySet<string> = new Set(['dictionary_exact', 'fuzzy', 'context']);

export function visibleQuestion(signals: FieldSignals): string {
  return [signals.label, signals.ariaLabel, signals.placeholder].filter(Boolean).join(' ');
}

/** Questions about someone else or data the profile cannot represent stay manual. */
export function ruleQuestionBlocked(signals: FieldSignals): boolean {
  const text = visibleQuestion(signals);
  return (
    /\b(emergency\s+contact|referee|referrer|spouse|next\s+of\s+kin|reference(?:'s)?\s+(?:name|email|phone)|manager(?:'s)?\s+(?:name|email|phone))\b/i.test(
      text,
    ) ||
    /\b(nationality|country\s+of\s+(?:origin|birth)|citizenship|employment\s+type)\b/i.test(text) ||
    (signals.type === 'file' &&
      /\b(work\s+permit|passport|identity|identification|certificate|transcript|cover\s+letter|license|licence)\b/i.test(
        text,
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
    const text = `${ariaName(container)} ${legend ? ownText(legend) : ''}`;
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

/** about:blank/srcdoc controls inherit their embedding origin. */
export function fieldDomain(): string {
  if (location.hostname) return location.hostname;
  try {
    return new URL(location.ancestorOrigins?.[0] || document.referrer).hostname;
  } catch {
    return '';
  }
}
