import { distance } from 'fastest-levenshtein';
import type { DocumentFile } from '../types/profile';
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

// Sets an element's value to empty and notifies the page's framework.
function setEmpty(element: HTMLElement): void {
  if (element instanceof HTMLSelectElement) {
    element.selectedIndex = 0;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (element instanceof HTMLTextAreaElement) {
    if (nativeTextareaSetter) nativeTextareaSetter.call(element, '');
    else element.value = '';
    dispatchEvents(element);
  } else if (element instanceof HTMLInputElement) {
    if (element.type === 'file') {
      // Browsers reject `.value = anything-non-empty` for security; assigning
      // an empty DataTransfer's FileList is the standards-track way to clear.
      try { element.files = new DataTransfer().files; } catch { /* ignore */ }
      element.dispatchEvent(new Event('input',  { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    if (nativeInputSetter) nativeInputSetter.call(element, '');
    else element.value = '';
    dispatchEvents(element);
  }
}

export function clearFieldValue(element: HTMLElement): void {
  setEmpty(element);
  // React (and some other frameworks) reconcile synchronously inside the
  // dispatched input event and can restore the filled value before control
  // returns here.  A microtask runs after that synchronous re-render and
  // applies the clear a second time, ensuring the field stays empty.
  queueMicrotask(() => setEmpty(element));
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

// Reconstructs a real File from the stored {name, size, base64-data-URL}
// payload and assigns it to a file input via DataTransfer. Returns true on
// success, false on any reconstruction or assignment failure (so the caller
// can avoid counting the field as filled). Never throws.
export async function fillFileField(
  element: HTMLInputElement,
  fileData: DocumentFile,
): Promise<boolean> {
  try {
    // 1. Parse the data URL — expected shape: "data:<mime>;base64,<payload>"
    const dataUrl = fileData.base64;
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx < 0) {
      console.warn('[Job Buddy] CV base64 is not a data URL — cannot reconstruct File');
      return false;
    }
    const prefix  = dataUrl.slice(0, commaIdx);
    const payload = dataUrl.slice(commaIdx + 1);

    const mimeMatch = prefix.match(/^data:([^;]+);base64$/);
    if (!mimeMatch || !payload) {
      console.warn('[Job Buddy] CV data URL prefix unrecognised — cannot reconstruct File');
      return false;
    }
    const mimeType = mimeMatch[1];

    // 2. Decode base64 → Uint8Array
    const binary = atob(payload);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    // 3. Reconstruct File and attach via DataTransfer
    const blob = new Blob([bytes], { type: mimeType });
    const file = new File([blob], fileData.name, { type: mimeType });
    const dt   = new DataTransfer();
    dt.items.add(file);
    element.files = dt.files;

    // 4. Notify the page's framework
    element.dispatchEvent(new Event('input',  { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  } catch (err) {
    console.warn('[Job Buddy] File upload reconstruction failed:', err);
    return false;
  }
}

const nativeCheckedSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')?.set;

export function fillRadioInput(element: HTMLInputElement): void {
  if (nativeCheckedSetter) nativeCheckedSetter.call(element, true);
  else element.checked = true;
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new Event('input',  { bubbles: true }));
}

export function fillCheckboxInput(element: HTMLInputElement): void {
  if (nativeCheckedSetter) nativeCheckedSetter.call(element, true);
  else element.checked = true;
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new Event('input',  { bubbles: true }));
}
