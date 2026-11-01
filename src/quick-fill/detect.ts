// Local discovery only. Never scans with Gemini or sends page text to the worker.
export const QUICK_FILL_HOST = 'data-job-buddy-ui';
const CAREER =
  /\b(resum[eé]|cv|curriculum vitae|cover letter|work authori[sz]ation|employment|job application|apply for|candidate|linkedin|salary|portfolio)\b/i;
const IDENTITY = /first.?name|full.?name|given.?name|your name|\bname\b/i;
const EMAIL = /email|e-mail/i;
const CONTROL =
  'input:not([type="hidden"]):not([type="submit"]):not([type="button"]),textarea,select,[role="textbox"],[role="combobox"]';

export function likelyApplicationForm(
  root: ParentNode = document,
  onRoot?: (root: ParentNode) => void,
): boolean {
  const controls: HTMLElement[] = [];
  const collect = (scope: ParentNode, depth: number) => {
    if (depth > 8 || controls.length >= 500) return;
    onRoot?.(scope);
    for (const el of scope.querySelectorAll<HTMLElement>(CONTROL)) {
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
    const group = el.closest('form,[role="form"]') ?? (el.getRootNode() as ParentNode);
    groups.set(group, [...(groups.get(group) ?? []), el]);
  }
  for (const [group, fields] of groups) {
    if (fields.length < 3) continue;
    const signals = fields.map((el) =>
      [
        el.getAttribute('name'),
        el.id,
        el.getAttribute('autocomplete'),
        el.getAttribute('aria-label'),
        el.getAttribute('placeholder'),
        ...Array.from((el as HTMLInputElement).labels ?? []).map((label) =>
          label.textContent?.slice(0, 200),
        ),
      ]
        .filter(Boolean)
        .join(' '),
    );
    const heading =
      group instanceof Element
        ? `${group.getAttribute('aria-label') ?? ''} ${group.querySelector('h1,h2,h3,legend')?.textContent?.slice(0, 300) ?? ''}`
        : document.title;
    if (
      signals.some((s) => IDENTITY.test(s)) &&
      signals.some((s) => EMAIL.test(s)) &&
      CAREER.test(`${heading} ${signals.join(' ')}`)
    )
      return true;
  }
  return false;
}
