export type FieldFeedbackState = 'green' | 'yellow' | 'red' | 'gray' | 'confirmed';

const messages: Record<FieldFeedbackState, string> = {
  green: 'Filled with high confidence.',
  yellow: 'Review this answer.',
  red: 'No confident match found.',
  gray: 'No saved answer in your profile.',
  confirmed: 'Confirmed by you.',
};
const colors = {
  green: ['#15803d', '#4ade80'],
  confirmed: ['#15803d', '#4ade80'],
  yellow: ['#a16207', '#fbbf24'],
  red: ['#b91c1c', '#f87171'],
  gray: ['#4b5563', '#cbd5e1'],
} satisfies Record<FieldFeedbackState, string[]>;
const paths: Record<FieldFeedbackState, string[]> = {
  green: ['M20 6 9 17l-5-5'],
  confirmed: ['M20 6 9 17l-5-5'],
  yellow: ['m12 3 10 18H2L12 3Z', 'M12 9v4', 'M12 17h.01'],
  red: ['M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4', 'M12 17h.01'],
  gray: ['M12 11v6', 'M12 7h.01'],
};
interface Feedback {
  element: HTMLElement;
  state: FieldFeedbackState;
  marker: HTMLSpanElement;
  description: HTMLSpanElement;
  removeListeners: () => void;
}
const fields = new Map<HTMLElement, Feedback>();
const prefix = `jb-feedback-${Math.random().toString(36).slice(2)}`;
let nextId = 0;
let host: HTMLDivElement | null = null;
let layer: ShadowRoot | null = null;
let tooltip: HTMLDivElement | null = null;
let active: Feedback | null = null;
let tooltipHovered = false;
let hideTimer: ReturnType<typeof setTimeout> | undefined;
let frame: number | null = null;
let resizeObserver: ResizeObserver | null = null;
let mutationObserver: MutationObserver | null = null;
let suppressed = false;
const shadowScopes = new Map<ShadowRoot, { count: number; observer: MutationObserver }>();
const mutationOptions: MutationObserverInit = {
  subtree: true,
  childList: true,
  attributes: true,
  attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'aria-expanded'],
};

export function withoutFieldFeedback(action: () => void): void {
  const previous = suppressed;
  suppressed = true;
  try {
    action();
  } finally {
    suppressed = previous;
  }
}

function owned(node: Node): boolean {
  return (
    node instanceof Element && (node === host || node.hasAttribute('data-jb-field-description'))
  );
}
function onMutations(changes: MutationRecord[]): void {
  if (
    changes.some(
      (change) =>
        !owned(change.target) &&
        (change.type === 'attributes' ||
          [...change.addedNodes, ...change.removedNodes].some((node) => !owned(node))),
    )
  )
    scheduleLayout();
}

function watchShadowScopes(element: HTMLElement): () => void {
  const roots: ShadowRoot[] = [];
  let root = element.getRootNode();
  while (root instanceof ShadowRoot) {
    roots.push(root);
    const existing = shadowScopes.get(root);
    if (existing) existing.count++;
    else {
      const observer = new MutationObserver(onMutations);
      observer.observe(root, mutationOptions);
      root.addEventListener('scroll', scheduleLayout, true);
      shadowScopes.set(root, { count: 1, observer });
    }
    root = root.host.getRootNode();
  }
  return () => {
    for (const scope of roots) {
      const entry = shadowScopes.get(scope)!;
      if (--entry.count === 0) {
        entry.observer.disconnect();
        scope.removeEventListener('scroll', scheduleLayout, true);
        shadowScopes.delete(scope);
      }
    }
  };
}

function ensureLayer(): void {
  if (host?.isConnected) return;
  host = document.createElement('div');
  host.dataset.jbFeedbackRoot = '';
  host.style.cssText = 'all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483646;';
  layer = host.attachShadow({ mode: 'open' });
  document.documentElement.appendChild(host);
  tooltip = document.createElement('div');
  tooltip.setAttribute('role', 'tooltip');
  tooltip.style.cssText =
    'all:initial;position:fixed;display:none;box-sizing:border-box;width:max-content;max-width:min(280px,calc(100vw - 8px));padding:9px 11px;border:1px solid #64748b;border-radius:8px;box-shadow:0 4px 16px #0003;font:13px/1.5 system-ui,sans-serif;pointer-events:auto;overflow-wrap:anywhere;';
  tooltip.addEventListener('pointerenter', () => {
    tooltipHovered = true;
    clearTimeout(hideTimer);
  });
  tooltip.addEventListener('pointerleave', () => {
    tooltipHovered = false;
    scheduleHide();
  });
  layer.appendChild(tooltip);
  window.addEventListener('scroll', scheduleLayout, true);
  window.addEventListener('resize', scheduleLayout);
  document.addEventListener('keydown', onKeyDown, true);
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(scheduleLayout);
    resizeObserver.observe(document.documentElement);
  }
  mutationObserver = new MutationObserver(onMutations);
  mutationObserver.observe(document.documentElement, mutationOptions);
}
function icon(state: FieldFeedbackState): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  if (state === 'red' || state === 'gray') {
    const circle = document.createElementNS(svg.namespaceURI, 'circle');
    circle.setAttribute('cx', '12');
    circle.setAttribute('cy', '12');
    circle.setAttribute('r', '10');
    svg.appendChild(circle);
  }
  for (const d of paths[state]) {
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}
function show(record: Feedback): void {
  if (suppressed) return;
  clearTimeout(hideTimer);
  active = record;
  tooltip!.textContent = `Job Buddy: ${messages[record.state]}`;
  tooltip!.style.display = 'block';
  scheduleLayout();
}
function hide(): void {
  clearTimeout(hideTimer);
  active = null;
  tooltipHovered = false;
  if (tooltip) tooltip.style.display = 'none';
}
function scheduleHide(): void {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (!tooltipHovered && active && !active.element.matches(':focus')) hide();
  }, 150);
}
function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') hide();
}
function scheduleLayout(): void {
  if (frame !== null) return;
  frame = window.requestAnimationFrame(layout);
}
function groupAnchor(element: HTMLElement): HTMLElement {
  if (element instanceof HTMLInputElement && ['radio', 'checkbox'].includes(element.type)) {
    return (
      element.closest<HTMLElement>('fieldset, [role="radiogroup"], [role="group"]') ??
      element.closest('label') ??
      element
    );
  }
  return element;
}
function visible(element: HTMLElement, rect: DOMRect): boolean {
  if (!element.isConnected || rect.width === 0 || rect.height === 0) return false;
  if (rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth)
    return false;
  const style = getComputedStyle(element);
  return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
}
function layout(): void {
  frame = null;
  const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  const occupied: { x: number; y: number }[] = [];
  const groups = new Map<HTMLElement, Feedback>();
  const priority = { red: 4, yellow: 3, gray: 2, green: 1, confirmed: 1 };
  for (const record of fields.values()) {
    if (!record.element.isConnected) {
      clearFieldFeedback(record.element);
      continue;
    }
    const anchor = groupAnchor(record.element);
    const previous = groups.get(anchor);
    if (!previous || priority[record.state] > priority[previous.state]) groups.set(anchor, record);
    record.marker.style.display = 'none';
  }
  for (const [anchor, record] of groups) {
    const rect = anchor.getBoundingClientRect();
    if (!visible(record.element, record.element.getBoundingClientRect()) || !visible(anchor, rect))
      continue;
    const positions =
      anchor !== record.element && anchor.matches('fieldset,[role="group"],[role="radiogroup"]')
        ? [{ x: rect.right - 24, y: rect.top + 4 }]
        : [
            { x: rect.right + 3, y: rect.top + (rect.height - 20) / 2 },
            { x: rect.left - 23, y: rect.top + (rect.height - 20) / 2 },
          ];
    const position = positions.find(({ x, y }) => {
      if (x < 2 || y < 2 || x + 20 > innerWidth - 2 || y + 20 > innerHeight - 2) return false;
      if (occupied.some((p) => Math.abs(p.x - x) < 22 && Math.abs(p.y - y) < 22)) return false;
      // Avoid adjacent fields, labels, picker buttons, and links in tight layouts.
      return [x + 2, x + 18].every((px) => {
        const hit = document.elementFromPoint?.(px, y + 10);
        if (!hit || hit === host || hit === anchor || hit.contains(anchor)) return true;
        return !hit.closest(
          'input,select,textarea,button,a,label,legend,[role="button"],[role="combobox"],[contenteditable="true"]',
        );
      });
    });
    if (!position) continue; // The field's focus explanation still works without a free badge slot.
    record.marker.style.left = `${position.x}px`;
    record.marker.style.top = `${position.y}px`;
    record.marker.style.color = colors[record.state][dark ? 1 : 0];
    record.marker.style.background = dark ? '#111827' : '#fff';
    record.marker.style.display = 'flex';
    occupied.push(position);
  }
  if (active && tooltip) {
    if (active.element.getAttribute('aria-expanded') === 'true') {
      hide();
      return;
    }
    const rect = active.element.getBoundingClientRect();
    if (!visible(active.element, rect)) {
      hide();
      return;
    }
    tooltip.style.color = dark ? '#f3f4f6' : '#111827';
    tooltip.style.background = dark ? '#111827' : '#fff';
    const box = tooltip.getBoundingClientRect();
    const right = rect.right + 28;
    const left = rect.left - box.width - 28;
    const beside = right + box.width < innerWidth - 4 || left > 4;
    const x = beside ? (right + box.width < innerWidth - 4 ? right : left) : rect.left;
    tooltip.style.left = `${Math.max(4, Math.min(x, innerWidth - box.width - 4))}px`;
    const y = beside
      ? rect.top + (rect.height - box.height) / 2
      : rect.bottom + box.height + 10 < innerHeight
        ? rect.bottom + 6
        : rect.top - box.height - 6;
    tooltip.style.top = `${Math.max(4, Math.min(y, innerHeight - box.height - 4))}px`;
  }
}

export function setFieldFeedback(element: HTMLElement, state: FieldFeedbackState): void {
  const existing = fields.get(element);
  if (existing) {
    existing.state = state;
    existing.description.textContent = `Job Buddy: ${messages[state]}`;
    existing.marker.dataset.jbFieldStatus = state;
    existing.marker.replaceChildren(icon(state));
    if (active === existing) show(existing);
    scheduleLayout();
    return;
  }
  ensureLayer();
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
  const marker = document.createElement('span');
  marker.dataset.jbFieldStatus = state;
  marker.setAttribute('aria-hidden', 'true');
  marker.style.cssText =
    'all:initial;box-sizing:border-box;position:fixed;display:none;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;border:1px solid #64748b55;box-shadow:0 1px 4px #0002;pointer-events:auto;cursor:help;';
  marker.appendChild(icon(state));
  const record: Feedback = { element, state, marker, description, removeListeners: () => {} };
  const unwatchShadowScopes = watchShadowScopes(element);
  const enter = () => show(record);
  const focus = (event: FocusEvent) => {
    if (event.isTrusted) show(record);
  };
  element.addEventListener('focus', focus);
  element.addEventListener('blur', scheduleHide);
  element.addEventListener('pointerenter', enter);
  element.addEventListener('pointerleave', scheduleHide);
  marker.addEventListener('pointerenter', enter);
  marker.addEventListener('pointerleave', scheduleHide);
  marker.addEventListener('mousedown', (event) => event.preventDefault());
  marker.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    element.focus({ preventScroll: true });
    show(record);
  });
  record.removeListeners = () => {
    unwatchShadowScopes();
    element.removeEventListener('focus', focus);
    element.removeEventListener('blur', scheduleHide);
    element.removeEventListener('pointerenter', enter);
    element.removeEventListener('pointerleave', scheduleHide);
  };
  fields.set(element, record);
  layer!.appendChild(marker);
  resizeObserver?.observe(element);
  scheduleLayout();
}

export function confirmFieldFeedback(element: HTMLElement): void {
  const state = fields.get(element)?.state;
  if (state === 'green' || state === 'confirmed') setFieldFeedback(element, 'confirmed');
}

export function clearFieldFeedback(element: HTMLElement): void {
  const record = fields.get(element);
  if (!record) return;
  if (active === record) hide();
  record.marker.remove();
  record.description.remove();
  record.removeListeners();
  resizeObserver?.unobserve(element);
  const tokens = (element.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter((id) => id && id !== record.description.id);
  if (tokens.length) element.setAttribute('aria-describedby', tokens.join(' '));
  else element.removeAttribute('aria-describedby');
  fields.delete(element);
  if (fields.size) {
    scheduleLayout();
    return;
  }
  mutationObserver?.disconnect();
  mutationObserver = null;
  resizeObserver?.disconnect();
  resizeObserver = null;
  window.removeEventListener('scroll', scheduleLayout, true);
  window.removeEventListener('resize', scheduleLayout);
  document.removeEventListener('keydown', onKeyDown, true);
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null;
  host?.remove();
  host = null;
  layer = null;
  tooltip = null;
}

export function clearAllFieldFeedback(): void {
  for (const element of fields.keys()) clearFieldFeedback(element);
}
