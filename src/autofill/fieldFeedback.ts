export type FieldFeedbackState = 'green' | 'yellow' | 'red' | 'gray' | 'confirmed';

const messages: Record<FieldFeedbackState, string> = {
  green: 'Filled with high confidence.',
  yellow: 'Review this answer.',
  red: 'No confident match found.',
  gray: 'No saved answer in your profile.',
  confirmed: 'Confirmed by you.',
};
interface Feedback {
  state: FieldFeedbackState;
  description: HTMLSpanElement;
}
const fields = new Map<HTMLElement, Feedback>();
const prefix = `jb-feedback-${Math.random().toString(36).slice(2)}`;
let nextId = 0;
let observer: MutationObserver | null = null;
let watchedRoots = new WeakSet<Node>();

function watchRoots(element: HTMLElement): void {
  if (!observer) {
    observer = new MutationObserver(() => {
      for (const field of fields.keys()) {
        if (!field.isConnected) clearFieldFeedback(field);
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
  let root = element.getRootNode();
  while (root instanceof ShadowRoot) {
    if (!watchedRoots.has(root)) {
      observer.observe(root, { childList: true, subtree: true });
      watchedRoots.add(root);
    }
    root = root.host.getRootNode();
  }
}

// Status descriptions supplement the site's hints without adding visible UI or tab stops.
export function setFieldFeedback(element: HTMLElement, state: FieldFeedbackState): void {
  const existing = fields.get(element);
  if (existing) {
    if (existing.state === state) return;
    existing.state = state;
    existing.description.textContent = `Job Buddy: ${messages[state]}`;
    return;
  }
  watchRoots(element);
  const description = document.createElement('span');
  description.id = `${prefix}-${++nextId}`;
  description.dataset.jbFieldDescription = '';
  description.textContent = `Job Buddy: ${messages[state]}`;
  description.style.cssText =
    'position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip-path:inset(50%)!important;white-space:nowrap!important;border:0!important;pointer-events:none!important;';
  const root = element.getRootNode();
  (root instanceof ShadowRoot ? root : (document.body ?? document.documentElement)).appendChild(
    description,
  );
  const describedBy = element.getAttribute('aria-describedby')?.split(/\s+/).filter(Boolean) ?? [];
  element.setAttribute('aria-describedby', [...describedBy, description.id].join(' '));
  fields.set(element, { state, description });
}

export function confirmFieldFeedback(element: HTMLElement): void {
  const state = fields.get(element)?.state;
  if (state === 'green' || state === 'confirmed') setFieldFeedback(element, 'confirmed');
}

export function clearFieldFeedback(element: HTMLElement): void {
  const record = fields.get(element);
  if (!record) return;
  record.description.remove();
  const tokens = (element.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter((id) => id && id !== record.description.id);
  if (tokens.length) element.setAttribute('aria-describedby', tokens.join(' '));
  else element.removeAttribute('aria-describedby');
  fields.delete(element);
  if (!fields.size) {
    observer?.disconnect();
    observer = null;
    watchedRoots = new WeakSet<Node>();
  }
}

export function clearAllFieldFeedback(): void {
  for (const element of fields.keys()) clearFieldFeedback(element);
}
