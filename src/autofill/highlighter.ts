import { CONF_FILL, CONF_GREEN } from './constants';

// Confidence-based background tint applied directly to form elements.
// Original background-color and transition are saved in data attributes
// so they can be restored exactly on clear.

export function applyHighlight(element: HTMLElement, confidence: number): void {
  element.dataset.jbHighlighted = '1';

  if (!('jbOrigBackground' in element.dataset)) {
    element.dataset.jbOrigBackground = element.style.backgroundColor;
    element.dataset.jbOrigTransition = element.style.transition;
  }

  element.style.transition = 'background-color 0.2s ease';
  element.style.backgroundColor =
    confidence >= CONF_GREEN ? 'rgba(34, 197, 94, 0.12)' :
    confidence >= CONF_FILL  ? 'rgba(234, 179, 8, 0.12)' :
                               'rgba(239, 68, 68, 0.12)';
}

export function clearElementHighlight(element: HTMLElement): void {
  element.style.backgroundColor = element.dataset.jbOrigBackground ?? '';
  element.style.transition      = element.dataset.jbOrigTransition  ?? '';
  delete element.dataset.jbHighlighted;
  delete element.dataset.jbOrigBackground;
  delete element.dataset.jbOrigTransition;
}

export function clearHighlights(): void {
  document.querySelectorAll<HTMLElement>('[data-jb-highlighted]').forEach((el) => {
    el.style.backgroundColor = el.dataset.jbOrigBackground ?? '';
    el.style.transition      = el.dataset.jbOrigTransition  ?? '';
    delete el.dataset.jbHighlighted;
    delete el.dataset.jbOrigBackground;
    delete el.dataset.jbOrigTransition;
  });
}
