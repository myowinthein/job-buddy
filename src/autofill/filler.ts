import { distance } from 'fastest-levenshtein';
import { normalize } from './normalizer';

// Capture native setters before any framework can shadow them on instances
const nativeInputSetter    = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,    'value')?.set;
const nativeTextareaSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;

function dispatchEvents(element: HTMLElement): void {
  element.dispatchEvent(new Event('input',  { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new Event('blur',   { bubbles: true }));
}

function sim(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - distance(a, b) / maxLen;
}

function fillSelect(select: HTMLSelectElement, value: string): void {
  const normValue = normalize(value);
  let bestIndex = -1;
  let bestScore = 0;

  for (let i = 0; i < select.options.length; i++) {
    const opt = select.options[i];
    const normText = normalize(opt.text);
    const normVal  = normalize(opt.value);

    // Exact match — take immediately
    if (normText === normValue || normVal === normValue) {
      select.selectedIndex = i;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }

    const score = Math.max(sim(normText, normValue), sim(normVal, normValue));
    if (score > bestScore) { bestScore = score; bestIndex = i; }
  }

  if (bestScore >= 0.75 && bestIndex >= 0) {
    select.selectedIndex = bestIndex;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

export async function fillField(element: HTMLElement, value: string): Promise<void> {
  if (!value) return;

  if (element instanceof HTMLSelectElement) {
    fillSelect(element, value);
    return;
  }

  if (element instanceof HTMLTextAreaElement) {
    if (nativeTextareaSetter) nativeTextareaSetter.call(element, value);
    else (element as HTMLTextAreaElement).value = value;
    dispatchEvents(element);
    return;
  }

  if (element instanceof HTMLInputElement) {
    if (nativeInputSetter) nativeInputSetter.call(element, value);
    else element.value = value;
    dispatchEvents(element);
  }
}
