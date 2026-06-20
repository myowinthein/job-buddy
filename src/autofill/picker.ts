import type { Profile } from '../types/profile';
import { COUNTRIES } from '../data/countries';
import { getProfile } from '../utils/storage';
import { resolveProfileValue } from './resolver';

// All styles are inline — no Tailwind, no external CSS — to avoid host page conflicts.

let activePicker: HTMLElement | null = null;
let activePickerElement: HTMLElement | null = null;
let activeScrollHandler: (() => void) | null = null;
let scrollRafId: number | null = null;
// Preserved across picker close/reopen so tab-switching doesn't reset scroll.
let savedScrollState: { element: HTMLElement; scrollTop: number } | null = null;

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
  // Save list scroll position keyed to the active element so it can be
  // restored when the same picker reopens (e.g. returning from another tab).
  if (activePicker && activePickerElement) {
    const list = activePicker.querySelector('ul');
    if (list) {
      savedScrollState = { element: activePickerElement, scrollTop: list.scrollTop };
    }
  }

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
  activePickerElement = null;
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

type PickerFieldDef =
  | { path: string; label: string }
  | { compute: (profile: Profile) => PickerOption[] };

const WORK_AUTH_LABELS: Record<string, string> = {
  citizen_or_pr:        'Citizen / PR',
  work_visa:            'Work Visa',
  requires_sponsorship: 'Requires Sponsorship',
};

function getCountryName(code: string): string {
  return COUNTRIES.find(c => c.code === code)?.name ?? code;
}

function formatAmount(amount: number): string {
  return Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatSalary(amount: number | undefined | null, currency: string | undefined | null): string {
  if (amount == null) return '';
  const amtStr = formatAmount(amount);
  return currency ? `${amtStr} ${currency}` : amtStr;
}

// Grouped in the same order as the Options page sidebar sections.
// Path entries are resolved via resolveProfileValue(); compute entries return
// zero or more options for dynamic / multi-value / formatted fields.
const PICKER_SECTIONS: Array<{ sectionLabel: string; fields: PickerFieldDef[] }> = [
  {
    sectionLabel: 'Personal',
    fields: [
      { path: 'personal.firstName',        label: 'First Name'        },
      { path: 'personal.lastName',         label: 'Last Name'         },
      { path: 'derived.fullName',          label: 'Full Name'         },
      { path: 'personal.email',            label: 'Email'             },
      { compute: (profile) => {
        const phone = profile.personal?.phone;
        const opts: PickerOption[] = [];
        if (phone?.callingCode) opts.push({ label: 'Phone Extension', fieldPath: 'personal.phone.callingCode', value: phone.callingCode });
        if (phone?.number)      opts.push({ label: 'Phone Number',    fieldPath: 'personal.phone.number',      value: phone.number      });
        if (phone?.callingCode && phone?.number) {
          opts.push({ label: 'Full Phone', fieldPath: 'personal.phone.full', value: `${phone.callingCode} ${phone.number}` });
        }
        return opts;
      }},
      { compute: (profile) => {
        const dob = profile.personal?.dateOfBirth;
        if (!dob) return [];
        const [year, month, day] = dob.split('-');
        const opts: PickerOption[] = [];
        if (day)   opts.push({ label: 'Day',              fieldPath: 'personal.dateOfBirth.day',   value: day   });
        if (month) opts.push({ label: 'Month',            fieldPath: 'personal.dateOfBirth.month', value: month });
        if (year)  opts.push({ label: 'Year',             fieldPath: 'personal.dateOfBirth.year',  value: year  });
                   opts.push({ label: 'Full Date of Birth', fieldPath: 'personal.dateOfBirth',      value: dob   });
        return opts;
      }},
      { path: 'derived.age',               label: 'Age'               },
      { path: 'personal.gender',           label: 'Gender'            },
      { path: 'personal.ethnicity',        label: 'Ethnicity'         },
      { path: 'personal.veteranStatus',    label: 'Veteran Status'    },
      { path: 'personal.disabilityStatus', label: 'Disability Status' },
    ],
  },
  {
    sectionLabel: 'Address',
    fields: [
      { path: 'address.street',     label: 'Street'           },
      { path: 'address.city',       label: 'City'             },
      { compute: (profile) => {
        const code = profile.address?.country;
        if (!code) return [];
        return [{ label: 'Country', fieldPath: 'address.countryName', value: getCountryName(code) }];
      }},
      { path: 'address.state',      label: 'State / Province' },
      { path: 'address.postalCode', label: 'Postal Code'      },
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
      { compute: (profile) => {
        const cur = profile.salary?.current;
        const opts: PickerOption[] = [];
        if (cur?.currency)    opts.push({ label: 'Currency',          fieldPath: 'salary.current.currency',   value: cur.currency           });
        if (cur?.amount != null) opts.push({ label: 'Amount',         fieldPath: 'salary.current.amount',     value: String(cur.amount)     });
        if (cur?.amount != null && cur?.currency) {
          opts.push({ label: 'Full Current Salary', fieldPath: 'salary.current.formatted', value: formatSalary(cur.amount, cur.currency) });
        }
        return opts;
      }},
      { compute: (profile) => {
        const expected = profile.salary?.expected;
        if (!expected?.length) return [];
        return expected.flatMap((entry, idx) => {
          const value = formatSalary(entry.amount, entry.currency);
          if (!value) return [];
          const name   = entry.country ? getCountryName(entry.country) : '';
          const suffix = name ? ` — ${name}` : '';
          return [{ label: `Expected Salary${suffix}`, fieldPath: `salary.expected.${idx}.formatted`, value }];
        });
      }},
    ],
  },
  {
    sectionLabel: 'Work Authorization',
    fields: [
      { compute: (profile) => {
        const entries = profile.workAuthorization;
        if (!entries?.length) return [];
        return entries.map((entry, idx) => ({
          label:     `Work Authorization — ${getCountryName(entry.country)}`,
          fieldPath: `workAuthorization.${idx}`,
          value:     WORK_AUTH_LABELS[entry.status] ?? entry.status,
        }));
      }},
    ],
  },
  {
    sectionLabel: 'Links',
    fields: [
      { path: 'links.linkedin',  label: 'LinkedIn'  },
      { path: 'links.portfolio', label: 'Portfolio' },
      { compute: (profile) => {
        const custom = profile.links?.custom;
        if (!custom?.length) return [];
        return custom
          .filter(link => link.label && link.url)
          .map((link, idx) => ({
            label:     link.label,
            fieldPath: `links.custom.${idx}.url`,
            value:     link.url,
          }));
      }},
    ],
  },
];

function buildGroupedOptions(profile: Profile): PickerSection[] {
  return PICKER_SECTIONS
    .map(({ sectionLabel, fields }) => ({
      sectionLabel,
      options: fields.flatMap((fieldDef) => {
        if ('compute' in fieldDef) {
          return fieldDef.compute(profile);
        }
        const value = resolveProfileValue(profile, fieldDef.path);
        return value ? [{ label: fieldDef.label, fieldPath: fieldDef.path, value }] : [];
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

  // Restore scroll position when reopening the picker for the same element (tab switching).
  if (savedScrollState?.element === element) {
    list.scrollTop = savedScrollState.scrollTop;
  }

  activePickerElement = element;

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
  onSelect: (element: HTMLElement, fieldPath: string, value: string, originalState: PickerFieldState) => void,
): void {
  for (const { element, state } of fields) {
    // Remove any existing focus listener before adding the new one — prevents
    // duplicate overlays when executeAutofill is called multiple times on the
    // same page without a full reload.
    const prev = pickerListeners.get(element);
    if (prev) element.removeEventListener('focus', prev);

    // Fetch a fresh profile copy on every open so the picker reflects any
    // edits made in other tabs since the last Auto Fill run.
    const handler = async () => {
      const profile = await getProfile();
      if (!profile) return;
      showPicker(element, state, buildGroupedOptions(profile), onSelect);
    };
    element.addEventListener('focus', handler);
    pickerListeners.set(element, handler);
  }
}
