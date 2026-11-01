import type { Profile, CurrentSalary, ExpectedSalaryEntry } from '../types/profile';
import type { FieldSignals } from './signals';
import { languageName } from '../data/languages';
import { normalize } from './normalizer';
import { questionText } from './ruleContext';
import { resolveProfileValue } from './resolver';
import { CURRENCIES } from '../data/currencies';
import { COUNTRIES } from '../data/countries';

/** Format an identified profile value for this question, without inventing missing data. */
export function resolveRuleValue(
  profile: Profile,
  path: string,
  signals: FieldSignals,
  fallback?: string | null,
): string {
  const element = signals.element;
  const text = questionText(signals);
  const isSelect =
    element instanceof HTMLSelectElement ||
    element?.getAttribute('role') === 'combobox' ||
    element?.getAttribute('aria-haspopup') === 'listbox';
  if (path === 'address.country') {
    const code = profile.address?.country ?? '';
    const ac = signals.autocomplete?.split(/\s+/).at(-1);
    if (
      element instanceof HTMLSelectElement &&
      [...element.options].some((option) => option.value.toUpperCase() === code.toUpperCase())
    )
      return code;
    return !isSelect && ac === 'country'
      ? code
      : (COUNTRIES.find((country) => country.code === code)?.name ?? code);
  }
  if (path === 'workAuthorization') {
    const entries = profile.workAuthorization ?? [];
    const countries = mentionedCountries(text);
    if (countries.length > 1) return '';
    const relevant =
      countries.length === 1
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
    const sponsorship = /\b(sponsor|sponsorship)\b/i.test(text);
    const negative = /\b(do not|don't|without|no need|not require)\b/i.test(text);
    const answer = sponsorship ? (negative ? authorized : !authorized) : authorized;
    if (isSelect || (element instanceof HTMLInputElement && element.type === 'checkbox'))
      return answer ? 'Yes' : 'No';
    return authorized ? 'Yes, authorized to work' : 'Requires sponsorship';
  }
  const expected = path.match(/^salary\.expected\.(\d+)\.(?:formatted|amount)$/);
  if (expected || /^salary\.current\.(?:formatted|amount)$/.test(path)) {
    let entry: CurrentSalary | ExpectedSalaryEntry | undefined = expected
      ? profile.salary?.expected?.[Number(expected[1])]
      : profile.salary?.current;
    const requestedCurrencies = [...new Set(text.match(/\b[A-Z]{3}\b/g) ?? [])].filter((code) =>
      CURRENCIES.some((currency) => currency.code === code),
    );
    if (requestedCurrencies.length > 1) return '';
    if (requestedCurrencies.length === 1 && entry?.currency !== requestedCurrencies[0]) {
      entry = expected
        ? profile.salary?.expected?.find((item) => item.currency === requestedCurrencies[0])
        : undefined;
    }
    if (!entry?.amount) return '';
    const annual = /\b(annual|annually|year|yearly|year-end|per annum)\b/i.test(text);
    const monthly = /\b(month|monthly)\b/i.test(text);
    if (annual && monthly) return '';
    let amount = entry.amount;
    if (annual && entry.period === 'monthly') amount *= 12;
    if (monthly && entry.period === 'annual') amount /= 12;
    amount = Math.round(amount * 100) / 100;
    if (signals.type === 'number' || path.endsWith('.amount')) return String(amount);
    const formatted = String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return entry.currency ? `${formatted} ${entry.currency}` : formatted;
  }
  const date = path.match(/^(workHistory|education)\.(\d+)\.(startDate|endDate)\.formatted$/);
  if (date && ['month', 'date', 'number'].includes(signals.type)) {
    const entry =
      date[1] === 'education'
        ? profile.education?.[Number(date[2])]
        : profile.workHistory?.[Number(date[2])];
    if (!entry || (date[3] === 'endDate' && entry.isCurrent)) return '';
    const raw = date[3] === 'startDate' ? entry.startDate : (entry.endDate ?? '');
    if (signals.type === 'number') return /^\d{4}(?:-\d{2})?$/.test(raw) ? raw.slice(0, 4) : '';
    if (signals.type === 'month') return /^\d{4}-\d{2}$/.test(raw) ? raw : '';
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
  }
  return fallback !== undefined ? (fallback ?? '') : resolveProfileValue(profile, path);
}

/** Keep the ledger's source entry aligned when a question names its currency. */
export function ruleValuePath(profile: Profile, path: string, signals: FieldSignals): string {
  const expected = path.match(/^salary\.expected\.(\d+)\.(formatted|amount)$/);
  if (!expected) return path;
  const currencies = [...new Set(questionText(signals).match(/\b[A-Z]{3}\b/g) ?? [])].filter(
    (code) => CURRENCIES.some((currency) => currency.code === code),
  );
  if (currencies.length !== 1) return path;
  if (profile.salary?.expected?.[Number(expected[1])]?.currency === currencies[0]) return path;
  const index =
    profile.salary?.expected?.findIndex((entry) => entry.currency === currencies[0]) ?? -1;
  return index >= 0 ? `salary.expected.${index}.${expected[2]}` : path;
}

function mentionedCountries(text: string) {
  const named = COUNTRIES.filter((country) => {
    const escaped = country.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const name = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu');
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
  });
  return named.filter(
    (country) =>
      !named.some(
        (other) =>
          other !== country && other.name.toLowerCase().includes(country.name.toLowerCase()),
      ),
  );
}

/** Resolve all represented languages without splitting comma-bearing labels. */
export function multiSelectValues(profile: Profile, path: string | null, select: HTMLSelectElement): string[] | null {
  if (path !== 'languages.formatted') return null;
  const values: string[] = [];
  for (const language of profile.languages ?? []) {
    const names = [language.language, languageName(language.language)].map(normalize);
    const options = [...select.options].filter(option => !option.disabled && !(option.parentElement instanceof HTMLOptGroupElement && option.parentElement.disabled) && (names.includes(normalize(option.value)) || names.includes(normalize(option.text))));
    if (options.length !== 1) return null;
    values.push(options[0].value);
  }
  return values.length ? values : null;
}
