import { useState, useRef } from 'react';
import type { Profile } from '@/src/types/profile';
import type { LearnedMappings, ApplicationEntry } from '@/src/types/storage';
import {
  getProfile,
  saveProfile,
  getLearnedMappings,
  getApplicationHistory,
  saveLearmedMappings,
  saveApplicationHistory,
} from '@/src/utils/storage';
import { validateImportedProfile } from '@/src/utils/profileValidator';
import type { InvalidField } from '@/src/utils/profileValidator';
import { useToast } from '@/src/components/ui/Toast';

interface Props {
  onImportComplete: () => void;
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

export function SettingsSection({ onImportComplete }: Props) {
  const { showToast } = useToast();
  const [importing,     setImporting]     = useState(false);
  const [importError,   setImportError]   = useState<string | null>(null);

  const [parsedImport,       setParsedImport]       = useState<ParsedImport | null>(null);
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [importMode,         setImportMode]         = useState<'merge' | 'overwrite'>('merge');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Export ──────────────────────────────────────────────────────────────────

  const handleExport = async () => {
    try {
      const [profile, learnedMappings, applicationHistory] = await Promise.all([
        getProfile(),
        getLearnedMappings(),
        getApplicationHistory(),
      ]);

      if (!profile) {
        showToast('error', 'No profile data found to export.');
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

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Settings</h2>
        <p className="text-sm text-gray-500 mt-1">Manage your profile data</p>
      </div>

      {/* ── Export ────────────────────────────────────────────────────────────── */}
      <section className="mb-8 pb-8 border-b border-gray-200">
        <h3 className="text-base font-semibold text-gray-800 mb-1">Export Profile</h3>
        <p className="text-sm text-gray-500 mb-4">
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
      <section>
        <h3 className="text-base font-semibold text-gray-800 mb-1">Import Profile</h3>
        <p className="text-sm text-gray-500 mb-4">
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
          className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          Choose File
        </button>
        {importError && (
          <p className="mt-2 text-sm text-red-500">{importError}</p>
        )}
      </section>

      {/* ── Conflict dialog ───────────────────────────────────────────────────── */}
      {showConflictDialog && parsedImport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={handleDialogClose}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Dialog header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="text-base font-semibold text-gray-900">Import Profile</h3>
              <button
                type="button"
                onClick={handleDialogClose}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none transition-colors"
              >
                ×
              </button>
            </div>

            {/* Dialog body */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <p className="text-sm font-medium text-gray-800 mb-4">How would you like to import?</p>

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
                    <span className="text-sm font-medium text-gray-900">Merge</span>
                    <p className="text-xs text-gray-500 mt-0.5">
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
                    <span className="text-sm font-medium text-gray-900">Overwrite</span>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Replace all data with the imported profile.
                    </p>
                  </div>
                </label>
              </div>

              {/* Validation warnings */}
              {parsedImport.invalidFields.length > 0 && (
                <div className="mt-5 p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <p className="text-xs font-medium text-amber-800 mb-2">
                    ⚠ {parsedImport.invalidFields.length} field{parsedImport.invalidFields.length !== 1 ? 's' : ''} will be skipped:
                  </p>
                  <ul className="space-y-1.5">
                    {parsedImport.invalidFields.map((f) => (
                      <li key={f.path} className="text-xs text-amber-700">
                        <span className="font-mono">{f.path}</span>
                        <br />
                        <span className="ml-2 text-amber-600">({f.reason})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Dialog footer */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
              <button
                type="button"
                onClick={handleDialogClose}
                className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
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
    </div>
  );
}
