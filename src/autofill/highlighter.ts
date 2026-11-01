import { CONF_FILL, CONF_GREEN } from './constants';

// Confidence-based and missing-data background tints on form elements.
// Original background-color and transition are saved in data attributes
// so they can be restored exactly on clear.

const missingDataElements = new Set<HTMLElement>();

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
  missingDataElements.delete(element);
  delete element.dataset.jbMissingData;
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
  rememberStyles(element);
  missingDataElements.add(element);
  element.dataset.jbMissingData = '1';
  element.style.transition = 'background-color 0.2s ease';
  element.style.backgroundColor = 'rgba(107, 114, 128, 0.12)';
}

export function clearMissingDataHighlights(): void {
  // Includes controls inside shadow roots and controls removed from the page.
  for (const element of missingDataElements) clearElementHighlight(element);
}

export function clearElementHighlight(element: HTMLElement): void {
  if (!element.dataset.jbHighlighted) return;
  missingDataElements.delete(element);
  delete element.dataset.jbMissingData;
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
