import { useState, useRef, useEffect } from 'react';
import type { Profile } from '@/src/types/profile';
import type { LearnedMappings, ApplicationEntry } from '@/src/types/storage';
import {
  getProfile,
  saveProfile,
  getLearnedMappings,
  getApplicationHistory,
  saveLearmedMappings,
  saveApplicationHistory,
  clearAllStorage,
  getGeminiApiKey,
  saveGeminiApiKey,
  getGeminiModel,
  saveGeminiModel,
} from '@/src/utils/storage';
import { calculateCompletion } from '@/src/utils/profileCompletion';
import { validateImportedProfile } from '@/src/utils/profileValidator';
import type { InvalidField } from '@/src/utils/profileValidator';
import { useToast } from '@/src/components/ui/Toast';
import { validateApiKey } from '@/src/resume-ai/gemini';
import { MODEL_DISPLAY_NAMES } from '@/src/resume-ai/types';

interface Props {
  onImportComplete: () => void;
  onResetComplete:  () => void;
}

interface ExportData {
  _comment?:          string;
  version:            string;
  profileId?:         string;
  exportedAt:         string;
  profile:            Profile;
  learnedMappings:    LearnedMappings;
  applicationHistory: ApplicationEntry[];
}

interface ParsedImport {
  sanitized:     Partial<Profile>;
  invalidFields: InvalidField[];
  exportData:    ExportData;
}

// ── Merge helpers ─────────────────────────────────────────────────────────────

function isEmptyPrimitive(val: unknown): boolean {
  if (val === undefined || val === null) return true;
  if (typeof val === 'string')  return val === '';
  if (typeof val === 'number')  return val === 0;
  return false;
}

function mergeValues(current: unknown, imported: unknown): unknown {
  // Arrays: all-or-nothing
  if (Array.isArray(imported)) {
    return Array.isArray(current) && current.length > 0 ? current : imported;
  }
  // Objects: field-by-field
  if (typeof imported === 'object' && imported !== null) {
    if (typeof current !== 'object' || current === null) return imported;
    const result: Record<string, unknown> = { ...(current as Record<string, unknown>) };
    for (const key of Object.keys(imported as Record<string, unknown>)) {
      result[key] = mergeValues(
        result[key],
        (imported as Record<string, unknown>)[key],
      );
    }
    return result;
  }
  // Primitive: keep current if non-empty
  return isEmptyPrimitive(current) ? imported : current;
}

function mergeProfiles(current: Partial<Profile>, imported: Partial<Profile>): Partial<Profile> {
  return mergeValues(current, imported) as Partial<Profile>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SettingsSection({ onImportComplete, onResetComplete }: Props) {
  const { showToast } = useToast();
  const [importing,     setImporting]     = useState(false);
  const [importError,   setImportError]   = useState<string | null>(null);
  const [showResetDialog,    setShowResetDialog]    = useState(false);
  const [resetConfirmText,   setResetConfirmText]   = useState('');
  const [resetting,          setResetting]          = useState(false);

  const [parsedImport,       setParsedImport]       = useState<ParsedImport | null>(null);
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [importMode,         setImportMode]         = useState<'merge' | 'overwrite'>('merge');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── AI Features state ────────────────────────────────────────────────────────
  const [geminiKey,        setGeminiKey]        = useState('');
  const [geminiKeyStatus,  setGeminiKeyStatus]  = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');
  const [geminiModel,      setGeminiModel]      = useState<string | null>(null);
  const geminiDebounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    Promise.all([getGeminiApiKey(), getGeminiModel()]).then(([key, model]) => {
      if (key) {
        setGeminiKey(key);
        setGeminiModel(model);
        setGeminiKeyStatus(model ? 'valid' : 'idle');
      }
    });
  }, []);

  const handleGeminiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const key = e.target.value;
    setGeminiKey(key);
    if (geminiDebounceRef.current) clearTimeout(geminiDebounceRef.current);
    if (!key.trim()) {
      setGeminiKeyStatus('idle');
      setGeminiModel(null);
      return;
    }
    setGeminiKeyStatus('validating');
    geminiDebounceRef.current = setTimeout(async () => {
      const result = await validateApiKey(key.trim());
      if (result.valid && result.model) {
        await saveGeminiApiKey(key.trim());
        await saveGeminiModel(result.model);
        setGeminiModel(result.model);
        setGeminiKeyStatus('valid');
      } else {
        setGeminiKeyStatus('invalid');
      }
    }, 800);
  };

  // ── Export ──────────────────────────────────────────────────────────────────

  const handleExport = async () => {
    try {
      const [profile, learnedMappings, applicationHistory] = await Promise.all([
        getProfile(),
        getLearnedMappings(),
        getApplicationHistory(),
      ]);

      if (!profile) {
        showToast('warning', 'No profile data to export.');
        return;
      }

      const exportData = {
        _comment:           'This is your Job Buddy profile backup. Import it back into the Job Buddy extension to restore your data.',
        version:            '1.0',
        profileId:          profile.id,
        exportedAt:         new Date().toISOString(),
        profile,
        learnedMappings,
        applicationHistory,
      };

      const json  = JSON.stringify(exportData, null, 2);
      const blob  = new Blob([json], { type: 'application/json' });
      const url   = URL.createObjectURL(blob);
      const a     = document.createElement('a');
      a.href      = url;
      a.download  = `job-buddy-profile-${profile.id.slice(0, 8)}-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);

      showToast('success', 'Profile exported successfully');
    } catch (err) {
      console.error('[Job Buddy] Export failed:', err);
      showToast('error', 'Failed to export profile');
    }
  };

  // ── Import — file selection ──────────────────────────────────────────────────

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so the same file can be selected again
    e.target.value = '';
    if (!file) return;

    setImportError(null);

    let parsed: unknown;
    try {
      const text = await file.text();
      parsed = JSON.parse(text);
    } catch {
      showToast('error', 'Invalid file. Please select a valid Job Buddy export file.');
      return;
    }

    if (
      typeof parsed !== 'object' || parsed === null ||
      !('profile' in (parsed as object))
    ) {
      showToast('error', 'Invalid file. Please select a valid Job Buddy export file.');
      return;
    }

    const exportData = parsed as ExportData;
    const validation = validateImportedProfile(exportData.profile);

    // If the current profile is empty, skip the merge/overwrite dialog and
    // import immediately — there is nothing to conflict with.
    const currentProfile = await getProfile();
    const { percentage } = calculateCompletion(currentProfile ?? {});

    if (percentage === 0) {
      setImporting(true);
      try {
        await saveProfile(validation.sanitized as Profile);
        if (exportData.learnedMappings) await saveLearmedMappings(exportData.learnedMappings);
        if (exportData.applicationHistory) await saveApplicationHistory(exportData.applicationHistory);
        const skipped0 = validation.invalidFields.length;
        const suffix0  = skipped0 > 0 ? ` (${skipped0} field${skipped0 !== 1 ? 's' : ''} skipped)` : '';
        showToast('success', `Profile imported successfully${suffix0}`);
        onImportComplete();
      } catch (err) {
        console.error('[Job Buddy] Import failed:', err);
        showToast('error', 'Import failed. Please try again.');
      } finally {
        setImporting(false);
      }
      return;
    }

    // Non-empty profile: let the user choose merge or overwrite.
    setParsedImport({
      sanitized:     validation.sanitized,
      invalidFields: validation.invalidFields,
      exportData,
    });
    setImportMode('merge');
    setShowConflictDialog(true);
  };

  // ── Import — confirm ─────────────────────────────────────────────────────────

  const handleImportConfirm = async () => {
    if (!parsedImport) return;
    setImporting(true);
    try {
      if (importMode === 'overwrite') {
        await saveProfile(parsedImport.sanitized as Profile);
        if (parsedImport.exportData.learnedMappings) {
          await saveLearmedMappings(parsedImport.exportData.learnedMappings);
        }
        if (parsedImport.exportData.applicationHistory) {
          await saveApplicationHistory(parsedImport.exportData.applicationHistory);
        }
      } else {
        const current = (await getProfile()) ?? {};
        const merged  = mergeProfiles(current, parsedImport.sanitized);
        await saveProfile(merged as Profile);
      }

      const skipped  = parsedImport.invalidFields.length;
      const suffix   = skipped > 0 ? ` (${skipped} field${skipped !== 1 ? 's' : ''} skipped)` : '';
      const message  = importMode === 'merge'
        ? `Profile merged successfully${suffix}`
        : `Profile imported successfully${suffix}`;

      setShowConflictDialog(false);
      setParsedImport(null);
      showToast('success', message);
      onImportComplete();
    } catch (err) {
      console.error('[Job Buddy] Import failed:', err);
      setImportError('Import failed. Please try again.');
    } finally {
      setImporting(false);
    }
  };

  const handleDialogClose = () => {
    setShowConflictDialog(false);
    setParsedImport(null);
  };

  // ── Reset All Data ───────────────────────────────────────────────────────────

  const handleReset = async () => {
    if (resetConfirmText !== 'DELETE') return;
    setResetting(true);
    try {
      await clearAllStorage();
      setShowResetDialog(false);
      setResetConfirmText('');
      showToast('success', 'All data has been reset');
      onResetComplete();
    } catch (err) {
      console.error('[Job Buddy] Reset failed:', err);
      showToast('error', 'Reset failed. Please try again.');
    } finally {
      setResetting(false);
    }
  };

  const handleResetDialogClose = () => {
    setShowResetDialog(false);
    setResetConfirmText('');
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Settings</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage your profile data</p>
      </div>

      {/* ── AI Features ───────────────────────────────────────────────────────── */}
      <section className="mb-8 pb-8 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-1">AI Features</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Enable AI-powered resume import using the Gemini API.
        </p>

        <label htmlFor="gemini-api-key" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Gemini API Key
        </label>
        <input
          id="gemini-api-key"
          type="password"
          value={geminiKey}
          onChange={handleGeminiKeyChange}
          placeholder="AIza..."
          autoComplete="off"
          className="w-full max-w-md px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Get a free key from Google AI Studio. No credit card required.
        </p>

        {geminiKeyStatus === 'validating' && (
          <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">Validating…</p>
        )}
        {geminiKeyStatus === 'valid' && geminiModel && (
          <p className="mt-1.5 text-xs text-green-600 dark:text-green-400">
            Using {MODEL_DISPLAY_NAMES[geminiModel as keyof typeof MODEL_DISPLAY_NAMES] ?? geminiModel}
            {' · '}
            <button
              type="button"
              className="text-blue-600 dark:text-blue-400 underline"
              title="Manual model selection coming soon"
              onClick={() => {}}
            >
              Change
            </button>
          </p>
        )}
        {geminiKeyStatus === 'invalid' && (
          <p className="mt-1.5 text-xs text-red-500 dark:text-red-400">
            Invalid API key. Check your key and try again.
          </p>
        )}

        <details className="mt-3 max-w-md">
          <summary className="text-xs text-blue-600 dark:text-blue-400 cursor-pointer select-none hover:underline">
            How to get a key
          </summary>
          <ol className="mt-2 ml-4 text-xs text-gray-600 dark:text-gray-400 space-y-1 list-decimal">
            <li>
              Visit{' '}
              <a
                href="https://aistudio.google.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 underline"
              >
                aistudio.google.com
              </a>
            </li>
            <li>Create an API key.</li>
            <li>Paste it here.</li>
          </ol>
        </details>
      </section>

      {/* ── Export ────────────────────────────────────────────────────────────── */}
      <section className="mb-8 pb-8 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-1">Export Profile</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Save your profile data as a JSON file. Use this to back up your data or transfer it to
          another browser or device.
        </p>
        <button
          type="button"
          onClick={handleExport}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          Export Profile
        </button>
      </section>

      {/* ── Import ────────────────────────────────────────────────────────────── */}
      <section className="mb-8 pb-8 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-1">Import Profile</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Restore a previously exported Job Buddy profile from a JSON file.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          Choose File
        </button>
        {importError && (
          <p className="mt-2 text-sm text-red-500 dark:text-red-400">{importError}</p>
        )}
      </section>

      {/* ── Privacy notice ────────────────────────────────────────────────────── */}
      <p className="mb-8 text-xs text-gray-500 dark:text-gray-400">
        Your profile data stays on this device and is never sent anywhere.{' '}
        <a
          href="https://github.com/myowinthein/job-buddy/blob/main/PRIVACY.md"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline font-medium"
        >
          Privacy Policy
        </a>
        {' · '}
        <a
          href="https://github.com/myowinthein/job-buddy/blob/main/TERMS.md"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline font-medium"
        >
          Terms of Service
        </a>
        {' · '}
        <a
          href="https://ko-fi.com/myowinthein"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline font-medium"
        >
          Support this project ☕
        </a>
      </p>

      {/* ── Reset All Data ───────────────────────────────────────────────────── */}
      <section className="pt-2">
        <h3 className="text-base font-semibold text-red-700 dark:text-red-400 mb-1">Reset All Data</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Permanently delete your profile and autofill data from this browser. This cannot be undone.
        </p>
        <button
          type="button"
          onClick={async () => {
            const p = await getProfile();
            const { percentage } = calculateCompletion(p ?? {});
            if (percentage === 0) {
              showToast('warning', 'No profile data to reset.');
              return;
            }
            setShowResetDialog(true);
          }}
          className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
        >
          Reset All Data
        </button>
      </section>

      {/* ── Conflict dialog ───────────────────────────────────────────────────── */}
      {showConflictDialog && parsedImport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={handleDialogClose}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl dark:shadow-black/60 w-full max-w-md mx-4 flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Dialog header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Import Profile</h3>
              <button
                type="button"
                onClick={handleDialogClose}
                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none transition-colors"
              >
                ×
              </button>
            </div>

            {/* Dialog body */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-4">How would you like to import?</p>

              <div className="space-y-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="importMode"
                    value="merge"
                    checked={importMode === 'merge'}
                    onChange={() => setImportMode('merge')}
                    className="mt-0.5 text-blue-600"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Merge</span>
                    <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 mt-0.5">
                      Fill only empty fields. Your existing data is kept.
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="importMode"
                    value="overwrite"
                    checked={importMode === 'overwrite'}
                    onChange={() => setImportMode('overwrite')}
                    className="mt-0.5 text-blue-600"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Overwrite</span>
                    <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 mt-0.5">
                      Replace all data with the imported profile.
                    </p>
                  </div>
                </label>
              </div>

              {/* Validation warnings */}
              {parsedImport.invalidFields.length > 0 && (
                <div className="mt-5 p-3 bg-amber-50 dark:bg-amber-900/30 rounded-lg border border-amber-200 dark:border-amber-800">
                  <p className="text-xs font-medium text-amber-800 dark:text-amber-200 mb-2">
                    ⚠ {parsedImport.invalidFields.length} field{parsedImport.invalidFields.length !== 1 ? 's' : ''} will be skipped:
                  </p>
                  <ul className="space-y-1.5">
                    {parsedImport.invalidFields.map((f) => (
                      <li key={f.path} className="text-xs text-amber-700 dark:text-amber-300">
                        <span className="font-mono">{f.path}</span>
                        <br />
                        <span className="ml-2 text-amber-600 dark:text-amber-400">({f.reason})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Dialog footer */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={handleDialogClose}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleImportConfirm}
                disabled={importing}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {importing ? 'Importing…' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reset confirmation dialog ─────────────────────────────────────────── */}
      {showResetDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={handleResetDialogClose}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl dark:shadow-black/60 w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Reset All Data</h3>
              <button
                type="button"
                onClick={handleResetDialogClose}
                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none transition-colors"
              >
                ×
              </button>
            </div>

            <div className="px-6 py-5">
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">This will permanently delete:</p>
              <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1 mb-4 pl-1">
                {['Your profile data', 'Autofill learned mappings'].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="text-gray-400 dark:text-gray-500 mt-0.5">•</span>
                    {item}
                  </li>
                ))}
              </ul>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Consider{' '}
                <button type="button" className="underline hover:text-gray-700 dark:hover:text-gray-200 transition-colors" onClick={handleExport}>
                  exporting your profile first
                </button>{' '}
                as a backup.
              </p>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-5">This cannot be undone.</p>

              <label className="block text-sm text-gray-700 dark:text-gray-300 mb-2">
                Type <code className="font-mono font-bold text-red-600 dark:text-red-400">DELETE</code> to confirm:
              </label>
              <input
                type="text"
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value)}
                placeholder="DELETE"
                autoComplete="off"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={handleResetDialogClose}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReset}
                disabled={resetConfirmText !== 'DELETE' || resetting}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {resetting ? 'Resetting…' : 'Reset All Data'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
