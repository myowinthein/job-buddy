import type { Profile } from '../types/profile';
import { COUNTRIES } from '../data/countries';
import { getProfile } from '../utils/storage';
import { resolveProfileValue } from './resolver';

// All styles are inline — no Tailwind, no external CSS — to avoid host page conflicts.

let activePicker: HTMLElement | null = null;
let activePickerElement: HTMLElement | null = null;
let activeScrollHandler: (() => void) | null = null;
let scrollRafId: number | null = null;
let savedScrollState: { element: HTMLElement; scrollTop: number } | null = null;

const pickerListeners = new WeakMap<HTMLElement, () => void>();

// ─── Public types ─────────────────────────────────────────────────────────────

export type PickerFieldState = 'lowConfidence' | 'needReview' | 'noData';

export interface PickerField {
  element: HTMLElement;
  state:   PickerFieldState;
}

// ─── Internal tree types ──────────────────────────────────────────────────────

interface OptionRow {
  kind:      'option';
  label:     string;
  fieldPath: string;
  value:     string;
}

// Visual cluster: inline heading + rows, no collapse control (Phone, Date of Birth).
interface Cluster {
  kind:    'cluster';
  heading: string;
  rows:    OptionRow[];
}

// Collapsible sub-group for multi-entry arrays (Expected Salary, Work Auth).
interface SubGroup {
  kind:    'subgroup';
  heading: string;
  rows:    OptionRow[];
}

type SectionItem = OptionRow | Cluster | SubGroup;

interface Section {
  id:    string;
  label: string;
  items: SectionItem[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const WORK_AUTH_LABELS: Record<string, string> = {
  citizen_or_pr:        'Citizen / PR',
  work_visa:            'Work Visa',
  requires_sponsorship: 'Requires Sponsorship',
};

const LANG_PROF_LABELS: Record<string, string> = {
  native_bilingual:     'Native / Bilingual',
  full_professional:    'Full Professional',
  professional_working: 'Professional Working',
  limited_working:      'Limited Working',
  elementary:           'Elementary',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function countryName(code: string): string {
  return COUNTRIES.find(c => c.code === code)?.name ?? code;
}

function fmtAmount(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function fmtSalary(amount?: number | null, currency?: string | null): string {
  if (amount == null) return '';
  return currency ? `${fmtAmount(amount)} ${currency}` : fmtAmount(amount);
}

function row(label: string, fieldPath: string, value: string): OptionRow {
  return { kind: 'option', label, fieldPath, value };
}

function mk(tag: string, css?: Record<string, string>): HTMLElement {
  const e = document.createElement(tag);
  if (css) Object.assign(e.style, css);
  return e;
}

// Reads element signals to pick which section to auto-expand.
function detectAutoExpand(element: HTMLElement): string | null {
  const inp = element as HTMLInputElement;
  const parts: string[] = [
    inp.name ?? '', element.id ?? '', inp.placeholder ?? '',
    inp.autocomplete ?? '', element.getAttribute('aria-label') ?? '',
  ];
  if (element.id) {
    try {
      const lbl = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(element.id)}"]`);
      if (lbl) parts.push(lbl.textContent ?? '');
    } catch { /* ignore bad selectors */ }
  }
  const parent = element.closest('label');
  if (parent) parts.push(parent.textContent ?? '');

  const sig = parts.join(' ').toLowerCase();

  if (/salary|compensation|pay|wage|income|ctc|package/.test(sig))         return 'salary';
  if (/visa|authoris|authoriz|permit|sponsorship|right.to.work/.test(sig)) return 'work-authorization';
  if (/phone|mobile|tel\b|cell|calling|extension/.test(sig))               return 'personal';
  if (/date.of.birth|birth|dob|birthday|\bborn\b/.test(sig))               return 'personal';
  if (/country|city|state|street|postal|zip|address/.test(sig))            return 'address';
  if (/language/.test(sig))                                                 return 'languages';
  if (/linkedin|portfolio|github|website|\blink\b/.test(sig))              return 'links';
  if (/\bname\b|email|gender|veteran|disability|ethnicity/.test(sig))      return 'personal';

  return null;
}

// ─── Tree builder ─────────────────────────────────────────────────────────────

function buildPickerTree(profile: Profile): Section[] {
  const sections: Section[] = [];

  function addPath(items: SectionItem[], label: string, path: string): void {
    const v = resolveProfileValue(profile, path);
    if (v) items.push(row(label, path, v));
  }

  // Personal
  {
    const items: SectionItem[] = [];
    addPath(items, 'First Name',        'personal.firstName');
    addPath(items, 'Last Name',         'personal.lastName');
    addPath(items, 'Full Name',         'derived.fullName');
    addPath(items, 'Email',             'personal.email');
    addPath(items, 'Age',               'derived.age');
    addPath(items, 'Gender',            'personal.gender');
    addPath(items, 'Ethnicity',         'personal.ethnicity');
    addPath(items, 'Veteran Status',    'personal.veteranStatus');
    addPath(items, 'Disability Status', 'personal.disabilityStatus');

    const phone = profile.personal?.phone;
    if (phone?.number || phone?.callingCode) {
      const rows: OptionRow[] = [];
      if (phone.callingCode && phone.number)
        rows.push(row('Full Phone',   'personal.phone.full',        `${phone.callingCode} ${phone.number}`));
      if (phone.callingCode)
        rows.push(row('Country Code', 'personal.phone.callingCode', phone.callingCode));
      if (phone.number)
        rows.push(row('Phone Number', 'personal.phone.number',      phone.number));
      if (rows.length) items.push({ kind: 'cluster', heading: 'Phone', rows });
    }

    const dob = profile.personal?.dateOfBirth;
    if (dob) {
      const [year, month, day] = dob.split('-');
      const rows: OptionRow[] = [row('Date of Birth', 'personal.dateOfBirth', dob)];
      if (day)   rows.push(row('Day',   'personal.dateOfBirth.day',   day));
      if (month) rows.push(row('Month', 'personal.dateOfBirth.month', month));
      if (year)  rows.push(row('Year',  'personal.dateOfBirth.year',  year));
      items.push({ kind: 'cluster', heading: 'Date of Birth', rows });
    }

    if (items.length) sections.push({ id: 'personal', label: 'Personal', items });
  }

  // Address
  {
    const items: SectionItem[] = [];
    addPath(items, 'Street',           'address.street');
    addPath(items, 'City',             'address.city');
    const cc = profile.address?.country;
    if (cc) items.push(row('Country', 'address.countryName', countryName(cc)));
    addPath(items, 'State / Province', 'address.state');
    addPath(items, 'Postal Code',      'address.postalCode');
    if (items.length) sections.push({ id: 'address', label: 'Address', items });
  }

  // Professional
  {
    const items: SectionItem[] = [];
    addPath(items, 'Current Title',       'derived.currentTitle');
    addPath(items, 'Current Company',     'derived.currentCompany');
    addPath(items, 'Years of Experience', 'derived.totalExperience.years');
    addPath(items, 'Summary',             'professional.summary');
    if (items.length) sections.push({ id: 'professional', label: 'Professional', items });
  }

  // Salary
  {
    const items: SectionItem[] = [];

    const cur = profile.salary?.current;
    if (cur?.amount != null || cur?.currency) {
      const rows: OptionRow[] = [];
      const full = fmtSalary(cur?.amount, cur?.currency);
      if (full)              rows.push(row('Current Salary', 'salary.current.formatted', full));
      if (cur?.amount != null) rows.push(row('Amount',   'salary.current.amount',   String(cur.amount)));
      if (cur?.currency)       rows.push(row('Currency', 'salary.current.currency', cur.currency));
      if (rows.length) items.push({ kind: 'subgroup', heading: 'Current Salary', rows });
    }

    (profile.salary?.expected ?? []).forEach((entry, idx) => {
      if (!entry.amount && !entry.currency) return;
      const name = entry.country ? countryName(entry.country) : `Entry ${idx + 1}`;
      const rows: OptionRow[] = [];
      const full = fmtSalary(entry.amount, entry.currency);
      if (full)               rows.push(row('Expected Salary', `salary.expected.${idx}.formatted`, full));
      if (entry.amount != null) rows.push(row('Amount',   `salary.expected.${idx}.amount`,   String(entry.amount)));
      if (entry.currency)       rows.push(row('Currency', `salary.expected.${idx}.currency`, entry.currency));
      if (rows.length) items.push({ kind: 'subgroup', heading: `Expected Salary — ${name}`, rows });
    });

    if (items.length) sections.push({ id: 'salary', label: 'Salary', items });
  }

  // Work Authorization
  {
    const items: SectionItem[] = [];
    (profile.workAuthorization ?? []).forEach((entry, idx) => {
      if (!entry.status) return;
      const name   = countryName(entry.country);
      const status = WORK_AUTH_LABELS[entry.status] ?? entry.status;
      items.push({
        kind:    'subgroup',
        heading: `Work Authorization — ${name}`,
        rows:    [row('Status', `workAuthorization.${idx}`, status)],
      });
    });
    if (items.length) sections.push({ id: 'work-authorization', label: 'Work Authorization', items });
  }

  // Languages
  {
    const items: SectionItem[] = [];
    (profile.languages ?? []).forEach((entry, idx) => {
      if (!entry.language) return;
      const prof = LANG_PROF_LABELS[entry.proficiency] ?? entry.proficiency ?? '';
      // label = proficiency for context; value = language name (what gets filled).
      items.push(row(prof || entry.language, `languages.${idx}.language`, entry.language));
    });
    if (items.length) sections.push({ id: 'languages', label: 'Languages', items });
  }

  // Links
  {
    const items: SectionItem[] = [];
    if (profile.links?.linkedin)  items.push(row('LinkedIn',  'links.linkedin',  profile.links.linkedin));
    if (profile.links?.portfolio) items.push(row('Portfolio', 'links.portfolio', profile.links.portfolio));
    (profile.links?.custom ?? []).filter(l => l.label && l.url).forEach((link, idx) => {
      items.push(row(link.label, `links.custom.${idx}.url`, link.url));
    });
    if (items.length) sections.push({ id: 'links', label: 'Links', items });
  }

  // Documents
  {
    const items: SectionItem[] = [];
    const cvUrl = profile.documents?.cv?.url;
    if (cvUrl) items.push(row('CV URL', 'documents.cv.url', cvUrl));
    if (items.length) sections.push({ id: 'documents', label: 'Documents', items });
  }

  return sections;
}

// ─── DOM element builders ─────────────────────────────────────────────────────

function buildRowEl(
  r: OptionRow,
  targetEl: HTMLElement,
  state: PickerFieldState,
  currentValue: string,
  indent: boolean,
  onSelect: (el: HTMLElement, path: string, val: string, st: PickerFieldState) => void,
): HTMLElement {
  const isCurrent = state === 'needReview' && r.value === currentValue;

  const div = mk('div', {
    padding:         `5px ${indent ? '20px' : '12px'}`,
    cursor:          'pointer',
    backgroundColor: isCurrent ? '#f0fdf4' : '',
    display:         'flex',
    alignItems:      'center',
    gap:             '8px',
  });
  div.setAttribute('data-jb-row', '1');
  div.setAttribute('data-search-label', r.label.toLowerCase());

  const labelEl = mk('span', {
    fontSize:     '11px',
    color:        '#9ca3af',
    flexShrink:   '0',
    maxWidth:     '44%',
    whiteSpace:   'nowrap',
    overflow:     'hidden',
    textOverflow: 'ellipsis',
  });
  labelEl.textContent = r.label;

  const valueEl = mk('span', {
    fontSize:     '13px',
    fontWeight:   '500',
    color:        '#111827',
    flex:         '1',
    minWidth:     '0',
    whiteSpace:   'nowrap',
    overflow:     'hidden',
    textOverflow: 'ellipsis',
  });
  valueEl.textContent = r.value;

  div.appendChild(labelEl);
  div.appendChild(valueEl);

  if (isCurrent) {
    const badge = mk('span', {
      fontSize:        '10px',
      fontWeight:      '600',
      color:           '#16a34a',
      backgroundColor: '#dcfce7',
      padding:         '1px 5px',
      borderRadius:    '4px',
      whiteSpace:      'nowrap',
      flexShrink:      '0',
    });
    badge.textContent = 'current';
    div.appendChild(badge);
  }

  div.addEventListener('mouseenter', () => { div.style.backgroundColor = isCurrent ? '#dcfce7' : '#f3f4f6'; });
  div.addEventListener('mouseleave', () => { div.style.backgroundColor = isCurrent ? '#f0fdf4' : ''; });
  div.addEventListener('mousedown', (e) => {
    e.preventDefault();
    onSelect(targetEl, r.fieldPath, r.value, state);
    removePicker();
  });

  return div;
}

function buildClusterEl(
  cluster: Cluster,
  targetEl: HTMLElement,
  state: PickerFieldState,
  currentValue: string,
  onSelect: (el: HTMLElement, path: string, val: string, st: PickerFieldState) => void,
): HTMLElement {
  const wrapper = mk('div');
  wrapper.setAttribute('data-jb-cluster', '1');

  const heading = mk('div', {
    padding:       '5px 12px 2px',
    fontSize:      '10px',
    fontWeight:    '700',
    color:         '#6366f1',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    borderTop:     '1px solid #f3f4f6',
  });
  heading.textContent = cluster.heading;
  wrapper.appendChild(heading);

  for (const r of cluster.rows) {
    wrapper.appendChild(buildRowEl(r, targetEl, state, currentValue, true, onSelect));
  }

  return wrapper;
}

function buildSubGroupEl(
  sg: SubGroup,
  targetEl: HTMLElement,
  state: PickerFieldState,
  currentValue: string,
  onSelect: (el: HTMLElement, path: string, val: string, st: PickerFieldState) => void,
): HTMLElement {
  const wrapper = mk('div');
  wrapper.setAttribute('data-jb-subgroup', '1');

  const header = mk('div', {
    padding:        '5px 12px 5px 16px',
    cursor:         'pointer',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'space-between',
    borderTop:      '1px solid #f3f4f6',
    fontSize:       '11px',
    fontWeight:     '600',
    color:          '#4b5563',
    userSelect:     'none',
  });
  header.setAttribute('data-jb-subgroup-header', '1');

  const headingText = mk('span');
  headingText.textContent = sg.heading;

  const chevron = mk('span', { fontSize: '9px', color: '#9ca3af', marginLeft: '6px', flexShrink: '0' });
  chevron.textContent = '▾'; // expanded by default

  header.appendChild(headingText);
  header.appendChild(chevron);
  wrapper.appendChild(header);

  const body = mk('div');
  body.setAttribute('data-jb-subgroup-body', '1');
  // expanded by default
  for (const r of sg.rows) {
    body.appendChild(buildRowEl(r, targetEl, state, currentValue, true, onSelect));
  }
  wrapper.appendChild(body);

  header.addEventListener('mouseenter', () => { header.style.backgroundColor = '#f3f4f6'; });
  header.addEventListener('mouseleave', () => { header.style.backgroundColor = ''; });
  header.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const expanded = body.style.display !== 'none';
    body.style.display = expanded ? 'none' : '';
    chevron.textContent = expanded ? '▸' : '▾';
    if (activePickerElement) repositionPicker(activePickerElement);
  });

  return wrapper;
}

function buildSectionEl(
  section: Section,
  targetEl: HTMLElement,
  state: PickerFieldState,
  currentValue: string,
  isExpanded: boolean,
  isFirst: boolean,
  onSelect: (el: HTMLElement, path: string, val: string, st: PickerFieldState) => void,
): HTMLElement {
  const wrapper = mk('div');
  wrapper.setAttribute('data-jb-section', '1');
  wrapper.setAttribute('data-section-id', section.id);

  const header = mk('div', {
    padding:        '6px 12px',
    cursor:         'pointer',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'space-between',
    backgroundColor:'#f3f4f6',
    borderTop:      isFirst ? 'none' : '1px solid #e5e7eb',
    fontSize:       '11px',
    fontWeight:     '700',
    color:          '#374151',
    textTransform:  'uppercase',
    letterSpacing:  '0.06em',
    userSelect:     'none',
  });
  header.setAttribute('data-jb-section-header', '1');

  const headingText = mk('span');
  headingText.textContent = section.label;

  const chevron = mk('span', { fontSize: '10px', color: '#9ca3af', marginLeft: '4px', flexShrink: '0' });
  chevron.textContent = isExpanded ? '▾' : '▸';

  header.appendChild(headingText);
  header.appendChild(chevron);
  wrapper.appendChild(header);

  const body = mk('div');
  body.setAttribute('data-jb-section-body', '1');
  body.style.display = isExpanded ? '' : 'none';

  for (const item of section.items) {
    if (item.kind === 'option') {
      body.appendChild(buildRowEl(item, targetEl, state, currentValue, false, onSelect));
    } else if (item.kind === 'cluster') {
      body.appendChild(buildClusterEl(item, targetEl, state, currentValue, onSelect));
    } else {
      body.appendChild(buildSubGroupEl(item, targetEl, state, currentValue, onSelect));
    }
  }

  wrapper.appendChild(body);

  header.addEventListener('mouseenter', () => { header.style.backgroundColor = '#e5e7eb'; });
  header.addEventListener('mouseleave', () => { header.style.backgroundColor = '#f3f4f6'; });
  header.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const expanded = body.style.display !== 'none';
    body.style.display = expanded ? 'none' : '';
    chevron.textContent = expanded ? '▸' : '▾';
    if (activePickerElement) repositionPicker(activePickerElement);
  });

  return wrapper;
}

// ─── Search ───────────────────────────────────────────────────────────────────

function applySearch(
  pickerBody: HTMLElement,
  noMatchEl: HTMLElement,
  query: string,
  autoExpandId: string | null,
): void {
  const q = query.trim().toLowerCase();
  const sectionEls = pickerBody.querySelectorAll<HTMLElement>('[data-jb-section]');
  let visibleSections = 0;

  sectionEls.forEach((section) => {
    const sectionId   = section.getAttribute('data-section-id') ?? '';
    const sectionBody = section.querySelector<HTMLElement>('[data-jb-section-body]');
    const chevron     = section.querySelector<HTMLElement>('[data-jb-section-header] span:last-child');
    const allRows     = section.querySelectorAll<HTMLElement>('[data-jb-row]');

    if (!q) {
      // Restore default state
      section.style.display  = '';
      allRows.forEach(r => { r.style.display = ''; });
      section.querySelectorAll<HTMLElement>('[data-jb-cluster]').forEach(c => { c.style.display = ''; });
      section.querySelectorAll<HTMLElement>('[data-jb-subgroup]').forEach(sg => {
        sg.style.display = '';
        const sgBody    = sg.querySelector<HTMLElement>('[data-jb-subgroup-body]');
        const sgChevron = sg.querySelector<HTMLElement>('[data-jb-subgroup-header] span:last-child');
        if (sgBody)    sgBody.style.display    = '';
        if (sgChevron) sgChevron.textContent   = '▾';
      });
      const exp = sectionId === autoExpandId;
      if (sectionBody) sectionBody.style.display = exp ? '' : 'none';
      if (chevron)     chevron.textContent        = exp ? '▾' : '▸';
      visibleSections++;
      return;
    }

    // Filter rows by label
    let sectionHasMatch = false;
    allRows.forEach(r => {
      const label   = r.getAttribute('data-search-label') ?? '';
      const matches = label.includes(q);
      r.style.display = matches ? '' : 'none';
      if (matches) sectionHasMatch = true;
    });

    // Clusters: show only if any child row matches
    section.querySelectorAll<HTMLElement>('[data-jb-cluster]').forEach(cluster => {
      const hasVisible = [...cluster.querySelectorAll<HTMLElement>('[data-jb-row]')].some(r => r.style.display !== 'none');
      cluster.style.display = hasVisible ? '' : 'none';
    });

    // SubGroups: show and auto-expand if any child row matches
    section.querySelectorAll<HTMLElement>('[data-jb-subgroup]').forEach(sg => {
      const hasVisible = [...sg.querySelectorAll<HTMLElement>('[data-jb-row]')].some(r => r.style.display !== 'none');
      sg.style.display = hasVisible ? '' : 'none';
      if (hasVisible) {
        const sgBody    = sg.querySelector<HTMLElement>('[data-jb-subgroup-body]');
        const sgChevron = sg.querySelector<HTMLElement>('[data-jb-subgroup-header] span:last-child');
        if (sgBody)    sgBody.style.display  = '';
        if (sgChevron) sgChevron.textContent = '▾';
      }
    });

    if (sectionHasMatch) {
      section.style.display = '';
      if (sectionBody) sectionBody.style.display = '';
      if (chevron)     chevron.textContent        = '▾';
      visibleSections++;
    } else {
      section.style.display = 'none';
    }
  });

  noMatchEl.style.display = visibleSections === 0 && !!q ? '' : 'none';
}

// ─── Positioning ──────────────────────────────────────────────────────────────

function repositionPicker(anchor: HTMLElement): void {
  if (!activePicker) return;
  const rect = anchor.getBoundingClientRect();
  const ph   = activePicker.offsetHeight;
  const topAbove = rect.top - ph - 4;
  activePicker.style.top  = (topAbove >= 0 ? topAbove : rect.bottom + 4) + 'px';
  activePicker.style.left = `${Math.max(0, rect.left)}px`;
}

function removePicker(): void {
  if (activePicker && activePickerElement) {
    const body = activePicker.querySelector<HTMLElement>('[data-jb-picker-body]');
    if (body) savedScrollState = { element: activePickerElement, scrollTop: body.scrollTop };
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
  activePicker         = null;
  activePickerElement  = null;
}

// ─── showPicker ───────────────────────────────────────────────────────────────

function showPicker(
  element: HTMLElement,
  state: PickerFieldState,
  tree: Section[],
  onSelect: (element: HTMLElement, fieldPath: string, value: string, originalState: PickerFieldState) => void,
): void {
  removePicker();

  const rect = element.getBoundingClientRect();
  const currentValue =
    element instanceof HTMLInputElement    ? element.value :
    element instanceof HTMLTextAreaElement ? element.value :
    element instanceof HTMLSelectElement   ? element.value : '';

  const autoExpandId = detectAutoExpand(element);

  const picker = mk('div');
  picker.id = 'job-buddy-picker';
  Object.assign(picker.style, {
    position:        'fixed',
    zIndex:          '2147483647',
    top:             '-9999px',
    left:            `${Math.max(0, rect.left)}px`,
    width:           '340px',
    backgroundColor: '#ffffff',
    border:          '1px solid #e5e7eb',
    borderRadius:    '8px',
    boxShadow:       '0 4px 16px -2px rgba(0,0,0,0.12),0 2px 6px -2px rgba(0,0,0,0.06)',
    fontFamily:      'system-ui,-apple-system,sans-serif',
    fontSize:        '13px',
    overflow:        'hidden',
    userSelect:      'none',
    visibility:      'hidden',
  });

  // ── Header ─────────────────────────────────────────────────────────────────
  const header = mk('div', {
    padding:       '8px 12px 6px',
    borderBottom:  '1px solid #f3f4f6',
    color:         '#6b7280',
    fontSize:      '11px',
    fontWeight:    '600',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  });
  header.textContent = 'Select a value for this field';
  picker.appendChild(header);

  // ── Search ─────────────────────────────────────────────────────────────────
  const searchWrap = mk('div', { padding: '6px 10px', borderBottom: '1px solid #f3f4f6' });
  const searchInput = document.createElement('input');
  Object.assign(searchInput.style, {
    width:           '100%',
    boxSizing:       'border-box',
    padding:         '5px 8px',
    border:          '1px solid #e5e7eb',
    borderRadius:    '5px',
    fontSize:        '12px',
    outline:         'none',
    color:           '#111827',
    backgroundColor: '#f9fafb',
    fontFamily:      'inherit',
  });
  searchInput.type        = 'text';
  searchInput.placeholder = 'Search…';
  searchWrap.appendChild(searchInput);
  picker.appendChild(searchWrap);

  // ── Scrollable body ────────────────────────────────────────────────────────
  const pickerBody = mk('div', { overflowY: 'auto', maxHeight: '288px' });
  pickerBody.setAttribute('data-jb-picker-body', '1');

  tree.forEach((section, idx) => {
    pickerBody.appendChild(
      buildSectionEl(section, element, state, currentValue, section.id === autoExpandId, idx === 0, onSelect)
    );
  });

  const noMatch = mk('div', {
    padding:   '14px 12px',
    textAlign: 'center',
    color:     '#9ca3af',
    fontSize:  '12px',
    display:   'none',
  });
  noMatch.textContent = 'No matches';
  pickerBody.appendChild(noMatch);

  picker.appendChild(pickerBody);
  document.body.appendChild(picker);

  // Restore scroll for same element (e.g. returning from another tab)
  if (savedScrollState?.element === element) {
    pickerBody.scrollTop = savedScrollState.scrollTop;
  }

  // Wire search
  searchInput.addEventListener('input', () => {
    applySearch(pickerBody, noMatch, searchInput.value, autoExpandId);
    repositionPicker(element);
  });

  // Focus state on search input
  searchInput.addEventListener('focus', () => { searchInput.style.borderColor = '#6366f1'; searchInput.style.backgroundColor = '#fff'; });
  searchInput.addEventListener('blur',  () => { searchInput.style.borderColor = '#e5e7eb'; searchInput.style.backgroundColor = '#f9fafb'; });

  activePickerElement = element;

  // Initial position
  const ph = picker.offsetHeight;
  const topAbove = rect.top - ph - 4;
  picker.style.top        = (topAbove >= 0 ? topAbove : rect.bottom + 4) + 'px';
  picker.style.visibility = '';

  activePicker = picker;

  // Reposition on scroll / resize (RAF-throttled)
  activeScrollHandler = () => {
    if (scrollRafId !== null) return;
    scrollRafId = requestAnimationFrame(() => {
      scrollRafId = null;
      repositionPicker(element);
    });
  };
  window.addEventListener('scroll', activeScrollHandler, { capture: true, passive: true });
  window.addEventListener('resize', activeScrollHandler, { passive: true });

  // Dismiss on outside mousedown
  const outsideHandler = (e: MouseEvent) => {
    if (!picker.contains(e.target as Node)) {
      removePicker();
      document.removeEventListener('mousedown', outsideHandler, true);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', outsideHandler, true), 0);
}

// ─── Public API ───────────────────────────────────────────────────────────────

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
    const prev = pickerListeners.get(element);
    if (prev) element.removeEventListener('focus', prev);

    // Fetch fresh profile on every open so cross-tab edits are reflected immediately.
    const handler = async () => {
      const profile = await getProfile();
      if (!profile) return;
      showPicker(element, state, buildPickerTree(profile), onSelect);
    };
    element.addEventListener('focus', handler);
    pickerListeners.set(element, handler);
  }
}
