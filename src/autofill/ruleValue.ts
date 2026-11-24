import { composedParent, controlForm } from './dom';
import { extractSignals, bestLabel } from './signals';
import { mostRecentIdx } from './entryRecency';
import { calendarInput } from './calendarInput';
import type { Profile, CurrentSalary, ExpectedSalaryEntry } from '../types/profile';
import type { FieldSignals } from './signals';
import { languageName } from '../data/languages';
import { normalize } from './normalizer';
import { questionText, visibleQuestion } from './ruleContext';
import { menuSelect } from './menuSelect';
import { resolveProfileValue } from './resolver';
import { CURRENCIES } from '../data/currencies';
import { COUNTRIES, countryName } from '../data/countries';
import { groupThousands, withCurrency } from '../utils/dateFormat';

/** Format an identified profile value for this question, without inventing missing data. */
export function resolveRuleValue(
  profile: Profile,
  path: string,
  signals: FieldSignals,
  fallback?: string | null,
): string {
  const element = signals.element;
  const text = questionText(signals);
  if (headlineQuestion(signals)) {
    if (['professional.summary', 'derived.currentTitle'].includes(path))
      return resolveProfileValue(profile, headlinePath(profile));
    if (/^workHistory\.\d+\.title$/.test(path)) return resolveProfileValue(profile, path);
  }
  if (path === 'address.street' && fullAddressQuestion(signals)) {
    const address = profile.address;
    const parts = [
      address?.street,
      address?.city,
      address?.state,
      address?.postalCode,
      countryName(address?.country ?? ''),
    ];
    const seen = new Set<string>();
    return parts
      .filter((part): part is string => {
        if (!part?.trim() || seen.has(part.trim().toLowerCase())) return false;
        seen.add(part.trim().toLowerCase());
        return true;
      })
      .join(', ');
  }
  // Availability is relative to the day of the write, even if a pending scan
  // was held open across midnight.
  if (isAvailabilityPath(path)) {
    const target = availabilityPath(path, signals);
    if (target.endsWith('.availableDate') || !isAvailabilityText(signals))
      return resolveProfileValue(profile, target);
    const notice = profile.professional?.noticePeriod;
    if (!notice) return '';
    if (notice.immediate) return 'Available immediately.';
    if (!notice.value || notice.value < 0 || !['day', 'week', 'month'].includes(notice.unit ?? ''))
      return '';
    return `Available after ${notice.value} ${notice.unit}${notice.value === 1 ? "'s" : "s'"} notice.`;
  }
  const isSelect =
    signals.type === 'select' ||
    element instanceof HTMLSelectElement ||
    element?.getAttribute('role') === 'combobox' ||
    element?.getAttribute('aria-haspopup') === 'listbox' || !!(element && menuSelect(element));
  if (path === 'address.country') {
    const code = profile.address?.country ?? '';
    const ac = signals.autocomplete?.split(/\s+/).at(-1);
    if (
      element instanceof HTMLSelectElement &&
      [...element.options].some((option) => option.value.toUpperCase() === code.toUpperCase())
    )
      return code;
    return !isSelect && ac === 'country' ? code : countryName(code);
  }
  const authorizationEntry = /^workAuthorization\.(\d+)(?:\.status)?$/.exec(path);
  if (path === 'workAuthorization' || authorizationEntry) {
    const entries = profile.workAuthorization ?? [];
    const countries = mentionedCountries(text);
    if (countries.length > 1) return '';
    const indexed = authorizationEntry ? entries[Number(authorizationEntry[1])] : undefined;
    if (
      authorizationEntry &&
      (!indexed || (countries.length === 1 && indexed.country !== countries[0].code))
    )
      return '';
    const relevant = indexed
      ? [indexed]
      : countries.length === 1
        ? entries.filter((entry) => entry.country === countries[0].code)
        : entries;
    if (
      !relevant.length ||
      new Set(relevant.map((entry) => entry.status === 'requires_sponsorship')).size > 1
    )
      return '';
    const authorized = relevant[0].status !== 'requires_sponsorship';
    if (/\bfuture\b/i.test(text) && relevant.some((entry) => entry.status === 'work_visa'))
      return '';
    const primary = visibleQuestion(signals).split(/(?<=[?!])\s+/)[0];
    // A negation in an employer policy or helper sentence is not the applicant's answer.
    const helperQuestions = (signals.nearbyText ?? '')
      .split(/(?<=[?!.])\s+|\n/)
      .filter(
        (clause) =>
          /\b(?:you|your|I)\b/i.test(clause) && /\b(?:sponsor|sponsorship)\b/i.test(clause),
      );
    const question = /\b(?:sponsor|sponsorship|authori[sz]ed|eligible|right\s+to\s+work)\b/i.test(
      primary,
    )
      ? primary
      : helperQuestions.length === 1
        ? helperQuestions[0]
        : primary;
    const sponsorship = /\b(sponsor|sponsorship)\b/i.test(question);
    const negative =
      /\b(?:do\s+not|don't|will\s+not|won't|not)\s+(?:ever\s+)?(?:need|require)\b[^?.!]*\bsponsor(?:ship)?\b|\bwithout\s+(?:(?:the\s+)?need\s+for\s+|requiring\s+)?(?:(?:any|visa|work|employer|company|additional)\s+)*sponsor(?:ship)?\b|\bno\s+need\s+for\s+(?:visa\s+)?sponsor(?:ship)?\b/i.test(
        question,
      );
    const answer = sponsorship ? (negative ? authorized : !authorized) : authorized;
    if (
      sponsorship ||
      isSelect ||
      (element instanceof HTMLInputElement && element.type === 'checkbox')
    )
      return answer ? 'Yes' : 'No';
    return authorized ? 'Yes, authorized to work' : 'Requires sponsorship';
  }
  const expected = path.match(/^salary\.expected\.(\d+)\.(?:formatted|amount)$/);
  if (expected || /^salary\.current\.(?:formatted|amount)$/.test(path)) {
    let entry: CurrentSalary | ExpectedSalaryEntry | undefined = expected
      ? profile.salary?.expected?.[Number(expected[1])]
      : profile.salary?.current;
    const constraints = salaryConstraints(text);
    if (constraints.unsupported) return '';
    const requestedCurrencies = constraints.currencies;
    if (requestedCurrencies.length > 1) return '';
    if (requestedCurrencies.length === 1 && entry?.currency !== requestedCurrencies[0]) {
      entry = expected
        ? profile.salary?.expected?.find((item) => item.currency === requestedCurrencies[0])
        : undefined;
    }
    if (!entry?.amount) return '';
    if (
      constraints.dollar &&
      ![
        'USD',
        'CAD',
        'AUD',
        'NZD',
        'SGD',
        'HKD',
        'BND',
        'MXN',
        'ARS',
        'CLP',
        'COP',
        'TWD',
      ].includes(entry.currency ?? '')
    )
      return '';
    if (constraints.yen && !['JPY', 'CNY'].includes(entry.currency ?? '')) return '';
    const { annual, monthly } = constraints;
    if (annual && monthly) return '';
    let amount = entry.amount;
    if (annual && entry.period === 'monthly') amount *= 12;
    if (monthly && entry.period === 'annual') amount /= 12;
    amount = Math.round(amount * 100) / 100;
    if (signals.type === 'number' || salaryCurrencySibling(signals)) return String(amount);
    return withCurrency(groupThousands(String(amount)), entry.currency);
  }
  const grade = /^education\.(\d+)\.grade$/.exec(path);
  if (grade && /\b(?:gpa|grade|classification)\b/i.test(visibleQuestion(signals))) {
    const entry = profile.education?.[Number(grade[1])];
    if (!entry?.grade) return '';
    if (['number', 'select', 'select-one'].includes(signals.type)) return entry.grade;
    const element = signals.element;
    const form = element && controlForm(element);
    const root = (form ?? element?.getRootNode()) as ParentNode | undefined;
    const institutionAsked = root && [...root.querySelectorAll<HTMLElement>(
      'input,select,textarea,[role="combobox"],button[data-menu-id]',
    )].some(other => {
      if (other === element || controlForm(other) !== form) return false;
      const label = bestLabel(extractSignals(other)).replace(/\brequired\b|[*:]/gi, '').trim();
      return /^(?:(?:college\s*[/&]\s*university)|(?:(?:name\s+of\s+(?:your\s+)?|your\s+)?(?:college|university|school|institution)(?:\s+name)?))$/i.test(label);
    });
    return entry.institution && !institutionAsked
      ? `${entry.grade} — ${entry.institution}`
      : entry.grade;
  }
  // AI and explicit mappings may name the raw schema path. The input still
  // determines its date representation, just as for a rule's virtual path.
  const date = path.match(/^(workHistory|education)\.(\d+)\.(startDate|endDate)(?:\.formatted)?$/);
  if (date) {
    const entry =
      date[1] === 'education'
        ? profile.education?.[Number(date[2])]
        : profile.workHistory?.[Number(date[2])];
    const hint = signals.placeholder ?? '';
    const yearOnly =
      !/mm|month/i.test(hint) &&
      /\byear\b|\byyyy\b|year(?:graduated|completed|started)/i.test(
        `${visibleQuestion(signals)} ${signals.name}`,
      );
    const monthHint = /^(?:mm([/.-])yyyy|yyyy([/.-])mm)$/i.exec(hint.trim());
    const numericDate =
      ['month', 'date', 'number'].includes(signals.type) || yearOnly || !!monthHint || !!(element && calendarInput(element));
    if (!numericDate)
      return fallback !== undefined ? (fallback ?? '') : resolveProfileValue(profile, path);
    if (!entry || (date[3] === 'endDate' && entry.isCurrent)) return '';
    const raw = date[3] === 'startDate' ? entry.startDate : (entry.endDate ?? '');
    if (element && calendarInput(element)) return /^\d{4}(?:-\d{2})?$/.test(raw) ? raw : '';
    if (signals.type === 'number' || yearOnly)
      return /^\d{4}(?:-\d{2})?$/.test(raw) ? raw.slice(0, 4) : '';
    if (signals.type === 'month') return /^\d{4}-\d{2}$/.test(raw) ? raw : '';
    if (monthHint)
      return /^\d{4}-\d{2}$/.test(raw)
        ? monthHint[1]
          ? `${raw.slice(5)}${monthHint[1]}${raw.slice(0, 4)}`
          : raw.replace('-', monthHint[2])
        : '';
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
  }
  return fallback !== undefined ? (fallback ?? '') : resolveProfileValue(profile, path);
}

/** Keep the source path aligned with the question's representation and currency. */
export function ruleValuePath(profile: Profile, path: string, signals: FieldSignals): string {
  if (headlineQuestion(signals) && ['professional.summary', 'derived.currentTitle'].includes(path))
    return headlinePath(profile);
  if (isAvailabilityPath(path)) return availabilityPath(path, signals);
  const expected = path.match(/^salary\.expected\.(\d+)\.(formatted|amount)$/);
  if (!expected) return path;
  const currencies = salaryConstraints(questionText(signals)).currencies;
  if (currencies.length !== 1) return path;
  if (profile.salary?.expected?.[Number(expected[1])]?.currency === currencies[0]) return path;
  const index =
    profile.salary?.expected?.findIndex((entry) => entry.currency === currencies[0]) ?? -1;
  return index >= 0 ? `salary.expected.${index}.${expected[2]}` : path;
}

function headlineQuestion(signals: FieldSignals): boolean {
  return /\bheadline\b/i.test(visibleQuestion(signals) || `${signals.name} ${signals.id}`);
}
function headlinePath(profile: Profile): string {
  return profile.workHistory?.length
    ? `workHistory.${mostRecentIdx(profile.workHistory)}.title`
    : 'derived.currentTitle';
}
function fullAddressQuestion(signals: FieldSignals): boolean {
  if (signals.autocomplete?.split(/\s+/).at(-1) === 'street-address') return false;
  return (
    /\bfull\s+(?:(?:mailing|postal|home|residential)\s+)?address\b/i.test(
      visibleQuestion(signals),
    ) ||
    (/^address(?:\s*\(optional\))?\s*[*:]?$/i.test((signals.label || signals.ariaLabel).trim()) &&
      /\b(?:city|town)\b/i.test(signals.nearbyText) &&
      /\bcountry\b/i.test(signals.nearbyText))
  );
}

const AVAILABLE_DATE = 'professional.noticePeriod.availableDate';
const NOTICE_DURATION = 'professional.noticePeriod.formatted';
function isAvailabilityPath(path: string): boolean {
  return path === AVAILABLE_DATE || path === NOTICE_DURATION;
}
function availabilityPath(path: string, signals: FieldSignals): string {
  const element = signals.element;
  const hint = signals.placeholder ?? '';
  const dateMask = /d{1,2}/i.test(hint) && /m{1,2}/i.test(hint) && /y{2,4}/i.test(hint);
  const calendar =
    element &&
    (calendarInput(element) ||
      element.hasAttribute('data-datepicker') ||
      element.hasAttribute('data-flatpickr') ||
      /datepicker|date-picker|flatpickr/i.test(element.getAttribute('data-controller') ?? ''));
  if (signals.type === 'date' || /\bdate\b/i.test(visibleQuestion(signals)) || dateMask || calendar)
    return AVAILABLE_DATE;
  return isAvailabilityText(signals) ? NOTICE_DURATION : path;
}
function isAvailabilityText(signals: FieldSignals): boolean {
  const element = signals.element;
  return (
    (element instanceof HTMLTextAreaElement ||
      (element instanceof HTMLInputElement && ['text', 'search'].includes(element.type))) &&
    element.getAttribute('role') !== 'combobox' &&
    element.getAttribute('aria-haspopup') !== 'listbox' &&
    !/\b(?:notice\s+period|period\s+of\s+notice|notice\s+required|notice\s+time)\b/i.test(
      visibleQuestion(signals),
    )
  );
}

function salaryConstraints(text: string) {
  const ambiguousWords = new Set(['ALL', 'TRY', 'TOP', 'MAD', 'PEN', 'CUP', 'GEL']);
  const codes = (text.match(/\b[A-Za-z]{3}\b/g) ?? [])
    .filter(
      (token) =>
        (token === token.toUpperCase() || !ambiguousWords.has(token.toUpperCase())) &&
        CURRENCIES.some((currency) => currency.code === token.toUpperCase()),
    )
    .map((token) => token.toUpperCase());
  for (const [symbol, code] of [
    ['€', 'EUR'],
    ['£', 'GBP'],
    ['₹', 'INR'],
    ['฿', 'THB'],
    ['₱', 'PHP'],
    ['₩', 'KRW'],
    ['₫', 'VND'],
  ] as const)
    if (text.includes(symbol)) codes.push(code);
  const unsupported =
    /\b(hour(?:ly)?|hr|weekly|daily|fortnight(?:ly)?|biweekly|lakh(?:s)?|crore(?:s)?|lpa|thousands?)\b|\bper\s+(?:week|day)\b|\/\s*(?:week|day)\b|\(\s*k\s*\)|\bin\s+k\b|\b0{3}s\b/i.test(
      text,
    );
  const annual =
    /\b(?:annual(?:ly)?|yearly)\b(?!\s+(?:bonus|leave|review|increment|holiday))|\bper\s+(?:annum|year)\b|\/\s*(?:yr|year)\b|\b(?:a|each)\s+year\b|\(\s*year\s*\)/i.test(
      text,
    );
  const monthly =
    /\bmonthly\b(?!\s+(?:bonus|review))|\bper\s+month\b|\/\s*(?:mo|month)\b|\b(?:a|each)\s+month\b|\(\s*month\s*\)/i.test(
      text,
    );
  return {
    currencies: [...new Set(codes)],
    unsupported,
    annual,
    monthly,
    dollar: text.includes('$'),
    yen: /[¥￥]/.test(text),
  };
}

// Compiled once: the country list is frozen and these patterns have no state.
const COUNTRY_NAME_PATTERNS = COUNTRIES.map((country) => {
  const escaped = country.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return {
    country,
    name: new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu'),
  };
});

export function mentionedCountries(text: string) {
  const named = COUNTRY_NAME_PATTERNS.filter(({ country, name }) => {
    const code =
      text.includes(country.code) &&
      new RegExp(`\\b(?:in|for|within)\\s+${country.code}\\b`, 'i').test(text);
    const alias =
      country.code === 'US'
        ? /\bU\.S\.(?:A\.)?|\bUSA\b/i.test(text)
        : country.code === 'GB'
          ? /\bUK\b|\bU\.K\./i.test(text)
          : false;
    return name.test(text) || code || alias;
  }).map(({ country }) => country);
  return named.filter(
    (country) =>
      !named.some(
        (other) =>
          other !== country && other.name.toLowerCase().includes(country.name.toLowerCase()),
      ),
  );
}

/** Resolve all represented languages without splitting comma-bearing labels. */
export function multiSelectValues(
  profile: Profile,
  path: string | null,
  select: HTMLSelectElement,
): string[] | null {
  if (path !== 'languages.formatted') return null;
  const values: string[] = [];
  for (const language of profile.languages ?? []) {
    const names = [language.language, languageName(language.language)].map(normalize);
    const options = [...select.options].filter(
      (option) =>
        !option.disabled &&
        !(option.parentElement instanceof HTMLOptGroupElement && option.parentElement.disabled) &&
        (names.includes(normalize(option.value)) || names.includes(normalize(option.text))),
    );
    if (options.length !== 1) return null;
    values.push(options[0].value);
  }
  return values.length ? values : null;
}

/** A separate currency editor must belong to this salary's local group. */
function salaryCurrencySibling(signals: FieldSignals): boolean {
  const element = signals.element;
  if (!element) return false;
  for (
    let parent = composedParent(element), depth = 0;
    parent && depth < 3;
    parent = composedParent(parent), depth++
  ) {
    if (parent.matches('body,form,[role="form"]')) break;
    const currencies = [...parent.querySelectorAll<HTMLElement>(
      'input,select,button[data-menu-id],[role="combobox"]',
    )].filter(other => {
      if (other === element || controlForm(other) !== controlForm(element)) return false;
      return /^(?:(?:current|expected|previous)\s+)?(?:salary\s+)?currency\s*[*:]?$/i.test(bestLabel(extractSignals(other)));
    });
    if (currencies.length) return currencies.length === 1;
  }
  return false;
}
