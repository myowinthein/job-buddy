import { CONF_FILL, CONF_GREEN } from './constants';

// Confidence-based background tint and missing-data outlines on form elements.
// Original background-color and transition are saved in data attributes
// so they can be restored exactly on clear.

const missingDataOutlines = new Map<HTMLElement, () => void>();

function rememberStyles(element: HTMLElement): void {
  element.dataset.jbHighlighted = '1';

  if (!('jbOrigBackground' in element.dataset)) {
    element.dataset.jbOrigBackground = element.style.backgroundColor;
    element.dataset.jbOrigTransition = element.style.transition;
    element.dataset.jbOrigBackgroundPriority =
      element.style.getPropertyPriority('background-color');
    element.dataset.jbOrigTransitionPriority = element.style.getPropertyPriority('transition');
  }
}

export function applyHighlight(element: HTMLElement, confidence: number): void {
  missingDataOutlines.get(element)?.();
  rememberStyles(element);

  element.style.transition = 'background-color 0.2s ease';
  element.style.backgroundColor =
    confidence >= CONF_GREEN
      ? 'rgba(34, 197, 94, 0.12)'
      : confidence >= CONF_FILL
        ? 'rgba(234, 179, 8, 0.12)'
        : 'rgba(239, 68, 68, 0.12)';
}

export function applyMissingDataHighlight(element: HTMLElement): void {
  if (missingDataOutlines.has(element)) return;
  rememberStyles(element);
  restoreBackground(element);

  const outline = element.style.getPropertyValue('outline');
  const outlinePriority = element.style.getPropertyPriority('outline');
  const originals = ['outline-color', 'outline-style', 'outline-width', 'outline-offset'].map(
    (property) => ({
      property,
      value: element.style.getPropertyValue(property),
      priority: element.style.getPropertyPriority(property),
    }),
  );
  const restore = () => {
    element.style.removeProperty('outline');
    for (const { property } of originals) element.style.removeProperty(property);
    if (outline) element.style.setProperty('outline', outline, outlinePriority);
    for (const { property, value, priority } of originals) {
      if (value) element.style.setProperty(property, value, priority);
    }
  };
  const show = () => {
    // Let the site's own focus styling take over while the user edits.
    if (element.matches(':focus')) return;
    element.style.outline = '1px solid rgba(148, 163, 184, 0.7)';
    element.style.outlineOffset = '1px';
  };
  missingDataOutlines.set(element, () => {
    restore();
    element.removeEventListener('focus', restore);
    element.removeEventListener('blur', show);
    delete element.dataset.jbMissingData;
    missingDataOutlines.delete(element);
  });
  element.dataset.jbMissingData = '1';
  element.addEventListener('focus', restore);
  element.addEventListener('blur', show);
  show();
}

export function clearMissingDataHighlights(): void {
  // Includes controls inside shadow roots and controls removed from the page.
  for (const element of missingDataOutlines.keys()) clearElementHighlight(element);
}

export function clearElementHighlight(element: HTMLElement): void {
  if (!element.dataset.jbHighlighted) return;
  missingDataOutlines.get(element)?.();
  restoreBackground(element);
  delete element.dataset.jbHighlighted;
  delete element.dataset.jbOrigBackground;
  delete element.dataset.jbOrigTransition;
  delete element.dataset.jbOrigBackgroundPriority;
  delete element.dataset.jbOrigTransitionPriority;
}

function restoreBackground(element: HTMLElement): void {
  element.style.setProperty(
    'background-color',
    element.dataset.jbOrigBackground ?? '',
    element.dataset.jbOrigBackgroundPriority ?? '',
  );
  element.style.setProperty(
    'transition',
    element.dataset.jbOrigTransition ?? '',
    element.dataset.jbOrigTransitionPriority ?? '',
  );
}

export function clearHighlights(): void {
  clearMissingDataHighlights();
  document.querySelectorAll<HTMLElement>('[data-jb-highlighted]').forEach(clearElementHighlight);
}
