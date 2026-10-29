export function ImportWarnings({ warnings = [] }: { warnings?: string[] }) {
  if (!warnings.length) return null;
  return (
    <details className="mt-3 text-xs text-amber-700 dark:text-amber-400">
      <summary className="cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-blue-500">
        {warnings.length} invalid {warnings.length === 1 ? 'item will' : 'items will'} be skipped
      </summary>
      <ul className="mt-2 max-h-32 overflow-y-auto break-words space-y-1 text-gray-600 dark:text-gray-400">
        {warnings.map((warning, index) => (
          <li key={index}>{warning}</li>
        ))}
      </ul>
    </details>
  );
}
