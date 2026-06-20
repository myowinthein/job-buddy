import type { Profile } from '../types/profile';
import { resolveProfileValue } from './resolver';

// All styles are inline — no Tailwind, no external CSS — to avoid host page conflicts.

let activePicker: HTMLElement | null = null;
let activeScrollHandler: (() => void) | null = null;
let scrollRafId: number | null = null;

// Tracks the focus handler currently registered on each element so we can
// remove it before adding a new one when executeAutofill runs again.
const pickerListeners = new WeakMap<HTMLElement, () => void>();

function repositionPicker(anchor: HTMLElement): void {
  if (!activePicker) return;
  const rect = anchor.getBoundingClientRect();
  const ph   = activePicker.offsetHeight;
  const topAbove = rect.top - ph - 4;
  activePicker.style.top  = (topAbove >= 0 ? topAbove : rect.bottom + 4) + 'px';
  activePicker.style.left = `${Math.max(0, rect.left)}px`;
}

function removePicker(): void {
  if (activeScrollHandler) {
    window.removeEventListener('scroll', activeScrollHandler, true);
    window.removeEventListener('resize', activeScrollHandler);
    activeScrollHandler = null;
  }
  if (scrollRafId !== null) {
    cancelAnimationFrame(scrollRafId);
    scrollRafId = null;
  }
  activePicker?.remove();
  activePicker = null;
}

interface PickerOption {
  label:     string;
  fieldPath: string;
  value:     string;
}

interface PickerSection {
  sectionLabel: string;
  options:      PickerOption[];
}

export type PickerFieldState = 'lowConfidence' | 'needReview' | 'noData';

export interface PickerField {
  element: HTMLElement;
  state:   PickerFieldState;
}

// Grouped in the same order as the Options page sidebar sections.
const PICKER_SECTIONS: Array<{ sectionLabel: string; fields: Array<{ path: string; label: string }> }> = [
  {
    sectionLabel: 'Personal',
    fields: [
      { path: 'personal.firstName',            label: 'First Name'          },
      { path: 'personal.lastName',             label: 'Last Name'           },
      { path: 'derived.fullName',              label: 'Full Name'           },
      { path: 'personal.email',                label: 'Email'               },
      { path: 'personal.phone.number',         label: 'Phone'               },
      { path: 'derived.age',                   label: 'Age'                 },
    ],
  },
  {
    sectionLabel: 'Address',
    fields: [
      { path: 'address.street',                label: 'Street'              },
      { path: 'address.city',                  label: 'City'                },
      { path: 'address.country',               label: 'Country'             },
      { path: 'address.postalCode',            label: 'Postal Code'         },
    ],
  },
  {
    sectionLabel: 'Work History',
    fields: [
      { path: 'derived.currentTitle',          label: 'Current Title'       },
      { path: 'derived.currentCompany',        label: 'Current Company'     },
      { path: 'derived.totalExperience.years', label: 'Years of Experience' },
      { path: 'professional.summary',          label: 'Summary'             },
    ],
  },
  {
    sectionLabel: 'Salary',
    fields: [
      { path: 'salary.current.amount',         label: 'Current Salary'      },
    ],
  },
  {
    sectionLabel: 'Links',
    fields: [
      { path: 'links.linkedin',                label: 'LinkedIn'            },
      { path: 'links.portfolio',               label: 'Portfolio'           },
    ],
  },
];

function buildGroupedOptions(profile: Profile): PickerSection[] {
  return PICKER_SECTIONS
    .map(({ sectionLabel, fields }) => ({
      sectionLabel,
      options: fields.flatMap(({ path, label }) => {
        const value = resolveProfileValue(profile, path);
        return value ? [{ label, fieldPath: path, value }] : [];
      }),
    }))
    .filter(({ options }) => options.length > 0);
}

function showPicker(
  element: HTMLElement,
  state: PickerFieldState,
  sections: PickerSection[],
  onSelect: (element: HTMLElement, fieldPath: string, value: string, originalState: PickerFieldState) => void,
): void {
  removePicker();

  const rect = element.getBoundingClientRect();
  // Read current field value at open time — used to mark the current value for needReview.
  const currentValue = element instanceof HTMLInputElement    ? element.value
                     : element instanceof HTMLTextAreaElement ? element.value
                     : element instanceof HTMLSelectElement   ? element.value
                     : '';

  const picker = document.createElement('div');
  picker.id = 'job-buddy-picker';

  // Render hidden first to measure height, then position.
  Object.assign(picker.style, {
    position:        'fixed',
    zIndex:          '2147483647',
    top:             '-9999px',
    left:            `${Math.max(0, rect.left)}px`,
    minWidth:        '220px',
    maxWidth:        '360px',
    backgroundColor: '#ffffff',
    border:          '1px solid #e5e7eb',
    borderRadius:    '8px',
    boxShadow:       '0 4px 6px -1px rgba(0,0,0,0.1),0 2px 4px -2px rgba(0,0,0,0.06)',
    fontFamily:      'system-ui,-apple-system,sans-serif',
    fontSize:        '13px',
    overflow:        'hidden',
    userSelect:      'none',
    visibility:      'hidden',
  });

  // Header
  const header = document.createElement('div');
  Object.assign(header.style, {
    padding:       '8px 12px',
    borderBottom:  '1px solid #f3f4f6',
    color:         '#6b7280',
    fontSize:      '11px',
    fontWeight:    '600',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  });
  header.textContent = 'Select a value for this field';
  picker.appendChild(header);

  // Scrollable list
  const list = document.createElement('ul');
  Object.assign(list.style, {
    margin:    '0',
    padding:   '0',
    listStyle: 'none',
    maxHeight: '240px',
    overflowY: 'auto',
  });

  sections.forEach(({ sectionLabel, options }, sectionIndex) => {
    // Section header row
    const sectionLi = document.createElement('li');
    Object.assign(sectionLi.style, {
      padding:         '5px 12px 3px',
      fontSize:        '10px',
      fontWeight:      '600',
      textTransform:   'uppercase',
      letterSpacing:   '0.06em',
      color:           '#9ca3af',
      backgroundColor: '#f9fafb',
      borderTop:       sectionIndex > 0 ? '1px solid #f3f4f6' : 'none',
      pointerEvents:   'none',
    });
    sectionLi.textContent = sectionLabel;
    list.appendChild(sectionLi);

    // Option rows within this section — compact single-line layout
    for (const opt of options) {
      const isCurrent = state === 'needReview' && opt.value === currentValue;
      const li = document.createElement('li');
      Object.assign(li.style, {
        padding:         '6px 12px',
        cursor:          'pointer',
        backgroundColor: isCurrent ? '#f0fdf4' : '',
        display:         'flex',
        alignItems:      'center',
        gap:             '8px',
      });

      // Label (muted, fixed share of row width)
      const labelEl = document.createElement('span');
      Object.assign(labelEl.style, {
        fontSize:     '11px',
        color:        '#9ca3af',
        flex:         '0 0 auto',
        maxWidth:     '45%',
        whiteSpace:   'nowrap',
        overflow:     'hidden',
        textOverflow: 'ellipsis',
      });
      labelEl.textContent = opt.label;
      li.appendChild(labelEl);

      // Value (strong, fills remaining width)
      const valueEl = document.createElement('span');
      Object.assign(valueEl.style, {
        fontSize:     '13px',
        fontWeight:   '500',
        color:        '#111827',
        flex:         '1',
        minWidth:     '0',
        whiteSpace:   'nowrap',
        overflow:     'hidden',
        textOverflow: 'ellipsis',
      });
      valueEl.textContent = opt.value;
      li.appendChild(valueEl);

      if (isCurrent) {
        const badge = document.createElement('span');
        badge.textContent = 'current';
        Object.assign(badge.style, {
          fontSize:        '10px',
          fontWeight:      '600',
          color:           '#16a34a',
          backgroundColor: '#dcfce7',
          padding:         '1px 5px',
          borderRadius:    '4px',
          whiteSpace:      'nowrap',
          flexShrink:      '0',
        });
        li.appendChild(badge);
      }

      li.addEventListener('mouseenter', () => { li.style.backgroundColor = isCurrent ? '#dcfce7' : '#f3f4f6'; });
      li.addEventListener('mouseleave', () => { li.style.backgroundColor = isCurrent ? '#f0fdf4' : ''; });
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        onSelect(element, opt.fieldPath, opt.value, state);
        removePicker();
      });
      list.appendChild(li);
    }
  });

  picker.appendChild(list);
  document.body.appendChild(picker);

  // Initial position (above the field if room, otherwise below).
  const ph = picker.offsetHeight;
  const topAbove = rect.top - ph - 4;
  picker.style.top = (topAbove >= 0 ? topAbove : rect.bottom + 4) + 'px';
  picker.style.visibility = '';

  activePicker = picker;

  // Reposition on scroll or resize so the picker tracks the target field.
  // RAF-throttled to avoid layout thrashing on fast scroll.
  activeScrollHandler = () => {
    if (scrollRafId !== null) return;
    scrollRafId = requestAnimationFrame(() => {
      scrollRafId = null;
      repositionPicker(element);
    });
  };
  window.addEventListener('scroll', activeScrollHandler, { capture: true, passive: true });
  window.addEventListener('resize', activeScrollHandler, { passive: true });

  // Dismiss on outside click.
  const outsideHandler = (e: MouseEvent) => {
    if (!picker.contains(e.target as Node)) {
      removePicker();
      document.removeEventListener('mousedown', outsideHandler, true);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', outsideHandler, true), 0);
}

export function removePickerListener(element: HTMLElement): void {
  const prev = pickerListeners.get(element);
  if (prev) {
    element.removeEventListener('focus', prev);
    pickerListeners.delete(element);
  }
}

export function attachPickerListeners(
  fields: PickerField[],
  profile: Profile,
  onSelect: (element: HTMLElement, fieldPath: string, value: string, originalState: PickerFieldState) => void,
): void {
  const sections = buildGroupedOptions(profile);

  for (const { element, state } of fields) {
    // Remove any existing focus listener before adding the new one — prevents
    // duplicate overlays when executeAutofill is called multiple times on the
    // same page without a full reload.
    const prev = pickerListeners.get(element);
    if (prev) element.removeEventListener('focus', prev);

    const handler = () => showPicker(element, state, sections, onSelect);
    element.addEventListener('focus', handler);
    pickerListeners.set(element, handler);
  }
}
