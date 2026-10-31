import type { Profile } from '@/src/types/profile';
import { importIdentity, possibleDifferentPerson, type ImportMode } from '@/src/utils/importPolicy';

interface Props {
  current: Partial<Profile>;
  incoming: Partial<Profile>;
  mode: ImportMode | null;
  onChange: (mode: ImportMode) => void;
  busy?: boolean;
}
export function ImportModeChoice({ current, incoming, mode, onChange, busy }: Props) {
  const different = possibleDifferentPerson(current, incoming);
  if (!different) return null;
  return (
    <div className="mt-4 space-y-3 border-t border-gray-200 pt-4 dark:border-gray-700">
      <div className="space-y-3">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
          This may be another person’s profile
        </p>
        <dl className="space-y-2 text-xs">
          {(
            [
              ['Current', current],
              ['Incoming', incoming],
            ] as const
          ).map(([label, profile]) => {
            const identity = importIdentity(profile);
            return (
              <div key={label} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3">
                <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
                <dd className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 break-words text-gray-800 dark:text-gray-200">
                  <span className="font-medium">{identity.name || 'Name not provided'}</span>
                  <span className="break-all text-gray-500 dark:text-gray-400">
                    {identity.email || 'Email not provided'}
                  </span>
                </dd>
              </div>
            );
          })}
        </dl>
      </div>
      <fieldset disabled={busy} className="space-y-3">
        <legend className="sr-only">Import action</legend>
        <label className="flex cursor-pointer items-start gap-2 text-sm text-gray-800 dark:text-gray-200">
          <input
            type="radio"
            name="import-mode"
            value="update"
            checked={mode === 'update'}
            onChange={() => onChange('update')}
            className="mt-1 accent-blue-600"
          />
          <span>
            Update current profile
            <span className="block text-xs text-gray-500 dark:text-gray-400">
              Add or update details while keeping the rest.
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 text-sm text-gray-800 dark:text-gray-200">
          <input
            type="radio"
            name="import-mode"
            value="replace"
            checked={mode === 'replace'}
            onChange={() => onChange('replace')}
            className="mt-1 accent-blue-600"
          />
          <span>
            Replace current profile
            <span className="block text-xs text-gray-500 dark:text-gray-400">
              Clear saved data and import new details.
            </span>
          </span>
        </label>
      </fieldset>
    </div>
  );
}
