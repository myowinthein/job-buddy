import { useEffect, useState } from 'react';
import type { Profile } from '@/src/types/profile';
import type { LearnedMappings, LearnedMappingValue } from '@/src/types/storage';
import { getProfile, getLearnedMappings, saveLearnedMappings } from '@/src/utils/storage';
import { resolveProfileValue } from '@/src/autofill/resolver';
import { useToast } from '@/src/components/ui/useToast';
import { InfoTooltip } from '@/src/components/ui/InfoTooltip';
import { ExpandableCard } from './shared/ExpandableCard';
import { RemoveButton } from './shared/RemoveButton';
import { SearchableProfileFieldSelect } from './shared/SearchableProfileFieldSelect';

function pathOf(value: LearnedMappingValue): string {
  return typeof value === 'string' ? value : value.path;
}

// The signal key itself is normalized (lowercased, spaces/punctuation stripped)
// and unreadable on its own — display the human-readable label captured at
// write time instead, when one was recorded. Legacy entries have none.
function labelOf(value: LearnedMappingValue): string | null {
  return typeof value === 'string' ? null : (value.label ?? null);
}

// Legacy string-format entries were already trusted when they were written,
// same as a counted entry that has reached the Layer 0 threshold.
function isTrusted(value: LearnedMappingValue): boolean {
  return typeof value === 'string' || value.count >= 2;
}

function countLabel(value: LearnedMappingValue): string {
  return isTrusted(value) ? 'Trusted' : 'Learning';
}

function countTooltip(value: LearnedMappingValue): string {
  return isTrusted(value)
    ? 'This field now fills automatically without showing the picker.'
    : 'One more matching confirmation before this fills automatically.';
}

// True when the mapping's path no longer resolves to anything in the current
// profile — e.g. it pointed to a work history row that was since deleted.
// Purely informational: nothing here is auto-removed or auto-corrected: the
// user decides via Edit/Delete below.
function resolvesEmpty(value: LearnedMappingValue, profile: Partial<Profile>): boolean {
  return !resolveProfileValue(profile as Profile, pathOf(value));
}

interface SignalRowProps {
  signal: string;
  value: LearnedMappingValue;
  profile: Partial<Profile>;
  onDelete: () => void;
  onUpdate: (newPath: string) => void;
}

function SignalRow({ signal, value, profile, onDelete, onUpdate }: SignalRowProps) {
  const [editing, setEditing]         = useState(false);
  const [editValue, setEditValue]     = useState(pathOf(value));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const label = labelOf(value);

  const startEdit = () => {
    setEditValue(pathOf(value));
    setEditing(true);
  };

  const commitEdit = () => {
    const path = editValue.trim();
    if (path && path !== pathOf(value)) onUpdate(path);
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-3 py-2 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
      <div className="flex-1 min-w-0">
        {label ? (
          <p className="text-sm text-gray-900 dark:text-gray-100 truncate" title={signal}>{label}</p>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-500 italic truncate" title={signal}>
            {signal} <span className="not-italic text-gray-400 dark:text-gray-600">(no label saved)</span>
          </p>
        )}
        {editing ? (
          <div className="flex items-center gap-2 mt-1">
            <SearchableProfileFieldSelect
              profile={profile}
              value={editValue}
              onChange={setEditValue}
            />
            <button
              type="button"
              onClick={commitEdit}
              className="text-xs px-2.5 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 active:scale-95 transition-colors shrink-0"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-xs px-2.5 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-95 transition-colors shrink-0"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate">{pathOf(value)}</p>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
                isTrusted(value)
                  ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
              }`}
            >
              {countLabel(value)}
            </span>
            <InfoTooltip text={countTooltip(value)} />
            {resolvesEmpty(value, profile) && (
              <>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  Empty right now
                </span>
                <InfoTooltip text="This profile field is empty or no longer exists, so this mapping won't fill anything until you update it here or in your profile." />
              </>
            )}
          </div>
        )}
      </div>

      {!editing && (
        <div className="flex items-center gap-1 shrink-0">
          {confirmDelete ? (
            <>
              <button
                type="button"
                onClick={() => { onDelete(); setConfirmDelete(false); }}
                className="text-xs px-2.5 py-1 bg-red-600 dark:bg-red-700 text-white rounded-md hover:bg-red-700 dark:hover:bg-red-600 active:scale-95 transition-colors"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="text-xs px-2.5 py-1 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-95 transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={startEdit}
                className="text-xs px-2 py-1 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 active:scale-95 transition-colors"
              >
                Edit
              </button>
              <RemoveButton onClick={() => setConfirmDelete(true)} title="Delete this learned input" />
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function LearnedMappingsSection() {
  const { showToast } = useToast();
  const [mappings, setMappings] = useState<LearnedMappings>({});
  const [profile, setProfile]   = useState<Partial<Profile>>({});
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    Promise.all([getLearnedMappings(), getProfile()])
      .then(([m, p]) => { setMappings(m); setProfile(p ?? {}); })
      .catch(() => showToast('error', 'Failed to load learned inputs.'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keeps this page's copy in sync with background writes (e.g. autofill
  // learning something new on a job-site tab while this page is open) —
  // without this, an edit/delete made here would overwrite storage using a
  // stale snapshot and silently discard those background changes.
  useEffect(() => {
    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName === 'local' && 'learnedMappings' in changes) {
        setMappings((changes.learnedMappings.newValue as LearnedMappings) ?? {});
      }
    };
    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  const persist = async (next: LearnedMappings, message: string) => {
    setMappings(next);
    try {
      await saveLearnedMappings(next);
      showToast('success', message);
    } catch {
      showToast('error', 'Failed to save. Please try again.');
    }
  };

  const deleteDomain = (domain: string) => {
    const next = { ...mappings };
    delete next[domain];
    void persist(next, `Removed all learned inputs from ${domain}`);
  };

  const deleteSignal = (domain: string, signal: string) => {
    const domainMap = { ...mappings[domain] };
    delete domainMap[signal];
    const next = { ...mappings };
    if (Object.keys(domainMap).length === 0) delete next[domain];
    else next[domain] = domainMap;
    void persist(next, `Removed learned input from ${domain}`);
  };

  // A manual correction is a deliberate, explicit confirmation — more
  // reliable than two picker confirmations — so it's trusted immediately
  // rather than starting back at count: 1.
  const updateSignal = (domain: string, signal: string, newPath: string) => {
    const next = {
      ...mappings,
      [domain]: { ...mappings[domain], [signal]: { path: newPath, count: 2 } },
    };
    void persist(next, 'Updated learned input');
  };

  const domains = Object.keys(mappings).sort((a, b) => a.localeCompare(b));

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Learned Mappings</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Job Buddy remembers which input on a site maps to which profile field, for yellow, red, or gray
          fields that resolved through the picker or AI. Review, correct, or remove anything it learned
          wrong here.
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-14 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : domains.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          Nothing learned yet. Entries will appear here as you fill out job applications.
        </p>
      ) : (
        domains.map((domain) => {
          const signals = Object.entries(mappings[domain]).sort(([a], [b]) => a.localeCompare(b));
          return (
            <ExpandableCard
              key={domain}
              summary={domain}
              subtitle={`${signals.length} learned input${signals.length !== 1 ? 's' : ''}`}
              onDelete={() => deleteDomain(domain)}
            >
              {signals.map(([signal, value]) => (
                <SignalRow
                  key={signal}
                  signal={signal}
                  value={value}
                  profile={profile}
                  onDelete={() => deleteSignal(domain, signal)}
                  onUpdate={(newPath) => updateSignal(domain, signal, newPath)}
                />
              ))}
            </ExpandableCard>
          );
        })
      )}
    </div>
  );
}
