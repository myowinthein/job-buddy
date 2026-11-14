import { composedAncestors, controlForm } from '@/src/autofill/dom';
import { extractSignals } from '@/src/autofill/signals';

// Local discovery only. Never scans with Gemini or sends page text to the worker.
export const QUICK_FILL_HOST = 'data-job-buddy-ui';
const CAREER =
  /\b(resum[eé]|cv|curriculum vitae|cover letter|work authori[sz]ation|employment|job application|application (?:files|documents)|bewerbungs(?:unterlagen|dateien)|apply for|candidate|linkedin|salary|portfolio)\b/i;
const IDENTITY = /first.?name|full.?name|given.?name|your name|\bvorname\b|\bname\b/i;
const EMAIL = /email|e-mail/i;
const AUXILIARY =
  /\b(?:contact us|contact form|newsletter|subscribe|sign[ -]?in|log[ -]?in|search)\b/i;
export const QUICK_FILL_CONTROL =
  'input:not([type="hidden"]):not([type="submit"]):not([type="button"]),textarea,select,[role="textbox"],[role="combobox"]';

function applicationRoute(): string | undefined {
  return location.pathname.match(/^(.*?\/(?:apply|applications?))(?:\/|$)/i)?.[1];
}

/** A page heading can describe a form-free wizard or its one enclosed form.
 * Never borrow it across independent forms or shadow widgets. */
function primaryHeading(group: ParentNode): string {
  let scope = group;
  if (group instanceof Element && group.matches('form,[role="form"]')) {
    for (let parent = group.parentElement; parent; parent = parent.parentElement) {
      const forms = parent.querySelectorAll('form,[role="form"]');
      if (forms.length !== 1 || forms[0] !== group) break;
      scope = parent;
      if (parent.querySelector('h1,[role="heading"][aria-level="1"]')) break;
    }
  }
  return (
    scope.querySelector('h1,[role="heading"][aria-level="1"]')?.textContent?.slice(0, 300) ?? ''
  );
}

/** Carry a confirmed wizard through later steps in the same application route.
 * This only controls button visibility; every Fill action still scans afresh. */
export function createApplicationFormDetector() {
  let confirmedRoute: string | undefined;
  return (root: ParentNode = document, onRoot?: (root: ParentNode) => void): boolean => {
    const route = applicationRoute();
    if (route !== confirmedRoute) confirmedRoute = undefined;
    const found = likelyApplicationForm(root, onRoot, !!route && confirmedRoute === route);
    if (found && route) confirmedRoute = route;
    return found;
  };
}

export function likelyApplicationForm(
  root: ParentNode = document,
  onRoot?: (root: ParentNode) => void,
  confirmedApplicationFlow = false,
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
    const primary = primaryHeading(group);
    const purpose =
      group instanceof Element
        ? `${group.getAttribute('aria-label') ?? ''} ${group.id} ${group.getAttribute('name') ?? ''}`
        : '';
    const auxiliary = AUXILIARY.test(`${purpose} ${primary}`);
    if (
      confirmedApplicationFlow &&
      !auxiliary &&
      fields.some(
        (el) =>
          ![...composedAncestors(el)].some((parent) => parent.matches('nav,header,footer,aside')),
      )
    )
      return true;
    const wizard = !!applicationRoute() && !auxiliary && /\bapplication\b/i.test(primary);
    if (fields.length < (wizard ? 2 : 3)) continue;
    const metadata = fields.map((el) => extractSignals(el));
    const signals = metadata.map(
      ({ name, id, autocomplete, ariaLabel, placeholder, label, nearbyText }) =>
        [name, id, autocomplete, ariaLabel, placeholder, label, nearbyText]
          .filter(Boolean)
          .join(' '),
    );
    // Technical identifiers often hide the only career hint behind a generic
    // "Import your documents" label (upload_cv, uploadResume, attachment[cv]).
    // Split identifier words without turning substrings such as cvv into CV.
    const identifiers = metadata.map(({ name, id }) =>
      `${name} ${id}`
        .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[_\-.:[\]]+/g, ' '),
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
      (wizard ||
        CAREER.test(
          `${heading} ${mainTitle} ${signals.join(' ')} ${identifiers.join(' ')} ${metadata.map((field) => field.nearbyText).join(' ')}`,
        ))
    )
      return true;
  }
  return false;
}
