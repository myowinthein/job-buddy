import { CONF_FILL, CONF_GREEN } from './constants';
import { setFieldFeedback, clearFieldFeedback, clearAllFieldFeedback } from './fieldFeedback';
import { isChoice, queryOpenElements } from './dom';
import { backgroundTint, type FieldTint } from './backgroundTint';

// Confidence-based and missing-data background tints on form elements.
// Original background-color and transition are saved in data attributes
// so they can be restored exactly on clear.

const highlightedElements = new Set<HTMLElement>();
const missingDataElements = new Set<HTMLElement>();
const surfaces = new Map<HTMLElement, HTMLElement>();
const surfaceOwners = new WeakMap<HTMLElement, HTMLElement>();

/** Some input libraries draw the field on a wrapper around a borderless input. */
function highlightSurface(element: HTMLElement): HTMLElement {
  const previous = surfaces.get(element);
  if (previous) return previous;
  if (
    !element.matches('input,textarea') ||
    isChoice(element) ||
    element.matches('input[type="file"],input[type="hidden"]')
  )
    return element;
  const own = getComputedStyle(element);
  const bordered = (style: CSSStyleDeclaration) =>
    ['Top', 'Right', 'Bottom', 'Left'].some(
      (side) =>
        parseFloat(style.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0 &&
        !['none', 'hidden'].includes(style.getPropertyValue(`border-${side.toLowerCase()}-style`)),
    );
  // An opaque inner background would cover a wrapper tint.
  if (bordered(own) || !['', 'transparent', 'rgba(0, 0, 0, 0)'].includes(own.backgroundColor))
    return element;
  // Stay inside the input's tree and never tint a shared contact row or form.
  for (
    let parent = element.parentElement, depth = 0;
    parent && depth < 3;
    parent = parent.parentElement, depth++
  ) {
    if (parent.matches('form,fieldset,body,[role="group"],[role="form"]')) break;
    const controls = queryOpenElements(
      parent,
      'input,select,textarea,[role="combobox"],[role="textbox"],[contenteditable]',
    );
    if (controls.some((control) => control !== element)) break;
    if (bordered(getComputedStyle(parent))) return parent;
  }
  return element;
}

function paint(element: HTMLElement, tint: FieldTint): void {
  const surface = highlightSurface(element);
  const previousOwner = surfaceOwners.get(surface);
  if (previousOwner && previousOwner !== element) clearElementHighlight(previousOwner);
  surfaces.set(element, surface);
  surfaceOwners.set(surface, element);
  rememberStyles(surface);
  highlightedElements.add(element);
  element.dataset.jbHighlighted = '1';
  // Keep the wrapper's focus/border transitions intact.
  if (surface === element) surface.style.transition = 'background-color 0.2s ease';
  surface.style.backgroundColor = backgroundTint(
    surface.dataset.jbOrigComputedBackground ?? '',
    tint,
  );
}

function rememberStyles(element: HTMLElement): void {
  element.dataset.jbHighlighted = '1';

  if (!('jbOrigBackground' in element.dataset)) {
    element.dataset.jbOrigBackground = element.style.backgroundColor;
    element.dataset.jbOrigComputedBackground = getComputedStyle(element).backgroundColor;
    element.dataset.jbOrigTransition = element.style.transition;
    element.dataset.jbOrigBackgroundPriority =
      element.style.getPropertyPriority('background-color');
    element.dataset.jbOrigTransitionPriority = element.style.getPropertyPriority('transition');
  }
}

export function applyHighlight(element: HTMLElement, confidence: number, confirmed = false): void {
  missingDataElements.delete(element);
  delete element.dataset.jbMissingData;
  paint(element, confidence >= CONF_GREEN ? 'green' : confidence >= CONF_FILL ? 'yellow' : 'red');
  setFieldFeedback(
    element,
    confirmed
      ? 'confirmed'
      : confidence >= CONF_GREEN
        ? 'green'
        : confidence >= CONF_FILL
          ? 'yellow'
          : 'red',
  );
}

export function applyMissingDataHighlight(element: HTMLElement): void {
  missingDataElements.add(element);
  element.dataset.jbMissingData = '1';
  paint(element, 'gray');
  setFieldFeedback(element, 'gray');
}

export function clearMissingDataHighlights(): void {
  // Includes controls inside shadow roots and controls removed from the page.
  for (const element of missingDataElements) clearElementHighlight(element);
}

export function clearElementHighlight(element: HTMLElement): void {
  const savedSurface = surfaces.get(element);
  const surface = savedSurface ?? element;
  surfaces.delete(element);
  if (surfaceOwners.get(surface) === element) surfaceOwners.delete(surface);
  highlightedElements.delete(element);
  clearFieldFeedback(element);
  if (!savedSurface && !element.dataset.jbHighlighted) return;
  missingDataElements.delete(element);
  delete element.dataset.jbMissingData;
  restoreBackground(surface);
  if (surface !== element) forgetStyles(surface);
  forgetStyles(element);
}

function forgetStyles(element: HTMLElement): void {
  delete element.dataset.jbHighlighted;
  delete element.dataset.jbOrigBackground;
  delete element.dataset.jbOrigComputedBackground;
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
  clearAllFieldFeedback();
  clearMissingDataHighlights();
  for (const element of highlightedElements) clearElementHighlight(element);
}
