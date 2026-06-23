import { useState, useRef, useEffect } from 'react';
import type { Profile } from '@/src/types/profile';
import type { LearnedMappings, ApplicationEntry, DriveBackupFile, DriveError } from '@/src/types/storage';
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
  clearGeminiSettings,
} from '@/src/utils/storage';
import { calculateCompletion } from '@/src/utils/profileCompletion';
import { validateImportedProfile } from '@/src/utils/profileValidator';
import type { InvalidField } from '@/src/utils/profileValidator';
import { useToast } from '@/src/components/ui/Toast';
import { validateApiKey, checkApiKey } from '@/src/resume-ai/gemini';
import {
  getFullDriveState,
  connectDrive,
  disconnectDrive,
  syncProfileToDrive,
  overwriteDriveWithLocal,
  isDriveConfigured,
} from '@/src/utils/driveSync';

const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-lite';

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

// ── Drive timestamp formatter ────────────────────────────────────────────────
// Renders an ISO timestamp as "Jun 24, 2026 · 3:42 PM" in the user's locale.
function fmtDriveTimestamp(iso: string | null): string {
  if (!iso) return 'Not synced yet';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'Not synced yet';
    return d.toLocaleString(undefined, {
      year:   'numeric',
      month:  'short',
      day:    'numeric',
      hour:   'numeric',
      minute: '2-digit',
    });
  } catch {
    return 'Not synced yet';
  }
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
  const [geminiKeyStatus,  setGeminiKeyStatus]  = useState<'idle' | 'validating' | 'valid' | 'invalid' | 'no_model'>('idle');
  const [geminiModel,      setGeminiModel]      = useState<string | null>(null);
  const geminiDebounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const probeIdRef         = useRef(0);

  // ── Cloud Backup state ───────────────────────────────────────────────────────
  const [driveState, setDriveState] = useState<{
    connected:   boolean;
    lastSynced:  string | null;
    pendingSync: boolean;
    error:       DriveError;
  }>({ connected: false, lastSynced: null, pendingSync: false, error: null });
  const [driveConnecting,        setDriveConnecting]        = useState(false);
  const [driveSyncing,           setDriveSyncing]           = useState(false);
  const [driveDisconnectDialog,  setDriveDisconnectDialog]  = useState(false);
  const [driveRestoreCase,       setDriveRestoreCase]       = useState<'empty' | 'conflict' | null>(null);
  const [driveRestoreData,       setDriveRestoreData]       = useState<DriveBackupFile | null>(null);
  const [driveLocalProfile,      setDriveLocalProfile]      = useState<Partial<Profile> | null>(null);
  const [driveRestoreBusy,       setDriveRestoreBusy]       = useState(false);
  const [resetScope,             setResetScope]             = useState<'device' | 'everywhere'>('device');

  useEffect(() => {
    Promise.all([getGeminiApiKey(), getGeminiModel()]).then(([key, model]) => {
      if (key) {
        setGeminiKey(key);
        setGeminiModel(model);
        setGeminiKeyStatus('valid');
      }
    });
  }, []);

  // ── Cloud Backup — load state and listen for cross-component updates ────────
  useEffect(() => {
    const load = () => {
      void getFullDriveState().then(setDriveState).catch(() => { /* silent */ });
    };
    load();
    const handler = () => load();
    window.addEventListener('jb:drive:state-changed', handler);
    return () => window.removeEventListener('jb:drive:state-changed', handler);
  }, []);

  const handleGeminiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const key = e.target.value;
    setGeminiKey(key);
    if (geminiDebounceRef.current) clearTimeout(geminiDebounceRef.current);

    if (!key.trim()) {
      setGeminiKeyStatus('idle');
      setGeminiModel(null);
      void clearGeminiSettings();
      return;
    }

    geminiDebounceRef.current = setTimeout(async () => {
      const trimmed = key.trim();

      // Step 1: validate the key independently via the models list endpoint
      setGeminiKeyStatus('validating');
      const keyCheck = await checkApiKey(trimmed);

      if (keyCheck === 'invalid') {
        setGeminiKeyStatus('invalid');
        return;
      }
      if (keyCheck === 'network_error') {
        setGeminiKeyStatus('idle');
        return;
      }

      // Step 2: key confirmed valid — save immediately with default model
      await saveGeminiApiKey(trimmed);
      await saveGeminiModel(DEFAULT_GEMINI_MODEL);
      setGeminiModel(DEFAULT_GEMINI_MODEL);
      setGeminiKeyStatus('valid');

      // Step 3: background model probe — fully decoupled from key validation
      const probeId = ++probeIdRef.current;
      const result = await validateApiKey(trimmed);
      if (probeId !== probeIdRef.current) return;

      if (result.valid && result.model && result.model !== DEFAULT_GEMINI_MODEL) {
        await saveGeminiModel(result.model);
        setGeminiModel(result.model);
      } else if (result.keyValidNoModel) {
        setGeminiKeyStatus('no_model');
      } else if (result.keyInvalid) {
        await clearGeminiSettings();
        setGeminiModel(null);
        setGeminiKeyStatus('invalid');
      }
      // Network error during probe: leave key + default model in storage
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

  // ── Cloud Backup — handlers ──────────────────────────────────────────────────

  const handleDriveConnect = async () => {
    setDriveConnecting(true);
    try {
      const { backup } = await connectDrive();
      const localProfile = await getProfile();
      setDriveLocalProfile(localProfile);
      if (backup) {
        const localCompletion = calculateCompletion(localProfile ?? {});
        if (localCompletion.percentage === 0) {
          setDriveRestoreCase('empty');
          setDriveRestoreData(backup);
        } else {
          setDriveRestoreCase('conflict');
          setDriveRestoreData(backup);
        }
      } else if (localProfile) {
        // No Drive backup yet — push the local profile up as the initial snapshot.
        void syncProfileToDrive(localProfile);
      }
    } catch (err) {
      console.error('[Job Buddy] Drive connect failed:', err);
      showToast('error', 'Could not connect to Google Drive. Please try again.');
    } finally {
      setDriveConnecting(false);
    }
  };

  const handleDriveSyncNow = async () => {
    const profile = await getProfile();
    if (!profile) {
      showToast('warning', 'No profile data to sync.');
      return;
    }
    setDriveSyncing(true);
    try {
      const res = await syncProfileToDrive(profile);
      if (res.success) {
        showToast('success', 'Synced to Google Drive');
      } else if (res.errorCode === 'storage_full') {
        showToast('error', 'Google Drive storage full — sync paused.');
      } else if (res.errorCode === 'token_expired') {
        showToast('warning', 'Drive disconnected — reconnect to resume syncing.');
      } else if (res.errorCode) {
        showToast('warning', 'Sync failed — will retry automatically.');
      }
    } finally {
      setDriveSyncing(false);
    }
  };

  const handleDriveReconnect = () => { void handleDriveConnect(); };

  const handleDriveDisconnect = async (deleteFile: boolean) => {
    setDriveDisconnectDialog(false);
    try {
      await disconnectDrive(deleteFile);
      showToast('success', deleteFile ? 'Disconnected and Drive backup deleted' : 'Disconnected from Google Drive');
    } catch (err) {
      console.error('[Job Buddy] Drive disconnect failed:', err);
      showToast('error', 'Disconnect failed. Please try again.');
    }
  };

  const closeRestoreDialog = () => {
    setDriveRestoreCase(null);
    setDriveRestoreData(null);
    setDriveLocalProfile(null);
  };

  const handleRestoreFromDrive = async () => {
    if (!driveRestoreData) return;
    setDriveRestoreBusy(true);
    try {
      await saveProfile(driveRestoreData.profile);
      // Update the lastSynced timestamp on the Drive state to reflect that
      // local now matches Drive (no further write needed — backup file is
      // already current).
      const fresh = await getFullDriveState();
      setDriveState(fresh);
      showToast('success', 'Profile restored from Google Drive');
      onImportComplete();
      closeRestoreDialog();
    } catch (err) {
      console.error('[Job Buddy] Restore from Drive failed:', err);
      showToast('error', 'Restore failed. Please try again.');
    } finally {
      setDriveRestoreBusy(false);
    }
  };

  const handleKeepLocal = async () => {
    if (!driveLocalProfile) {
      closeRestoreDialog();
      return;
    }
    setDriveRestoreBusy(true);
    try {
      const res = await overwriteDriveWithLocal(driveLocalProfile as Profile);
      if (res.success) {
        showToast('success', 'Local profile uploaded to Google Drive');
      } else if (res.errorCode) {
        showToast('warning', 'Sync failed — will retry automatically.');
      }
      closeRestoreDialog();
    } finally {
      setDriveRestoreBusy(false);
    }
  };

  // ── Reset All Data ───────────────────────────────────────────────────────────

  const handleReset = async () => {
    if (resetConfirmText !== 'DELETE') return;
    setResetting(true);
    try {
      if (resetScope === 'everywhere' && driveState.connected) {
        await disconnectDrive(true);
      }
      await clearAllStorage();
      setShowResetDialog(false);
      setResetConfirmText('');
      setResetScope('device');
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
    setResetScope('device');
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
          Enable AI-powered features using your own API key.
        </p>

        <label htmlFor="gemini-api-key" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Gemini API Key
        </label>
        <input
          id="gemini-api-key"
          type="password"
          value={geminiKey}
          onChange={handleGeminiKeyChange}
          placeholder="AQ..."
          autoComplete="off"
          className="w-full max-w-md px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Get a free key from Google AI Studio. No credit card required.
        </p>

        {geminiKeyStatus === 'validating' && (
          <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">Validating…</p>
        )}
        {geminiKeyStatus === 'valid' && (
          <p className="mt-1.5 text-xs text-green-600 dark:text-green-400">API key saved.</p>
        )}
        {geminiKeyStatus === 'no_model' && (
          <p className="mt-1.5 text-xs text-yellow-600 dark:text-yellow-400">
            API key is valid but no supported model is available for your account. Try again later.
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
                href="https://aistudio.google.com/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 underline"
              >
                Google AI Studio
              </a>
              {' '}and sign in
            </li>
            <li>Click "Create API key"</li>
            <li>Copy the key listed under "API Key" and paste it here</li>
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
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 active:scale-95 transition-colors"
        >
          Download File
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
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-95 transition-colors"
        >
          Choose File
        </button>
        {importError && (
          <p className="mt-2 text-sm text-red-500 dark:text-red-400">{importError}</p>
        )}
      </section>

      {/* ── Cloud Backup ──────────────────────────────────────────────────────── */}
      <section className="mb-8 pb-8 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-1">Cloud Backup</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Sync your profile to your own Google Drive. Only you can access it.
        </p>

        {/* State 1a: Not configured in this build */}
        {!driveState.connected && !driveConnecting && !isDriveConfigured() && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Google Drive sync is not configured in this build.
          </p>
        )}

        {/* State 1b: Not connected */}
        {!driveState.connected && !driveConnecting && isDriveConfigured() && (
          <button
            type="button"
            onClick={handleDriveConnect}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 active:scale-95 transition-colors"
          >
            Connect Google Drive
          </button>
        )}

        {/* State 2: Connecting */}
        {driveConnecting && (
          <p className="text-sm text-gray-600 dark:text-gray-300">
            <span className="inline-block w-3 h-3 mr-2 rounded-full border-2 border-gray-400 dark:border-gray-500 border-t-transparent animate-spin align-[-2px]" />
            Connecting…
          </p>
        )}

        {/* State 6: Token expired (takes priority over the healthy view) */}
        {driveState.connected && driveState.error === 'token_expired' && (
          <div>
            <p className="text-sm text-yellow-700 dark:text-yellow-400 mb-3">
              Drive disconnected — reconnect to resume syncing.
            </p>
            <button
              type="button"
              onClick={handleDriveReconnect}
              disabled={driveConnecting}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 active:scale-95 transition-colors"
            >
              Reconnect
            </button>
          </div>
        )}

        {/* State 7: Storage full */}
        {driveState.connected && driveState.error === 'storage_full' && (
          <div>
            <p className="text-sm text-red-600 dark:text-red-400 mb-3">
              Google Drive storage full — sync paused.
            </p>
            <a
              href="https://one.google.com/storage"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 dark:text-blue-400 underline font-medium"
            >
              Manage storage →
            </a>
          </div>
        )}

        {/* State 5: Temp failure */}
        {driveState.connected && driveState.error === 'sync_error' && (
          <div>
            <p className="text-sm text-yellow-700 dark:text-yellow-400 mb-3">
              Sync failed — will retry automatically.
            </p>
            <button
              type="button"
              onClick={handleDriveSyncNow}
              disabled={driveSyncing}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 active:scale-95 transition-colors"
            >
              {driveSyncing ? 'Retrying…' : 'Retry'}
            </button>
          </div>
        )}

        {/* State 4: Pending sync (no other error) */}
        {driveState.connected && !driveState.error && driveState.pendingSync && (
          <div>
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
              Saved locally. Sync pending.
            </p>
            <button
              type="button"
              onClick={handleDriveSyncNow}
              disabled={driveSyncing}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 active:scale-95 transition-colors"
            >
              {driveSyncing ? 'Retrying…' : 'Retry'}
            </button>
          </div>
        )}

        {/* State 3: Connected (healthy) */}
        {driveState.connected && !driveState.error && !driveState.pendingSync && (
          <div>
            <p className="text-sm font-medium text-green-700 dark:text-green-400 mb-1">
              ✓ Connected to Google Drive
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              Last synced: {fmtDriveTimestamp(driveState.lastSynced)}
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              <button
                type="button"
                onClick={handleDriveSyncNow}
                disabled={driveSyncing}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 active:scale-95 transition-colors"
              >
                {driveSyncing ? 'Syncing…' : 'Sync Now'}
              </button>
              <button
                type="button"
                onClick={() => setDriveDisconnectDialog(true)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-95 transition-colors"
              >
                Disconnect
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Drive acts as backup only. Changes sync from here to Drive, not the other way.
            </p>
          </div>
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
          className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 active:scale-95 transition-colors"
        >
          Reset Now
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
                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none active:scale-95 transition-colors"
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
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-95 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleImportConfirm}
                disabled={importing}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 active:scale-95 transition-colors"
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
                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none active:scale-95 transition-colors"
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

              {driveState.connected && (
                <div className="mb-5">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-2">Reset scope:</p>
                  <div className="space-y-2">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="radio"
                        name="resetScope"
                        value="device"
                        checked={resetScope === 'device'}
                        onChange={() => setResetScope('device')}
                        className="mt-0.5 text-red-600"
                      />
                      <div>
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">This device only</span>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          Google Drive backup is kept.
                        </p>
                      </div>
                    </label>
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="radio"
                        name="resetScope"
                        value="everywhere"
                        checked={resetScope === 'everywhere'}
                        onChange={() => setResetScope('everywhere')}
                        className="mt-0.5 text-red-600"
                      />
                      <div>
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Everywhere (delete Drive backup too)</span>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          Removes the Drive backup file and disconnects.
                        </p>
                      </div>
                    </label>
                  </div>
                </div>
              )}

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
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-95 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReset}
                disabled={resetConfirmText !== 'DELETE' || resetting}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 active:scale-95 transition-colors"
              >
                {resetting ? 'Resetting…' : 'Reset All Data'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Drive disconnect dialog ───────────────────────────────────────────── */}
      {driveDisconnectDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setDriveDisconnectDialog(false)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl dark:shadow-black/60 w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Disconnect Google Drive</h3>
              <button
                type="button"
                onClick={() => setDriveDisconnectDialog(false)}
                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none active:scale-95 transition-colors"
              >
                ×
              </button>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
                What would you like to do with the backup file in your Google Drive?
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Either way, your local profile on this device is untouched.
              </p>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex-wrap">
              <button
                type="button"
                onClick={() => setDriveDisconnectDialog(false)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-95 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDriveDisconnect(false)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-95 transition-colors"
              >
                Keep Drive Backup
              </button>
              <button
                type="button"
                onClick={() => handleDriveDisconnect(true)}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 active:scale-95 transition-colors"
              >
                Delete Drive Backup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Drive restore dialog — empty local profile ───────────────────────── */}
      {driveRestoreCase === 'empty' && driveRestoreData && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={closeRestoreDialog}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl dark:shadow-black/60 w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Restore from Google Drive</h3>
              <button
                type="button"
                onClick={closeRestoreDialog}
                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none active:scale-95 transition-colors"
              >
                ×
              </button>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                Profile found in Google Drive. Restore it?
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Backup timestamp: {fmtDriveTimestamp(driveRestoreData.lastModified)}
              </p>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={closeRestoreDialog}
                disabled={driveRestoreBusy}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 active:scale-95 transition-colors"
              >
                Skip
              </button>
              <button
                type="button"
                onClick={handleRestoreFromDrive}
                disabled={driveRestoreBusy}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 active:scale-95 transition-colors"
              >
                {driveRestoreBusy ? 'Restoring…' : 'Restore'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Drive restore dialog — conflict ──────────────────────────────────── */}
      {driveRestoreCase === 'conflict' && driveRestoreData && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={closeRestoreDialog}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl dark:shadow-black/60 w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Profile conflict</h3>
              <button
                type="button"
                onClick={closeRestoreDialog}
                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none active:scale-95 transition-colors"
              >
                ×
              </button>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
                Your local profile and Google Drive backup are different.
              </p>
              <div className="space-y-3 mb-4">
                <div className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">This device</p>
                  <p className="text-sm text-gray-900 dark:text-gray-100">Your current profile</p>
                </div>
                <div className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Google Drive backup</p>
                  <p className="text-sm text-gray-900 dark:text-gray-100">{fmtDriveTimestamp(driveRestoreData.lastModified)}</p>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex-wrap">
              <button
                type="button"
                onClick={handleKeepLocal}
                disabled={driveRestoreBusy}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 active:scale-95 transition-colors"
              >
                {driveRestoreBusy ? 'Working…' : 'Keep Local'}
              </button>
              <button
                type="button"
                onClick={handleRestoreFromDrive}
                disabled={driveRestoreBusy}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 active:scale-95 transition-colors"
              >
                {driveRestoreBusy ? 'Working…' : 'Use Drive Backup'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
