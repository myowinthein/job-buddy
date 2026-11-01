function warningDetails(warning: string) {
  const separator = warning.indexOf(':');
  if (separator < 1) return { label: warning, reason: '', technical: '' };
  const label = warning.slice(0, separator).trim();
  const original = warning.slice(separator + 1).trim();
  let reason = original;
  if (/API keys and connection settings are not imported/i.test(original)) reason = 'Not imported.';
  else if (/^Invalid application at position (\d+)$/i.test(original))
    reason = original.replace(
      /^Invalid application at position (\d+)$/i,
      'Entry $1 has an unsupported format.',
    );
  else if (/^expected\b/i.test(original)) reason = 'Unsupported format.';
  return { label, reason, technical: reason !== original ? warning : '' };
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
  const technical = items.flatMap((item) => (item.technical ? [item.technical] : []));
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
        {!!technical.length && (
          <details className="mt-3 text-gray-500 dark:text-gray-400">
            <summary className="cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-blue-500">
              Technical details
            </summary>
            <ul className="mt-2 space-y-1.5">
              {technical.map((message, index) => (
                <li key={index}>{message}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </details>
  );
}
