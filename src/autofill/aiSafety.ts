import type { Profile } from '../types/profile';
import { questionLabel } from './scanner';
import type { AIFieldPayload, AIOptionPayload } from '../resume-ai/types';
import { autofillProfilePayload } from '../resume-ai/profilePayload';
import { composedParent } from './dom';
import { extractSignals } from './signals';
import { sectionFamily, ruleQuestionBlocked } from './ruleContext';

/** A response can only name data exposed for this particular question. */
export function allowedAIPath(profile: Profile, field: AIFieldPayload, path: string): boolean {
  if (!/^[a-zA-Z]+(?:\.(?:[a-zA-Z]+|\d+))*$/.test(path)) return false;
  const safe = autofillProfilePayload(profile, [field]);
  const has = (key: string): boolean => {
    let node: unknown = safe;
    for (const part of key.split('.')) {
      if (!node || typeof node !== 'object' || !Object.hasOwn(node, part)) return false;
      node = (node as Record<string, unknown>)[part];
    }
    return node !== undefined && node !== null;
  };
  const scalar = (key: string): boolean => {
    let node: unknown = safe;
    for (const part of key.split('.'))
      node = node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined;
    return ['string', 'number', 'boolean'].includes(typeof node);
  };
  if (scalar(path)) return true;
  const virtual: Record<string, string> = {
    'personal.phone.full': 'personal.phone',
    'address.countryName': 'address.country',
    'languages.formatted': 'languages',
    'professional.noticePeriod.availableDate': 'professional.noticePeriod',
    'professional.noticePeriod.formatted': 'professional.noticePeriod',
    'salary.current.formatted': 'salary.current.amount',
    workAuthorization: 'workAuthorization',
  };
  if (virtual[path]) return has(virtual[path]);
  const date = path.match(/^(personal\.dateOfBirth)\.(day|month|year)$/);
  if (date) return has(date[1]);
  const formatted = path.match(
    /^((?:education|workHistory)\.\d+\.(?:startDate|endDate))\.formatted$/,
  );
  if (formatted) return has(formatted[1]);
  const salary = path.match(/^salary\.expected\.(\d+)\.formatted$/);
  if (salary) return has(`salary.expected.${salary[1]}.amount`);
  const work = path.match(/^workHistory\.(\d+)\.location(?:\.countryName)?$/);
  if (work) return has(`workHistory.${work[1]}.location`);
  return /^workAuthorization\.\d+$/.test(path) && has(path);
}

/** Never guess a nearby option, or decide between a colliding label and value. */
export function exactAIOption<T extends AIOptionPayload>(options: T[], answer: string): T | null {
  const byId = options.filter((option) => option.id === answer);
  if (byId.length === 1) return byId[0];
  const matches = options.filter((option) => option.label === answer || option.value === answer);
  return matches.length === 1 ? matches[0] : null;
}

export function aiQuestionIdentity(element: HTMLElement): string {
  const s = extractSignals(element);
  const headings: string[] = [];
  for (let node = composedParent(element); node; node = composedParent(node)) {
    const heading = node.querySelector(
      ':scope > legend,:scope > h1,:scope > h2,:scope > h3,:scope > h4',
    );
    if (heading) headings.push(heading.textContent ?? '');
    if (node.matches('form')) break;
  }
  return JSON.stringify({
    ...s,
    element: undefined,
    section: sectionFamily(element),
    headings,
    question: questionLabel(element),
    role: element.getAttribute('role'),
    constraints: ['min', 'max', 'step', 'pattern', 'maxlength'].map((key) =>
      element.getAttribute(key),
    ),
    options:
      element instanceof HTMLSelectElement
        ? [...element.options].map((o) => [o.value, o.text, o.disabled])
        : undefined,
  });
}

export function aiQuestionAllowed(element: HTMLElement): boolean {
  return !ruleQuestionBlocked(extractSignals(element));
}
