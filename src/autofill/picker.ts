import { getProfile, getThemePreference } from '../utils/storage';
import { extractSignals, bestLabel } from './signals';
import { buildPickerTree } from './profileFieldTree';
import type { OptionRow, Cluster, SubGroup, Section } from './profileFieldTree';

// All styles are inline — no Tailwind, no external CSS — to avoid host page conflicts.

let activePicker:        HTMLElement | null = null;
let activePickerElement: HTMLElement | null = null;
let activeScrollHandler: (() => void) | null = null;
let scrollRafId:         number | null = null;

// Registered on document for "click outside to close". Tracked here so
// removePicker() can tear it down, preventing stale handlers from closing
// a newly-opened picker after a tab switch.
let activeOutsideHandler: ((e: MouseEvent) => void) | null = null;

const pickerListeners = new WeakMap<HTMLElement, () => void>();

// ─── Persistent UI state (per element, for the lifetime of the page) ─────────

interface ExpandState {
  expandedSections:    Set<string>;  // section IDs that are open
  collapsedSubGroups:  Set<string>;  // sub-group headings that are closed (default = open)
}

interface PickerUIState extends ExpandState {
  scrollTop:   number;
  searchQuery: string;
}

// Keyed by the form element. Preserved until the page unloads.
const savedPickerStates = new Map<HTMLElement, PickerUIState>();

// ─── Public types ─────────────────────────────────────────────────────────────

export type PickerFieldState = 'lowConfidence' | 'needReview' | 'noData';

export interface PickerField {
  element: HTMLElement;
  state:   PickerFieldState;
  // Human-readable label derived from the field's signals (label / aria-label /
  // placeholder / name / id). Used by the noData CTA to address the missing
  // value by name (e.g. "No Phone Number saved in your profile yet").
  label:   string;
  // Profile dot-notation path. Only meaningful for state === 'noData', where
  // the "Go to Profile" CTA uses it to deep-link the Options page to the
  // matching section + input. Other states ignore it.
  fieldPath?: string;
}

// ─── Theme ────────────────────────────────────────────────────────────────────
//
// The picker is rendered as inline-style DOM into arbitrary host pages, so it
// cannot rely on Tailwind's `.dark` variant (the host's <html> never gets the
// class). Instead we mirror the extension's themePreference manually:
//
//   - read `themePreference` from chrome.storage.local at module load
//   - subscribe to chrome.storage.onChanged for live updates from other contexts
//   - when preference === 'system', subscribe to prefers-color-scheme so the
//     picker follows the OS in real time
//   - re-render any open picker whenever the effective theme flips

interface PickerTheme {
  cardBg:             string;
  cardBorder:         string;
  cardShadow:         string;
  innerDivider:       string;
  sectionHeaderBg:    string;
  sectionHeaderHover: string;
  sectionHeaderText:  string;
  rowHoverBg:         string;
  primaryText:        string;
  secondaryText:      string;
  tertiaryText:       string;
  currentRowBg:       string;
  currentRowHover:    string;
  currentBadgeBg:     string;
  currentBadgeText:   string;
  buttonBg:           string;
  buttonHoverBg:      string;
  buttonText:         string;
  searchBg:           string;
  searchBgFocus:      string;
  searchBorder:       string;
  searchBorderFocus:  string;
}

const LIGHT_THEME: PickerTheme = {
  cardBg:             '#ffffff',
  cardBorder:         '#e5e7eb',
  cardShadow:         '0 4px 16px -2px rgba(0,0,0,0.12),0 2px 6px -2px rgba(0,0,0,0.06)',
  innerDivider:       '#f3f4f6',
  sectionHeaderBg:    '#f3f4f6',
  sectionHeaderHover: '#e5e7eb',
  sectionHeaderText:  '#374151',
  rowHoverBg:         '#f3f4f6',
  primaryText:        '#111827',
  secondaryText:      '#6b7280',
  tertiaryText:       '#9ca3af',
  currentRowBg:       '#f0fdf4',
  currentRowHover:    '#dcfce7',
  currentBadgeBg:     '#dcfce7',
  currentBadgeText:   '#16a34a',
  buttonBg:           '#2563eb',
  buttonHoverBg:      '#1d4ed8',
  buttonText:         '#ffffff',
  searchBg:           '#f9fafb',
  searchBgFocus:      '#ffffff',
  searchBorder:       '#e5e7eb',
  searchBorderFocus:  '#6366f1',
};

const DARK_THEME: PickerTheme = {
  cardBg:             '#1e293b', // slate-800 (surface)
  cardBorder:         '#334155', // slate-700
  cardShadow:         '0 4px 16px -2px rgba(0,0,0,0.6),0 2px 6px -2px rgba(0,0,0,0.4)',
  innerDivider:       '#334155', // slate-700
  sectionHeaderBg:    '#0f172a', // slate-900 (background — darker stripe inside card)
  sectionHeaderHover: '#1e293b', // slate-800
  sectionHeaderText:  '#cbd5e1', // slate-300
  rowHoverBg:         '#334155', // slate-700 (hover)
  primaryText:        '#f1f5f9', // slate-100
  secondaryText:      '#94a3b8', // slate-400
  tertiaryText:       '#94a3b8', // slate-400 (same as secondary in dark)
  currentRowBg:       '#14532d', // green-900
  currentRowHover:    '#166534', // green-800
  currentBadgeBg:     '#166534', // green-800
  currentBadgeText:   '#86efac', // green-300
  buttonBg:           '#1d4ed8', // blue-700 (selected/active per spec)
  buttonHoverBg:      '#1e40af', // blue-800
  buttonText:         '#ffffff',
  searchBg:           '#0f172a', // slate-900
  searchBgFocus:      '#1e293b', // slate-800
  searchBorder:       '#334155', // slate-700
  searchBorderFocus:  '#3b82f6', // blue-500
};

let isDark = false;
let activeMql:   MediaQueryList | null = null;
let mqlListener: ((e: MediaQueryListEvent) => void) | null = null;

// Captured at showPicker time so we can rebuild the open picker on theme
// change without needing the caller (attachPickerListeners) to re-trigger.
interface ActivePickerSession {
  element:    HTMLElement;
  state:      PickerFieldState;
  label:      string;
  fieldPath?: string;
  onSelect:   (el: HTMLElement, path: string, val: string, st: PickerFieldState) => void;
}
let activeSession: ActivePickerSession | null = null;

function theme(): PickerTheme {
  return isDark ? DARK_THEME : LIGHT_THEME;
}

function teardownMediaListener(): void {
  if (activeMql && mqlListener) {
    try { activeMql.removeEventListener('change', mqlListener); } catch { /* no-op */ }
  }
  activeMql   = null;
  mqlListener = null;
}

function setIsDark(next: boolean): void {
  if (isDark === next) return;
  isDark = next;
  void rerenderActivePicker();
}

function applyThemePreference(pref: 'system' | 'light' | 'dark'): void {
  teardownMediaListener();
  if (pref === 'dark')  { setIsDark(true);  return; }
  if (pref === 'light') { setIsDark(false); return; }
  // 'system' — mirror OS preference and watch for live changes
  try {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setIsDark(mq.matches);
    mqlListener = (e) => setIsDark(e.matches);
    mq.addEventListener('change', mqlListener);
    activeMql = mq;
  } catch {
    setIsDark(false);
  }
}

async function rerenderActivePicker(): Promise<void> {
  if (!activeSession) return;
  const { element, state, label, fieldPath, onSelect } = activeSession;
  const profile = await getProfile();
  if (!profile) return;
  // showPicker calls removePicker first, then re-establishes activeSession.
  showPicker(element, state, label, buildPickerTree(profile), onSelect, fieldPath);
}

// Initialize theme at module load (once per content-script injection).
void (async () => {
  try {
    const pref = await getThemePreference();
    applyThemePreference(pref);
  } catch { /* no-op — picker stays in light mode */ }
})();

try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (!('themePreference' in changes)) return;
    const next = (changes.themePreference.newValue as 'system' | 'light' | 'dark' | undefined) ?? 'system';
    applyThemePreference(next);
  });
} catch { /* no-op — chrome.storage may be unavailable in some contexts */ }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mk(tag: string, css?: Record<string, string>): HTMLElement {
  const e = document.createElement(tag);
  if (css) Object.assign(e.style, css);
  return e;
}

// ─── Signal-based auto-expand ─────────────────────────────────────────────────

function detectAutoExpand(element: HTMLElement): string | null {
  const signals = extractSignals(element);
  const sig = [
    bestLabel(signals),
    signals.name,
    signals.id,
    signals.placeholder,
    signals.autocomplete,
    signals.ariaLabel,
  ].join(' ').toLowerCase();

  if (/salary|compensation|pay|wage|income|ctc|package/.test(sig))                  return 'salary';
  if (/visa|authoris|authoriz|permit|sponsorship|right.to.work/.test(sig))         return 'work-authorization';
  if (/\bwork\b|job|company|employer|position|\brole\b|experience|employment/.test(sig)) return 'work-history';
  if (/education|school|university|college|\bdegree\b|study|academic|qualification/.test(sig)) return 'education';
  if (/phone|mobile|tel\b|cell|calling|extension/.test(sig))                        return 'personal';
  if (/date.of.birth|birth|dob|birthday|\bborn\b/.test(sig))                        return 'personal';
  if (/country|city|state|street|postal|zip|address/.test(sig))                     return 'address';
  if (/language/.test(sig))                                                          return 'languages';
  if (/linkedin|portfolio|github|website|\blink\b/.test(sig))                        return 'links';
  if (/\bname\b|email|gender|veteran|disability|ethnicity/.test(sig))               return 'personal';

  return null;
}

// ─── DOM element builders ─────────────────────────────────────────────────────

// Shared style for inline sub-headings (clusters and sub-group headers).
function subHeadingStyle(t: PickerTheme): Record<string, string> {
  return {
    fontSize:      '10px',
    fontWeight:    '700',
    color:         t.secondaryText,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  };
}

function buildRowEl(
  r: OptionRow,
  targetEl: HTMLElement,
  state: PickerFieldState,
  currentValue: string,
  indent: boolean,
  onSelect: (el: HTMLElement, path: string, val: string, st: PickerFieldState) => void,
): HTMLElement {
  const t = theme();
  const isCurrent = state === 'needReview' && r.value === currentValue;

  const div = mk('div', {
    padding:         `5px ${indent ? '20px' : '12px'}`,
    cursor:          'pointer',
    backgroundColor: isCurrent ? t.currentRowBg : '',
    display:         'flex',
    alignItems:      'center',
    gap:             '8px',
  });
  div.setAttribute('data-jb-row', '1');
  div.setAttribute('data-search-label', r.label.toLowerCase());

  const labelEl = mk('span', {
    fontSize:     '11px',
    color:        t.tertiaryText,
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
    color:        t.primaryText,
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
      color:           t.currentBadgeText,
      backgroundColor: t.currentBadgeBg,
      padding:         '1px 5px',
      borderRadius:    '4px',
      whiteSpace:      'nowrap',
      flexShrink:      '0',
    });
    badge.textContent = 'current';
    div.appendChild(badge);
  }

  div.addEventListener('mouseenter', () => { div.style.backgroundColor = isCurrent ? t.currentRowHover : t.rowHoverBg; });
  div.addEventListener('mouseleave', () => { div.style.backgroundColor = isCurrent ? t.currentRowBg    : ''; });
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
  const t = theme();
  const wrapper = mk('div');
  wrapper.setAttribute('data-jb-cluster', '1');

  const heading = mk('div', {
    ...subHeadingStyle(t),
    padding:   '5px 12px 2px',
    borderTop: `1px solid ${t.innerDivider}`,
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
  initialExpanded: boolean,
  onSelect: (el: HTMLElement, path: string, val: string, st: PickerFieldState) => void,
): HTMLElement {
  const t = theme();
  const wrapper = mk('div');
  wrapper.setAttribute('data-jb-subgroup', '1');

  const header = mk('div', {
    ...subHeadingStyle(t),
    padding:        '5px 12px 5px 16px',
    cursor:         'pointer',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'space-between',
    borderTop:      `1px solid ${t.innerDivider}`,
    userSelect:     'none',
  });
  header.setAttribute('data-jb-subgroup-header', '1');

  const headingText = mk('span');
  headingText.textContent = sg.heading;

  const chevron = mk('span', { fontSize: '9px', color: t.tertiaryText, marginLeft: '6px', flexShrink: '0' });
  chevron.textContent = initialExpanded ? '▾' : '▸';

  header.appendChild(headingText);
  header.appendChild(chevron);
  wrapper.appendChild(header);

  const body = mk('div');
  body.setAttribute('data-jb-subgroup-body', '1');
  body.style.display = initialExpanded ? '' : 'none';

  for (const r of sg.rows) {
    body.appendChild(buildRowEl(r, targetEl, state, currentValue, true, onSelect));
  }
  wrapper.appendChild(body);

  header.addEventListener('mouseenter', () => { header.style.backgroundColor = t.rowHoverBg; });
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
  openState: ExpandState,
  isFirst: boolean,
  onSelect: (el: HTMLElement, path: string, val: string, st: PickerFieldState) => void,
): HTMLElement {
  const t = theme();
  const isExpanded = openState.expandedSections.has(section.id);

  const wrapper = mk('div');
  wrapper.setAttribute('data-jb-section', '1');
  wrapper.setAttribute('data-section-id', section.id);

  const header = mk('div', {
    padding:         '6px 12px',
    cursor:          'pointer',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'space-between',
    backgroundColor: t.sectionHeaderBg,
    borderTop:       isFirst ? 'none' : `1px solid ${t.cardBorder}`,
    fontSize:        '11px',
    fontWeight:      '700',
    color:           t.sectionHeaderText,
    textTransform:   'uppercase',
    letterSpacing:   '0.06em',
    userSelect:      'none',
  });
  header.setAttribute('data-jb-section-header', '1');

  const headingText = mk('span');
  headingText.textContent = section.label;

  const chevron = mk('span', { fontSize: '10px', color: t.tertiaryText, marginLeft: '4px', flexShrink: '0' });
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
      const sgExpanded = !openState.collapsedSubGroups.has(item.heading);
      body.appendChild(buildSubGroupEl(item, targetEl, state, currentValue, sgExpanded, onSelect));
    }
  }

  wrapper.appendChild(body);

  header.addEventListener('mouseenter', () => { header.style.backgroundColor = t.sectionHeaderHover; });
  header.addEventListener('mouseleave', () => { header.style.backgroundColor = t.sectionHeaderBg; });
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
  restoreOnClear: ExpandState,   // state to restore when clearing search
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
      // Restore to the open-time state
      section.style.display = '';
      allRows.forEach(r => { r.style.display = ''; });
      section.querySelectorAll<HTMLElement>('[data-jb-cluster]').forEach(c => { c.style.display = ''; });
      section.querySelectorAll<HTMLElement>('[data-jb-subgroup]').forEach(sg => {
        sg.style.display = '';
        const headingEl = sg.querySelector<HTMLElement>('[data-jb-subgroup-header] span:first-child');
        const heading   = headingEl?.textContent ?? '';
        const sgBody    = sg.querySelector<HTMLElement>('[data-jb-subgroup-body]');
        const sgChevron = sg.querySelector<HTMLElement>('[data-jb-subgroup-header] span:last-child');
        const collapsed = restoreOnClear.collapsedSubGroups.has(heading);
        if (sgBody)    sgBody.style.display  = collapsed ? 'none' : '';
        if (sgChevron) sgChevron.textContent = collapsed ? '▸' : '▾';
      });
      const exp = restoreOnClear.expandedSections.has(sectionId);
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

    // Sub-groups: show and expand if any child row matches
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

// ─── State capture ────────────────────────────────────────────────────────────

function captureExpandState(pickerEl: HTMLElement): ExpandState {
  const expandedSections = new Set<string>();
  pickerEl.querySelectorAll<HTMLElement>('[data-jb-section]').forEach(section => {
    const sectionId   = section.getAttribute('data-section-id') ?? '';
    const sectionBody = section.querySelector<HTMLElement>('[data-jb-section-body]');
    if (sectionBody && sectionBody.style.display !== 'none') {
      expandedSections.add(sectionId);
    }
  });

  const collapsedSubGroups = new Set<string>();
  pickerEl.querySelectorAll<HTMLElement>('[data-jb-subgroup]').forEach(sg => {
    const sgBody    = sg.querySelector<HTMLElement>('[data-jb-subgroup-body]');
    const headingEl = sg.querySelector<HTMLElement>('[data-jb-subgroup-header] span:first-child');
    if (sgBody && sgBody.style.display === 'none' && headingEl?.textContent) {
      collapsedSubGroups.add(headingEl.textContent);
    }
  });

  return { expandedSections, collapsedSubGroups };
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
  // Remove the outside-click handler immediately so stale references can't
  // accidentally close a newly-created picker.
  if (activeOutsideHandler) {
    document.removeEventListener('mousedown', activeOutsideHandler, true);
    activeOutsideHandler = null;
  }

  // Save current UI state before tearing down DOM.
  if (activePicker && activePickerElement) {
    const pickerBody  = activePicker.querySelector<HTMLElement>('[data-jb-picker-body]');
    const searchInput = activePicker.querySelector<HTMLInputElement>('input[type="text"]');
    const expandState = captureExpandState(activePicker);
    savedPickerStates.set(activePickerElement, {
      scrollTop:          pickerBody?.scrollTop ?? 0,
      searchQuery:        searchInput?.value ?? '',
      expandedSections:   expandState.expandedSections,
      collapsedSubGroups: expandState.collapsedSubGroups,
    });
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
  activeSession        = null;
}

// ─── Outside-click registration ───────────────────────────────────────────────

// Wraps the zero-delay setTimeout pattern used to register the outside-click
// handler after the current event loop turn, so the focus/click that opened
// the picker is not immediately treated as an "outside" click.
function registerOutsideClickHandler(): void {
  setTimeout(() => {
    if (activeOutsideHandler) {
      document.addEventListener('mousedown', activeOutsideHandler, true);
    }
  }, 0);
}

// ─── showPicker ───────────────────────────────────────────────────────────────

// Compact CTA used when state === 'noData'. Replaces the normal profile-tree
// list with a message and a button that asks the background to open the
// Options page. Uses the same inline-style approach as the rest of the picker
// so it works on any host page without bleed from host CSS.
//
// When fieldPath is provided, the CTA writes it to chrome.storage.session
// before dispatching OPEN_OPTIONS, so the Options page can scroll to and
// focus the exact missing input. Without a path, the Options page just opens
// to the user's last visited section.
function showNoDataCta(element: HTMLElement, label: string, fieldPath?: string): void {
  const t = theme();
  const rect = element.getBoundingClientRect();

  const picker = mk('div');
  picker.id = 'job-buddy-picker';
  Object.assign(picker.style, {
    position:        'fixed',
    zIndex:          '2147483647',
    top:             '-9999px',
    left:            `${Math.max(0, rect.left)}px`,
    width:           '280px',
    backgroundColor: t.cardBg,
    border:          `1px solid ${t.cardBorder}`,
    borderRadius:    '8px',
    boxShadow:       t.cardShadow,
    fontFamily:      'system-ui,-apple-system,sans-serif',
    fontSize:        '13px',
    padding:         '14px',
    visibility:      'hidden',
  });

  const title = mk('div', {
    fontSize:   '13px',
    fontWeight: '600',
    color:      t.primaryText,
    marginBottom: '4px',
    whiteSpace: 'nowrap',
    overflow:   'hidden',
    textOverflow: 'ellipsis',
  });
  title.textContent = `${label} not in profile`;
  picker.appendChild(title);

  const help = mk('div', {
    fontSize:    '12px',
    color:       t.secondaryText,
    marginBottom: '12px',
    lineHeight:  '1.4',
    whiteSpace:  'nowrap',
  });
  help.textContent = "Add it to your profile to fill next time.";
  picker.appendChild(help);

  const button = document.createElement('button');
  button.type = 'button';
  Object.assign(button.style, {
    width:           '100%',
    padding:         '7px 10px',
    backgroundColor: t.buttonBg,
    color:           t.buttonText,
    border:          'none',
    borderRadius:    '6px',
    fontSize:        '12px',
    fontWeight:      '600',
    cursor:          'pointer',
    fontFamily:      'inherit',
  });
  button.textContent = 'Go to Profile →';
  button.addEventListener('mouseenter', () => { button.style.backgroundColor = t.buttonHoverBg; });
  button.addEventListener('mouseleave', () => { button.style.backgroundColor = t.buttonBg; });
  button.addEventListener('mousedown', (e) => {
    e.preventDefault();
    // Pass focusPath through the background so the background can write to
    // chrome.storage.session — content scripts cannot write to session storage
    // without host_permissions for the page URL, but the service worker can.
    try {
      chrome.runtime.sendMessage({ action: 'OPEN_OPTIONS', focusPath: fieldPath });
    } catch (err) {
      console.warn('[Job Buddy] OPEN_OPTIONS dispatch failed:', err);
    }
  });
  picker.appendChild(button);

  document.body.appendChild(picker);
  activePickerElement = element;

  // Position
  const ph = picker.offsetHeight;
  const topAbove = rect.top - ph - 4;
  picker.style.top        = (topAbove >= 0 ? topAbove : rect.bottom + 4) + 'px';
  picker.style.visibility = '';
  activePicker = picker;

  // Reposition on scroll / resize
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
  activeOutsideHandler = (e: MouseEvent) => {
    if (!activePicker) return;
    const target = e.target as Node;
    if (activePicker.contains(target))         return;
    if (activePickerElement?.contains(target)) return;
    removePicker();
  };
  registerOutsideClickHandler();
}

function showPicker(
  element: HTMLElement,
  state: PickerFieldState,
  label: string,
  tree: Section[],
  onSelect: (element: HTMLElement, fieldPath: string, value: string, originalState: PickerFieldState) => void,
  fieldPath?: string,
): void {
  removePicker();

  // Snapshot the call so the theme change handler can rebuild from scratch.
  activeSession = { element, state, label, fieldPath, onSelect };

  // For noData fields the user cannot pick anything — the profile is missing
  // the data entirely. Show a CTA pointing them to the Options page instead
  // of a generic profile-value list. Silent re-fill on tab refocus (see
  // index.ts) handles the field automatically once the value is saved.
  if (state === 'noData') {
    showNoDataCta(element, label, fieldPath);
    return;
  }

  const t = theme();
  const rect = element.getBoundingClientRect();
  const currentValue =
    element instanceof HTMLInputElement    ? element.value :
    element instanceof HTMLTextAreaElement ? element.value :
    element instanceof HTMLSelectElement   ? element.value : '';

  const autoExpandId = detectAutoExpand(element);

  // Determine the expand state to open with. Saved state takes priority over
  // the auto-expand default so the picker feels like reopening the same panel.
  const saved = savedPickerStates.get(element);

  // For the default (first-open) state, seed collapsedSubGroups from any
  // subgroup flagged defaultCollapsed (e.g. non-recent Work History entries).
  const defaultCollapsedSubGroups = new Set<string>();
  if (!saved) {
    for (const section of tree) {
      for (const item of section.items) {
        if (item.kind === 'subgroup' && item.defaultCollapsed) {
          defaultCollapsedSubGroups.add(item.heading);
        }
      }
    }
  }

  const openState: PickerUIState = saved ?? {
    scrollTop:          0,
    searchQuery:        '',
    expandedSections:   new Set(autoExpandId ? [autoExpandId] : []),
    collapsedSubGroups: defaultCollapsedSubGroups,
  };

  const picker = mk('div');
  picker.id = 'job-buddy-picker';
  Object.assign(picker.style, {
    position:        'fixed',
    zIndex:          '2147483647',
    top:             '-9999px',
    left:            `${Math.max(0, rect.left)}px`,
    width:           '340px',
    backgroundColor: t.cardBg,
    border:          `1px solid ${t.cardBorder}`,
    borderRadius:    '8px',
    boxShadow:       t.cardShadow,
    fontFamily:      'system-ui,-apple-system,sans-serif',
    fontSize:        '13px',
    overflow:        'hidden',
    userSelect:      'none',
    visibility:      'hidden',
  });

  // Header
  const header = mk('div', {
    padding:       '8px 12px 6px',
    borderBottom:  `1px solid ${t.innerDivider}`,
    color:         t.secondaryText,
    fontSize:      '11px',
    fontWeight:    '600',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  });
  header.textContent = 'Select a value for this field';
  picker.appendChild(header);

  // Search input
  const searchWrap = mk('div', { padding: '6px 10px', borderBottom: `1px solid ${t.innerDivider}` });
  const searchInput = document.createElement('input');
  Object.assign(searchInput.style, {
    width:           '100%',
    boxSizing:       'border-box',
    padding:         '5px 8px',
    border:          `1px solid ${t.searchBorder}`,
    borderRadius:    '5px',
    fontSize:        '12px',
    outline:         'none',
    color:           t.primaryText,
    backgroundColor: t.searchBg,
    fontFamily:      'inherit',
  });
  searchInput.type        = 'text';
  searchInput.placeholder = 'Search…';
  searchWrap.appendChild(searchInput);
  picker.appendChild(searchWrap);

  // Scrollable body
  const pickerBody = mk('div', { overflowY: 'auto', maxHeight: '288px' });
  pickerBody.setAttribute('data-jb-picker-body', '1');

  tree.forEach((section, idx) => {
    pickerBody.appendChild(
      buildSectionEl(section, element, state, currentValue, openState, idx === 0, onSelect)
    );
  });

  const noMatch = mk('div', {
    padding:   '14px 12px',
    textAlign: 'center',
    color:     t.tertiaryText,
    fontSize:  '12px',
    display:   'none',
  });
  noMatch.textContent = 'No matches';
  pickerBody.appendChild(noMatch);

  picker.appendChild(pickerBody);
  document.body.appendChild(picker);

  // Restore saved search (runs applySearch to filter/expand)
  if (openState.searchQuery) {
    searchInput.value = openState.searchQuery;
    applySearch(pickerBody, noMatch, openState.searchQuery, openState);
  }

  // Restore scroll after DOM is fully built
  pickerBody.scrollTop = openState.scrollTop;

  // Search live filtering
  searchInput.addEventListener('input', () => {
    applySearch(pickerBody, noMatch, searchInput.value, openState);
    repositionPicker(element);
  });

  searchInput.addEventListener('focus', () => { searchInput.style.borderColor = t.searchBorderFocus; searchInput.style.backgroundColor = t.searchBgFocus; });
  searchInput.addEventListener('blur',  () => { searchInput.style.borderColor = t.searchBorder;      searchInput.style.backgroundColor = t.searchBg; });

  activePickerElement = element;

  // Position (above the field if room, otherwise below)
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

  // Dismiss on outside mousedown only. Delay registration so the focus event
  // that triggered showPicker doesn't immediately dismiss the picker.
  // Clicking the owning input while the picker is open should keep the picker
  // open (not close and re-open it). Exclude the owning element from the
  // "outside" definition so the outsideHandler only fires for genuine outside clicks.
  activeOutsideHandler = (e: MouseEvent) => {
    if (!activePicker) return;
    const target = e.target as Node;
    if (activePicker.contains(target))         return; // click inside picker
    if (activePickerElement?.contains(target)) return; // click on the owning input
    removePicker();
  };
  registerOutsideClickHandler();
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function removePickerListener(element: HTMLElement): void {
  const prev = pickerListeners.get(element);
  if (prev) {
    element.removeEventListener('focus', prev);
    pickerListeners.delete(element);
  }
}

// Forcibly closes the picker if it is currently open for the given element.
// Used by silent re-fill (index.ts) — when a noData field is resolved while
// its picker CTA happens to be open, that CTA is no longer accurate and
// should disappear together with the (now successful) silent fill.
export function closePickerIfOpenFor(element: HTMLElement): void {
  if (activePicker && activePickerElement === element) removePicker();
}

export function attachPickerListeners(
  fields: PickerField[],
  onSelect: (element: HTMLElement, fieldPath: string, value: string, originalState: PickerFieldState) => void,
): void {
  for (const { element, state, label, fieldPath } of fields) {
    const prev = pickerListeners.get(element);
    if (prev) element.removeEventListener('focus', prev);

    // Fetch fresh profile on every open so cross-tab edits are reflected immediately.
    // Guard: if this element already owns the open picker, do nothing — the user
    // clicked back onto the same input and the picker should stay as-is.
    const handler = async () => {
      if (activePicker && activePickerElement === element) return;
      const profile = await getProfile();
      if (!profile) return;
      showPicker(element, state, label, buildPickerTree(profile), onSelect, fieldPath);
    };
    element.addEventListener('focus', handler);
    pickerListeners.set(element, handler);
  }
}
