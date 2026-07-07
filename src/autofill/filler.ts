import type { DocumentFile } from '../types/profile';
import { normalize, similarity, PLACEHOLDER_OPTION_NORMS } from './normalizer';
import { CONF_FUZZY_THRESHOLD } from './constants';

// Capture native setters before any framework can shadow them on instances
const nativeInputSetter    = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,    'value')?.set;
const nativeTextareaSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;

// Matches a YYYY-MM-DD ISO date string (the format the resolver always produces).
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// Reformats an ISO date value to match the format expected by a text input,
// detected from its placeholder attribute. Native date inputs (type="date")
// always receive YYYY-MM-DD unchanged — that is the spec-required value format.
// For text inputs the placeholder may hint MM/DD/YYYY or DD/MM/YYYY; if it
// does, we reformat so masked-input libraries receive the right character order
// and don't leave placeholder fragments like "dd" or "yyyy" unfilled.
function reformatDateForInput(value: string, element: HTMLInputElement): string {
  const m = value.match(ISO_DATE_RE);
  if (!m) return value; // not an ISO date — pass through unchanged
  const [, y, mo, d] = m;
  if (element.type === 'date') return value; // native date input: YYYY-MM-DD is correct
  const ph = element.placeholder.toLowerCase();
  // Capture the separator character (/ - .) between the first two components.
  const mmDd = /mm([/\-.])dd/.exec(ph);
  if (mmDd) return `${mo}${mmDd[1]}${d}${mmDd[1]}${y}`;
  const ddMm = /dd([/\-.])mm/.exec(ph);
  if (ddMm) return `${d}${ddMm[1]}${mo}${ddMm[1]}${y}`;
  return value; // no recognisable format hint — keep YYYY-MM-DD
}

function dispatchEvents(element: HTMLElement): void {
  element.dispatchEvent(new Event('input',  { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new Event('blur',   { bubbles: true }));
}


function isSkippableOption(opt: HTMLOptionElement): boolean {
  if (opt.disabled) return true;
  if (!opt.value) return true;
  return PLACEHOLDER_OPTION_NORMS.has(normalize(opt.text));
}

function fillSelect(select: HTMLSelectElement, value: string): void {
  const normValue = normalize(value);

  // Pass 1: exact value match (raw, case-sensitive)
  for (let i = 0; i < select.options.length; i++) {
    const opt = select.options[i];
    if (isSkippableOption(opt)) continue;
    if (opt.value === value) {
      select.selectedIndex = i;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
  }

  // Pass 2: exact text/label match (raw, case-sensitive)
  for (let i = 0; i < select.options.length; i++) {
    const opt = select.options[i];
    if (isSkippableOption(opt)) continue;
    if (opt.text.trim() === value) {
      select.selectedIndex = i;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
  }

  // Pass 3: normalized value match
  for (let i = 0; i < select.options.length; i++) {
    const opt = select.options[i];
    if (isSkippableOption(opt)) continue;
    if (normalize(opt.value) === normValue) {
      select.selectedIndex = i;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
  }

  // Pass 4: normalized text/label match
  for (let i = 0; i < select.options.length; i++) {
    const opt = select.options[i];
    if (isSkippableOption(opt)) continue;
    if (normalize(opt.text) === normValue) {
      select.selectedIndex = i;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
  }

  // Pass 5: best fuzzy match (safe threshold — only if clearly the right option)
  let bestIndex = -1;
  let bestScore = 0;
  for (let i = 0; i < select.options.length; i++) {
    const opt = select.options[i];
    if (isSkippableOption(opt)) continue;
    const score = Math.max(
      similarity(normalize(opt.text),  normValue),
      similarity(normalize(opt.value), normValue),
    );
    if (score > bestScore) { bestScore = score; bestIndex = i; }
  }
  if (bestScore >= CONF_FUZZY_THRESHOLD && bestIndex >= 0) {
    select.selectedIndex = bestIndex;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

// ── ARIA / custom-component filling ──────────────────────────────────────────

// Fill a contenteditable or role="textbox" element by setting textContent and
// dispatching the InputEvent that React/Vue listen for.
function fillAriaTextbox(element: HTMLElement, value: string): void {
  element.textContent = value;
  element.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new Event('blur',   { bubbles: true }));
}

// Returns true if an aria option element should be skipped (disabled or placeholder).
function isSkippableAriaOption(el: HTMLElement): boolean {
  if (el.getAttribute('aria-disabled') === 'true') return true;
  const text = el.textContent?.trim() ?? '';
  if (!text) return true;
  return PLACEHOLDER_OPTION_NORMS.has(normalize(text));
}

// Finds the best matching option element from a list of ARIA option elements,
// applying the same priority order as fillSelect():
//   1. Exact text match  2. Exact aria-label match
//   3. Normalised text   4. Normalised aria-label
//   5. Fuzzy (≥0.75)     6. No match → null
function findBestAriaOption(options: HTMLElement[], target: string): HTMLElement | null {
  const eligible = options.filter((o) => !isSkippableAriaOption(o));
  if (!target || eligible.length === 0) return null;

  const norm = normalize(target);

  const exactText  = eligible.find((o) => o.textContent?.trim() === target);
  if (exactText) return exactText;

  const exactLabel = eligible.find((o) => (o.getAttribute('aria-label') ?? '').trim() === target);
  if (exactLabel) return exactLabel;

  const normText  = eligible.find((o) => normalize(o.textContent?.trim() ?? '') === norm);
  if (normText) return normText;

  const normLabel = eligible.find((o) => normalize(o.getAttribute('aria-label') ?? '') === norm);
  if (normLabel) return normLabel;

  let best: HTMLElement | null = null;
  let bestScore = 0;
  for (const o of eligible) {
    const s = Math.max(
      similarity(normalize(o.textContent?.trim() ?? ''), norm),
      similarity(normalize(o.getAttribute('aria-label') ?? ''), norm),
    );
    if (s > bestScore) { bestScore = s; best = o; }
  }
  return bestScore >= CONF_FUZZY_THRESHOLD ? best : null;
}

// Polls for [role="option"] elements that appear after the trigger is opened.
// Tries aria-controls/aria-owns first, then nearby DOM, then global portal.
// Returns an empty array if nothing appears within maxMs.
async function waitForListboxOptions(
  trigger: HTMLElement,
  maxMs = 500,
  pollMs = 50,
): Promise<HTMLElement[]> {
  const findOptions = (): HTMLElement[] => {
    const ctrlId = trigger.getAttribute('aria-controls') ?? trigger.getAttribute('aria-owns');
    if (ctrlId) {
      const lb = document.getElementById(ctrlId);
      if (lb) return Array.from(lb.querySelectorAll<HTMLElement>('[role="option"]'));
    }
    const parent = trigger.closest('[role="combobox"]') ?? trigger.parentElement;
    if (parent) {
      const lb = parent.querySelector<HTMLElement>('[role="listbox"]');
      if (lb) return Array.from(lb.querySelectorAll<HTMLElement>('[role="option"]'));
    }
    const global = document.querySelector<HTMLElement>('[role="listbox"]:not([aria-hidden="true"])');
    if (global) return Array.from(global.querySelectorAll<HTMLElement>('[role="option"]'));
    return [];
  };

  const deadline = Date.now() + maxMs;
  while (true) {
    const opts = findOptions();
    if (opts.length > 0) return opts;
    if (Date.now() >= deadline) return [];
    await new Promise<void>((resolve) => setTimeout(resolve, pollMs));
  }
}

// Opens a custom listbox/combobox, waits for options, then clicks the best match.
// Returns true when an option was successfully selected, false otherwise.
// Never throws — graceful no-op on any failure.
async function fillAriaListbox(element: HTMLElement, value: string): Promise<boolean> {
  try {
    element.click();
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    const options = await waitForListboxOptions(element);
    if (options.length === 0) return false;

    const best = findBestAriaOption(options, value);
    if (!best) return false;

    best.click();
    best.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    return true;
  } catch {
    return false;
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
  } else {
    // ARIA custom elements: clear text for textbox/contenteditable;
    // no-op for combobox/listbox (cannot reliably reverse dropdown selection).
    const role = element.getAttribute('role');
    if (role === 'textbox' || element.getAttribute('contenteditable') === 'true') {
      element.textContent = '';
      element.dispatchEvent(new Event('input',  { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }
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
    const fillValue = reformatDateForInput(value, element);
    if (nativeInputSetter) nativeInputSetter.call(element, fillValue);
    else element.value = fillValue;
    dispatchEvents(element);
    return;
  }

  // ARIA custom components
  const role  = element.getAttribute('role');
  const popup = element.getAttribute('aria-haspopup');
  if (role === 'textbox' || element.getAttribute('contenteditable') === 'true') {
    fillAriaTextbox(element, value);
    return;
  }
  if (role === 'combobox' || popup === 'listbox') {
    await fillAriaListbox(element, value);
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

function fillCheckedInput(element: HTMLInputElement): void {
  if (nativeCheckedSetter) nativeCheckedSetter.call(element, true);
  else element.checked = true;
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new Event('input',  { bubbles: true }));
}

export function fillRadioInput(element: HTMLInputElement): void {
  fillCheckedInput(element);
}

export function fillCheckboxInput(element: HTMLInputElement): void {
  fillCheckedInput(element);
}
