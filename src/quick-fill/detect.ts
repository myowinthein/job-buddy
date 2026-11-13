import { composedAncestors, controlForm } from '@/src/autofill/dom';
import { extractSignals } from '@/src/autofill/signals';

// Local discovery only. Never scans with Gemini or sends page text to the worker.
export const QUICK_FILL_HOST = 'data-job-buddy-ui';
const CAREER =
  /\b(resum[eé]|cv|curriculum vitae|cover letter|work authori[sz]ation|employment|job application|apply for|candidate|linkedin|salary|portfolio)\b/i;
const IDENTITY = /first.?name|full.?name|given.?name|your name|\bname\b/i;
const EMAIL = /email|e-mail/i;
export const QUICK_FILL_CONTROL =
  'input:not([type="hidden"]):not([type="submit"]):not([type="button"]),textarea,select,[role="textbox"],[role="combobox"]';

export function likelyApplicationForm(
  root: ParentNode = document,
  onRoot?: (root: ParentNode) => void,
): boolean {
  const controls: HTMLElement[] = [];
  const collect = (scope: ParentNode, depth: number) => {
    if (depth > 8 || controls.length >= 500) return;
    onRoot?.(scope);
    for (const el of scope.querySelectorAll<HTMLElement>(QUICK_FILL_CONTROL)) {
      if (controls.length >= 500) break;
      if (el.closest(`[${QUICK_FILL_HOST}]`) || el.hasAttribute('disabled')) continue;
      // Hidden upload controls often have the strongest resume signal.
      if (el.getClientRects().length || (el instanceof HTMLInputElement && el.type === 'file'))
        controls.push(el);
    }
    for (const el of scope.querySelectorAll<HTMLElement>('*')) {
      if (el.shadowRoot && !el.hasAttribute(QUICK_FILL_HOST)) collect(el.shadowRoot, depth + 1);
    }
  };
  collect(root, 0);
  // Keep unrelated contact, search and sign-in forms out of the page UI.
  const groups = new Map<ParentNode, HTMLElement[]>();
  for (const el of controls) {
    // Field components can each own a shadow root without owning a form. Share
    // their enclosing form/main, while keeping independent forms and standalone
    // shadow widgets separate. Never combine evidence from different frames.
    const group =
      controlForm(el) ??
      [...composedAncestors(el)].find((ancestor) => ancestor.matches('main,[role="main"]')) ??
      (el.getRootNode() as ParentNode);
    groups.set(group, [...(groups.get(group) ?? []), el]);
  }
  for (const [group, fields] of groups) {
    if (fields.length < 3) continue;
    const metadata = fields.map((el) => extractSignals(el));
    const signals = metadata.map(({ name, id, autocomplete, ariaLabel, placeholder, label }) =>
      [name, id, autocomplete, ariaLabel, placeholder, label].filter(Boolean).join(' '),
    );
    const heading =
      group instanceof Element
        ? `${group.getAttribute('aria-label') ?? ''} ${group.querySelector('h1,h2,h3,legend')?.textContent?.slice(0, 300) ?? ''}`
        : document.title;
    const mainTitle =
      group instanceof Element && group.matches('main,[role="main"]') ? document.title : '';
    if (
      signals.some((s) => IDENTITY.test(s)) &&
      signals.some((s) => EMAIL.test(s)) &&
      CAREER.test(
        `${heading} ${mainTitle} ${signals.join(' ')} ${metadata.map((field) => field.nearbyText).join(' ')}`,
      )
    )
      return true;
  }
  return false;
}
