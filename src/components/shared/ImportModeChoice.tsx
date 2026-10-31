import type { Profile } from '@/src/types/profile';
import { importIdentity, possibleDifferentPerson, type ImportMode } from '@/src/utils/importPolicy';

interface Props {
  current: Partial<Profile>;
  incoming: Partial<Profile>;
  mode: ImportMode | null;
  onChange: (mode: ImportMode) => void;
  busy?: boolean;
  fromDrive?: boolean;
}
export function ImportModeChoice({ current, incoming, mode, onChange, busy, fromDrive }: Props) {
  const different = possibleDifferentPerson(current, incoming);
  if (!different) return null;
  return (
    <div className="mt-4 space-y-3 border-t border-gray-200 pt-4 dark:border-gray-700">
      {different && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
            This may be another person’s profile
          </p>
          <dl className="grid grid-cols-2 gap-3 text-xs">
            {(
              [
                ['Current', current],
                ['Incoming', incoming],
              ] as const
            ).map(([label, profile]) => {
              const identity = importIdentity(profile);
              return (
                <div key={label} className="min-w-0">
                  <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
                  <dd className="mt-1 break-words text-gray-800 dark:text-gray-200">
                    {identity.name || 'Name not provided'}
                    <span className="mt-0.5 block text-gray-500 dark:text-gray-400">
                      {identity.email || 'Email not provided'}
                    </span>
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      )}
      <fieldset disabled={busy} className="space-y-3">
        <legend className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">
          Import action
        </legend>
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
              Keep saved details not found in this import.
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
              Start fresh using the incoming details.
            </span>
          </span>
        </label>
      </fieldset>
      {mode === 'replace' && (
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Replaces your profile, documents, mappings, and history. Details not imported are cleared.
          Appearance and AI settings stay.
          {!fromDrive && ' Connected Drive backups pause until reviewed.'}
        </p>
      )}
    </div>
  );
}
