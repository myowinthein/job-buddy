function readableReason(reason: string): string {
  if (/API keys and connection settings are not imported/i.test(reason))
    return 'API keys and connection settings cannot be imported.';
  if (/^expected object with countryCode/i.test(reason))
    return 'Phone details are incomplete or invalid.';
  if (/^expected object with name/i.test(reason))
    return 'The saved file is missing its name, size, or contents.';
  if (/^(expected a mapping object|invalid mapping)/i.test(reason))
    return 'Saved field mappings could not be read.';
  const limit = /max (\d+) chars/i.exec(reason);
  if (/^expected a valid LinkedIn URL/i.test(reason)) return 'Use a valid LinkedIn address.';
  if (/^expected a valid URL/i.test(reason))
    return limit
      ? `Use a valid web address with no more than ${limit[1]} characters.`
      : 'Use a valid web address.';
  if (limit) return `Use text with no more than ${limit[1]} characters.`;
  if (/^expected explicit availability/i.test(reason))
    return 'Availability or the notice period is missing or invalid.';
  if (/^expected non-negative number/i.test(reason)) return 'Use a number that is zero or greater.';
  if (/^expected (3-letter uppercase currency code|a known currency)/i.test(reason))
    return 'The currency or salary amount is invalid.';
  if (/^expected string/i.test(reason)) return 'Use text for this detail.';
  if (/^expected\b/i.test(reason)) return 'The selected option is not supported.';
  if (/^missing company, title/i.test(reason)) return 'Work details are incomplete or invalid.';
  if (/^missing institution, degree/i.test(reason))
    return 'Education details are incomplete or invalid.';
  if (/^missing country string/i.test(reason))
    return 'The country or work authorization status is invalid.';
  if (/^missing language string/i.test(reason))
    return 'The language or proficiency level is invalid.';
  if (/^missing label string/i.test(reason)) return 'The link needs a name and web address.';
  if (/^text exceeds editor limits/i.test(reason))
    return 'The text exceeds the field’s character limit.';
  const text = reason.charAt(0).toUpperCase() + reason.slice(1);
  return text && !/[.!?]$/.test(text) ? `${text}.` : text;
}

function warningDetails(warning: string) {
  const separator = warning.indexOf(':');
  if (separator < 1) return { label: warning, reason: '' };
  const label = warning.slice(0, separator).trim();
  return { label, reason: readableReason(warning.slice(separator + 1).trim()) };
}

export function ImportWarnings({
  warnings = [],
  summary,
}: {
  warnings?: string[];
  summary?: string;
}) {
  if (!warnings.length) return null;
  const items = warnings.map(warningDetails);
  return (
    <details className="mt-3 text-xs text-amber-700 dark:text-amber-400">
      <summary className="cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-blue-500">
        {summary ??
          `${warnings.length} ${warnings.length === 1 ? 'item' : 'items'} will be skipped`}
      </summary>
      <div className="mt-3 max-h-44 overflow-y-auto break-words pr-1">
        <dl className="space-y-2.5">
          {items.map((item, index) => (
            <div key={index} className="grid gap-x-4 gap-y-0.5 sm:grid-cols-[9rem_1fr]">
              <dt className="font-medium text-gray-800 dark:text-gray-200">{item.label}</dt>
              {item.reason && <dd className="text-gray-600 dark:text-gray-400">{item.reason}</dd>}
            </div>
          ))}
        </dl>
      </div>
    </details>
  );
}
