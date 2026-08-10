import type { Profile, WorkHistoryEntry, EducationEntry } from '../types/profile';
import { COUNTRIES } from '../data/countries';
import { languageName, LANGUAGE_PROFICIENCY_LABELS } from '../data/languages';
import { WORK_AUTH_STATUS_LABELS } from '../data/workAuthorization';
import { fmtYearMonth } from '../utils/dateFormat';
import { resolveProfileValue } from './resolver';

// Builds a human-labeled tree of every profile field that currently has a
// value, pairing each with its dot-notation path. Pure function of `profile`
// only, no DOM — powers the grouped, searchable field dropdown in the
// Learned Mappings edit UI (SearchableProfileFieldSelect.tsx), the one
// canonical list of valid paths a learned mapping's path can be set to.

export interface OptionRow {
  kind:      'option';
  label:     string;
  fieldPath: string;
  value:     string;
}

// Inline heading + rows, no collapse control (Phone, Date of Birth).
export interface Cluster {
  kind:    'cluster';
  heading: string;
  rows:    OptionRow[];
}

// Collapsible sub-group for multi-entry arrays (Salary, Work History, Education).
// defaultCollapsed = true means collapsed on first open (most entries in Work
// History/Education); the most-recent entry is left at the default (expanded).
export interface SubGroup {
  kind:             'subgroup';
  heading:          string;
  rows:             OptionRow[];
  defaultCollapsed?: boolean;
}

export type SectionItem = OptionRow | Cluster | SubGroup;

export interface Section {
  id:    string;
  label: string;
  items: SectionItem[];
}

function countryName(code: string): string {
  return COUNTRIES.find(c => c.code === code)?.name ?? code;
}

// Returns the index of the most recent entry (isCurrent first, then latest startDate).
export function mostRecentIdx(entries: Array<{ startDate?: string; isCurrent?: boolean }>): number {
  if (!entries.length) return 0;
  const currIdx = entries.findIndex(e => e.isCurrent);
  if (currIdx >= 0) return currIdx;
  let best = 0;
  for (let i = 1; i < entries.length; i++) {
    if ((entries[i].startDate ?? '') > (entries[best].startDate ?? '')) best = i;
  }
  return best;
}

// Shared by workHistoryHeading/educationHeading below: primary/secondary
// field fallback, then start/end-year range fallback, then "Entry N".
function entryHeading(primary: string | undefined, secondary: string | undefined, entry: { startDate?: string; isCurrent?: boolean; endDate?: string }, idx: number): string {
  if (primary && secondary) return `${primary} · ${secondary}`;
  if (primary)   return primary;
  if (secondary) return secondary;
  const sy = entry.startDate?.split('-')[0];
  const ey = entry.isCurrent ? 'Present' : entry.endDate?.split('-')[0];
  if (sy) return ey ? `${sy}–${ey}` : sy;
  return `Entry ${idx + 1}`;
}

function workHistoryHeading(entry: WorkHistoryEntry, idx: number): string {
  return entryHeading(entry.company, entry.title, entry, idx);
}

function educationHeading(entry: EducationEntry, idx: number): string {
  return entryHeading(entry.institution, entry.degree, entry, idx);
}

function row(label: string, fieldPath: string, value: string): OptionRow {
  return { kind: 'option', label, fieldPath, value };
}

export function buildPickerTree(profile: Profile): Section[] {
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
    addPath(items, 'Nickname',          'personal.nickname');
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

  // Salary
  {
    const items: SectionItem[] = [];

    const cur = profile.salary?.current;
    if (cur?.amount != null || cur?.currency) {
      const rows: OptionRow[] = [];
      const full = resolveProfileValue(profile, 'salary.current.formatted');
      if (full)                rows.push(row('Current Salary', 'salary.current.formatted', full));
      if (cur?.amount != null) rows.push(row('Amount',         'salary.current.amount',    String(cur.amount)));
      if (cur?.currency)       rows.push(row('Currency',       'salary.current.currency',  cur.currency));
      if (rows.length) items.push({ kind: 'subgroup', heading: 'Current Salary', rows });
    }

    (profile.salary?.expected ?? []).forEach((entry, idx) => {
      if (!entry.amount && !entry.currency) return;
      const name = entry.country ? countryName(entry.country) : `Entry ${idx + 1}`;
      const rows: OptionRow[] = [];
      const full = resolveProfileValue(profile, `salary.expected.${idx}.formatted`);
      if (full)                rows.push(row('Expected Salary', `salary.expected.${idx}.formatted`, full));
      if (entry.amount != null) rows.push(row('Amount',         `salary.expected.${idx}.amount`,    String(entry.amount)));
      if (entry.currency)       rows.push(row('Currency',       `salary.expected.${idx}.currency`,  entry.currency));
      if (rows.length) items.push({ kind: 'subgroup', heading: `Expected Salary: ${name}`, rows });
    });

    if (items.length) sections.push({ id: 'salary', label: 'Salary', items });
  }

  // Work Authorization — flat rows (label = country name, value = status)
  {
    const items: SectionItem[] = [];
    (profile.workAuthorization ?? []).forEach((entry, idx) => {
      if (!entry.status) return;
      const name   = countryName(entry.country);
      const status = WORK_AUTH_STATUS_LABELS[entry.status] ?? entry.status;
      items.push(row(name, `workAuthorization.${idx}`, status));
    });
    if (items.length) sections.push({ id: 'work-authorization', label: 'Work Authorization', items });
  }

  // Work History
  {
    const entries = profile.workHistory ?? [];
    const items: SectionItem[] = [];
    const recentIdx = mostRecentIdx(entries);

    entries.forEach((entry, idx) => {
      if (!entry.title && !entry.company) return;
      const rows: OptionRow[] = [];

      // Order: Company, Job Title, Location, Work Arrangement, Start Date, End Date, Description
      if (entry.company) rows.push(row('Company',   `workHistory.${idx}.company`, entry.company));
      if (entry.title)   rows.push(row('Job Title', `workHistory.${idx}.title`,   entry.title));

      const locParts: string[] = [];
      if (entry.location?.city)        locParts.push(entry.location.city);
      if (entry.location?.countryCode) locParts.push(countryName(entry.location.countryCode));
      const locStr = locParts.join(', ');
      if (locStr) rows.push(row('Location', `workHistory.${idx}.location`, locStr));

      if (entry.arrangement) {
        const arrLabel = entry.arrangement.charAt(0).toUpperCase() + entry.arrangement.slice(1);
        rows.push(row('Work Arrangement', `workHistory.${idx}.arrangement`, arrLabel));
      }

      const startFmt = entry.startDate ? fmtYearMonth(entry.startDate) : '';
      if (startFmt) rows.push(row('Start Date', `workHistory.${idx}.startDate.formatted`, startFmt));

      // isCurrent → show "Present" as End Date; do not add a separate "Currently Working" row
      const endFmt = entry.isCurrent ? 'Present' : (entry.endDate ? fmtYearMonth(entry.endDate) : '');
      if (endFmt) rows.push(row('End Date', `workHistory.${idx}.endDate.formatted`, endFmt));

      if (entry.description) rows.push(row('Description', `workHistory.${idx}.description`, entry.description));

      if (rows.length) {
        items.push({
          kind:            'subgroup',
          heading:         workHistoryHeading(entry, idx),
          rows,
          defaultCollapsed: idx !== recentIdx,
        });
      }
    });

    if (items.length) sections.push({ id: 'work-history', label: 'Work History', items });
  }

  // Education
  {
    const entries = profile.education ?? [];
    const items: SectionItem[] = [];
    const recentIdx = mostRecentIdx(entries);

    entries.forEach((entry, idx) => {
      if (!entry.degree && !entry.institution) return;
      const rows: OptionRow[] = [];

      // Order: Institution, Degree, Field of Study, Start Date, End Date
      if (entry.institution)  rows.push(row('Institution',    `education.${idx}.institution`,  entry.institution));
      if (entry.degree)       rows.push(row('Degree',         `education.${idx}.degree`,       entry.degree));
      if (entry.fieldOfStudy) rows.push(row('Field of Study', `education.${idx}.fieldOfStudy`, entry.fieldOfStudy));

      const startFmt = entry.startDate ? fmtYearMonth(entry.startDate) : '';
      if (startFmt) rows.push(row('Start Date', `education.${idx}.startDate.formatted`, startFmt));

      // isCurrent → show "Present" as End Date; do not add a separate "Currently Studying" row
      const endFmt = entry.isCurrent ? 'Present' : (entry.endDate ? fmtYearMonth(entry.endDate) : '');
      if (endFmt) rows.push(row('End Date', `education.${idx}.endDate.formatted`, endFmt));

      if (entry.grade)       rows.push(row('Grade / GPA', `education.${idx}.grade`,       entry.grade));
      if (entry.description) rows.push(row('Description', `education.${idx}.description`, entry.description));

      if (rows.length) {
        items.push({
          kind:            'subgroup',
          heading:         educationHeading(entry, idx),
          rows,
          defaultCollapsed: idx !== recentIdx,
        });
      }
    });

    if (items.length) sections.push({ id: 'education', label: 'Education', items });
  }

  // Languages — label = language name, value = proficiency
  {
    const items: SectionItem[] = [];
    (profile.languages ?? []).forEach((entry, idx) => {
      if (!entry.language) return;
      const name = languageName(entry.language);
      const prof = LANGUAGE_PROFICIENCY_LABELS[entry.proficiency] ?? entry.proficiency ?? '';
      items.push(row(name, `languages.${idx}.language`, prof || name));
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
    if (cvUrl) items.push(row('Document URL', 'documents.cv.url', cvUrl));
    if (items.length) sections.push({ id: 'documents', label: 'Documents', items });
  }

  return sections;
}
