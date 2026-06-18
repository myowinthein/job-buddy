import type { Profile } from '../types/profile';
import type { FieldSignals } from './signals';
import { resolveProfileValue } from './resolver';

// All styles are inline — no Tailwind, no external CSS — to avoid host page conflicts.

let activePicker: HTMLElement | null = null;

function removePicker(): void {
  activePicker?.remove();
  activePicker = null;
}

interface PickerOption {
  label:     string;
  fieldPath: string;
  value:     string;
}

const PICKER_FIELDS: Array<{ path: string; label: string }> = [
  { path: 'personal.firstName',            label: 'First Name'          },
  { path: 'personal.lastName',             label: 'Last Name'           },
  { path: 'personal.email',                label: 'Email'               },
  { path: 'personal.phone.number',         label: 'Phone'               },
  { path: 'address.city',                  label: 'City'                },
  { path: 'address.country',              label: 'Country'             },
  { path: 'address.street',               label: 'Street'              },
  { path: 'address.postalCode',           label: 'Postal Code'         },
  { path: 'derived.fullName',             label: 'Full Name'           },
  { path: 'derived.currentTitle',         label: 'Current Title'       },
  { path: 'derived.currentCompany',       label: 'Current Company'     },
  { path: 'derived.totalExperience.years',label: 'Years of Experience' },
  { path: 'derived.age',                  label: 'Age'                 },
  { path: 'links.linkedin',               label: 'LinkedIn'            },
  { path: 'links.portfolio',              label: 'Portfolio'           },
  { path: 'professional.summary',         label: 'Summary'             },
  { path: 'salary.current.amount',        label: 'Current Salary'      },
];

function buildOptions(profile: Profile): PickerOption[] {
  const opts: PickerOption[] = [];
  for (const { path, label } of PICKER_FIELDS) {
    const value = resolveProfileValue(profile, path);
    if (value) opts.push({ label, fieldPath: path, value });
  }
  return opts;
}

function showPicker(
  element: HTMLElement,
  options: PickerOption[],
  onSelect: (element: HTMLElement, fieldPath: string, value: string) => void,
): void {
  removePicker();

  const rect = element.getBoundingClientRect();

  const picker = document.createElement('div');
  picker.id = 'job-buddy-picker';

  // Render hidden first to measure height, then position
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
    padding:         '8px 12px',
    borderBottom:    '1px solid #f3f4f6',
    color:           '#6b7280',
    fontSize:        '11px',
    fontWeight:      '600',
    textTransform:   'uppercase',
    letterSpacing:   '0.05em',
  });
  header.textContent = 'Select a value for this field';
  picker.appendChild(header);

  // Scrollable list
  const list = document.createElement('ul');
  Object.assign(list.style, {
    margin:     '0',
    padding:    '4px 0',
    listStyle:  'none',
    maxHeight:  '200px',
    overflowY:  'auto',
  });

  for (const opt of options) {
    const li = document.createElement('li');
    Object.assign(li.style, {
      padding: '7px 12px',
      cursor:  'pointer',
      color:   '#111827',
    });
    li.textContent = `${opt.label}: ${opt.value}`;
    li.addEventListener('mouseenter', () => { li.style.backgroundColor = '#f3f4f6'; });
    li.addEventListener('mouseleave', () => { li.style.backgroundColor = ''; });
    li.addEventListener('mousedown', (e) => {
      e.preventDefault();
      onSelect(element, opt.fieldPath, opt.value);
      removePicker();
    });
    list.appendChild(li);
  }

  // Skip option
  const skip = document.createElement('li');
  Object.assign(skip.style, {
    padding:     '7px 12px',
    cursor:      'pointer',
    color:       '#9ca3af',
    borderTop:   '1px solid #f3f4f6',
    marginTop:   '2px',
  });
  skip.textContent = 'Skip this field';
  skip.addEventListener('mouseenter', () => { skip.style.backgroundColor = '#f9fafb'; });
  skip.addEventListener('mouseleave', () => { skip.style.backgroundColor = ''; });
  skip.addEventListener('mousedown', (e) => { e.preventDefault(); removePicker(); });
  list.appendChild(skip);

  picker.appendChild(list);
  document.body.appendChild(picker);

  // Measure and position above (or below if no room)
  const ph = picker.offsetHeight;
  const topAbove = rect.top - ph - 4;
  picker.style.top = (topAbove >= 0 ? topAbove : rect.bottom + 4) + 'px';
  picker.style.visibility = '';

  activePicker = picker;

  // Dismiss on outside click
  const outsideHandler = (e: MouseEvent) => {
    if (!picker.contains(e.target as Node)) {
      removePicker();
      document.removeEventListener('mousedown', outsideHandler, true);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', outsideHandler, true), 0);
}

export function attachPickerListeners(
  redFields: Array<{ element: HTMLElement; signals: FieldSignals }>,
  profile: Profile,
  onSelect: (element: HTMLElement, fieldPath: string, value: string) => void,
): void {
  const options = buildOptions(profile);

  for (const { element } of redFields) {
    element.addEventListener('focus', () => showPicker(element, options, onSelect));
  }
}
