import { useState, useRef, useEffect } from 'react';
import type { Profile } from '@/src/types/profile';
import type { LearnedMappings, ApplicationEntry, DriveBackupFile, DriveError } from '@/src/types/storage';
import {
  getProfile,
  saveProfile,
  getLearnedMappings,
  getApplicationHistory,
  saveLearnedMappings,
  saveApplicationHistory,
  clearAllStorage,
  getGeminiApiKey,
  saveGeminiApiKey,
  getGeminiModel,
  saveGeminiModel,
  clearGeminiSettings,
  saveThemePreference,
} from '@/src/utils/storage';
import { applyTheme, getCurrentTheme } from '@/src/utils/theme';
import type { ThemePreference } from '@/src/utils/theme';
import { calculateCompletion } from '@/src/utils/profileCompletion';
import { validateImportedProfile } from '@/src/utils/profileValidator';
import type { InvalidField } from '@/src/utils/profileValidator';
import { useToast } from '@/src/components/ui/useToast';
import { validateApiKey, checkApiKey } from '@/src/resume-ai/gemini';
import {
  getFullDriveState,
  connectDrive,
  disconnectDrive,
  syncProfileToDrive,
  overwriteDriveWithLocal,
  isDriveConfigured,
} from '@/src/utils/driveSync';
import { generateDiff, applyChanges } from '@/src/resume-ai/parser';
import type { FieldChange } from '@/src/resume-ai/types';
import ImportSummaryDialog from '@/src/components/shared/ImportSummaryDialog';
import ImportReviewScreen from '@/src/components/shared/ImportReviewScreen';

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


// ── Drive timestamp formatter ────────────────────────────────────────────────
// Timestamps are stored as UTC ISO strings. Display converts to local timezone:
//   "Today at HH:mm" / "Yesterday at HH:mm" / full locale date for older entries.
function fmtDriveTimestamp(iso: string | null): string {
  if (!iso) return 'Not synced yet';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'Not synced yet';

    const now          = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfD     = new Date(d.getFullYear(),   d.getMonth(),   d.getDate()).getTime();
    const diffDays     = Math.round((startOfToday - startOfD) / 86_400_000);
    const timeStr      = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

    if (diffDays === 0) return `Today at ${timeStr}`;
    if (diffDays === 1) return `Yesterday at ${timeStr}`;

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

  const [parsedImport,      setParsedImport]      = useState<ParsedImport | null>(null);
  const [importScreen,      setImportScreen]      = useState<'idle' | 'summary' | 'review'>('idle');
  const [importChanges,     setImportChanges]     = useState<FieldChange[]>([]);
  const [importBaseProfile, setImportBaseProfile] = useState<Partial<Profile>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Appearance state ─────────────────────────────────────────────────────────
  // getCurrentTheme() is synchronous — initTheme() is awaited before React
  // renders, so the correct preference is already cached in theme.ts.
  const [themePreference, setThemePreference] = useState<ThemePreference>(getCurrentTheme);

  const handleThemeChange = (value: ThemePreference) => {
    setThemePreference(value);
    applyTheme(value);
    void saveThemePreference(value);
  };

  // ── AI Features state ────────────────────────────────────────────────────────
  const [geminiKey,        setGeminiKey]        = useState('');
  const [geminiKeyStatus,  setGeminiKeyStatus]  = useState<'idle' | 'validating' | 'valid' | 'invalid' | 'no_model'>('idle');
  const [_geminiModel,     setGeminiModel]      = useState<string | null>(null);
  const geminiDebounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const probeIdRef         = useRef(0);

  // ── Cloud Backup state ───────────────────────────────────────────────────────
  const [driveState, setDriveState] = useState<{
    connected:   boolean;
    lastSynced:  string | null;
    pendingSync: boolean;
    error:       DriveError;
  }>({ connected: false, lastSynced: null, pendingSync: false, error: null });
  const [driveConnecting,       setDriveConnecting]       = useState(false);
  const [driveSyncing,          setDriveSyncing]          = useState(false);
  const [driveDisconnectDialog,   setDriveDisconnectDialog]   = useState(false);
  const [disconnectDeleteBackup,  setDisconnectDeleteBackup]  = useState(false);
  const [driveRestoreCase,      setDriveRestoreCase]      = useState<'empty' | 'conflict' | null>(null);
  const [driveRestoreData,      setDriveRestoreData]      = useState<DriveBackupFile | null>(null);
  const [driveLocalProfile,     setDriveLocalProfile]     = useState<Partial<Profile> | null>(null);
  const [driveRestoreBusy,      setDriveRestoreBusy]      = useState(false);
  const [driveConflictChanges,  setDriveConflictChanges]  = useState<FieldChange[]>([]);
  const [driveConflictScreen,   setDriveConflictScreen]   = useState<'summary' | 'review'>('summary');
  const [resetScope,            setResetScope]            = useState<'device' | 'everywhere'>('device');

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
      showToast('success', 'API key saved.');

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
        if (exportData.learnedMappings) await saveLearnedMappings(exportData.learnedMappings);
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

    // Non-empty profile: compute diff and show summary → review flow.
    const diff = generateDiff(currentProfile ?? {}, validation.sanitized);
    setImportBaseProfile(currentProfile ?? {});
    setImportChanges(diff);
    setParsedImport({ sanitized: validation.sanitized, invalidFields: validation.invalidFields, exportData });
    setImportScreen('summary');
  };

  // ── Import — shared save helper ───────────────────────────────────────────────

  const performImportSave = async (finalChanges: FieldChange[]) => {
    if (!parsedImport) return;
    setImporting(true);
    try {
      const applied = applyChanges(importBaseProfile, finalChanges);
      await saveProfile(applied as Profile);
      if (parsedImport.exportData.learnedMappings) {
        await saveLearnedMappings(parsedImport.exportData.learnedMappings);
      }
      if (parsedImport.exportData.applicationHistory) {
        await saveApplicationHistory(parsedImport.exportData.applicationHistory);
      }
      const skipped = parsedImport.invalidFields.length;
      const suffix  = skipped > 0 ? ` (${skipped} field${skipped !== 1 ? 's' : ''} skipped)` : '';
      showToast('success', `Profile imported successfully${suffix}`);
      setImportScreen('idle');
      setImportChanges([]);
      setImportBaseProfile({});
      setParsedImport(null);
      onImportComplete();
    } catch (err) {
      console.error('[Job Buddy] Import failed:', err);
      showToast('error', 'Import failed. Please try again.');
    } finally {
      setImporting(false);
    }
  };

  const handleImportAcceptAll = () => {
    void performImportSave(importChanges);
  };

  const handleImportReviewSave = async (finalChanges: FieldChange[]) => {
    await performImportSave(finalChanges);
  };

  const handleImportRejectAll = () => {
    setImportScreen('idle');
    setImportChanges([]);
    setImportBaseProfile({});
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
          const diff = generateDiff(localProfile ?? {}, backup.profile);
          setDriveConflictChanges(diff);
          setDriveConflictScreen('summary');
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
    setDisconnectDeleteBackup(false);
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
    setDriveConflictChanges([]);
    setDriveConflictScreen('summary');
  };

  const handleRestoreFromDrive = async () => {
    if (!driveRestoreData) return;
    setDriveRestoreBusy(true);
    try {
      const validation = validateImportedProfile(driveRestoreData.profile);
      if (Object.keys(validation.sanitized).length === 0) {
        showToast('error', 'Drive backup contains invalid profile data.');
        closeRestoreDialog();
        return;
      }
      await saveProfile(validation.sanitized as Profile);
      if (driveRestoreData.learnedMappings) {
        await saveLearnedMappings(driveRestoreData.learnedMappings);
      }
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

  const handleDriveReviewSave = async (finalChanges: FieldChange[]) => {
    if (!driveLocalProfile) return;
    setDriveRestoreBusy(true);
    try {
      const applied = applyChanges(driveLocalProfile, finalChanges);
      await saveProfile(applied as Profile);
      if (driveRestoreData?.learnedMappings) {
        await saveLearnedMappings(driveRestoreData.learnedMappings);
      }
      void syncProfileToDrive(applied as Profile);
      showToast('success', 'Profile updated from Drive backup');
      onImportComplete();
      closeRestoreDialog();
    } catch {
      showToast('error', 'Save failed. Please try again.');
    } finally {
      setDriveRestoreBusy(false);
    }
  };

  // ── Reset All Data ───────────────────────────────────────────────────────────

  const handleReset = async () => {
    if (resetConfirmText !== 'DELETE') return;
    setResetting(true);
    try {
      if (driveState.connected) {
        // 'device' → keep Drive backup file; 'everywhere' → delete it
        await disconnectDrive(resetScope === 'everywhere');
      }
      await clearAllStorage();
      setShowResetDialog(false);
      setResetConfirmText('');
      setResetScope('device');
      showToast('success', 'All data has been reset.');
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

      {/* ── Appearance ────────────────────────────────────────────────────────── */}
      <section className="mb-8 pb-8 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-1">Appearance</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Choose how Job Buddy looks on your device.
        </p>
        <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
          {(['system', 'light', 'dark'] as const).map((opt, i, arr) => (
            <button
              key={opt}
              type="button"
              onClick={() => handleThemeChange(opt)}
              className={[
                'px-4 py-1.5 text-sm font-medium capitalize transition-colors',
                i < arr.length - 1 ? 'border-r border-gray-300 dark:border-gray-600' : '',
                themePreference === opt
                  ? 'bg-blue-600 text-white border-blue-600 dark:border-blue-600'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700',
              ].join(' ')}
            >
              {opt.charAt(0).toUpperCase() + opt.slice(1)}
            </button>
          ))}
        </div>
      </section>

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
          </div>
        )}
      </section>

      {/* ── Privacy notice ────────────────────────────────────────────────────── */}
      <p className="mb-8 text-xs text-gray-500 dark:text-gray-400">
        {driveState.connected
          ? 'Your profile data is stored locally and backed up to your Google Drive.'
          : 'Your profile data stays on this device and is never sent anywhere.'
        }{' '}
        <a
          href="https://myowinthein.github.io/job-buddy/privacy/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline font-medium"
        >
          Privacy Policy
        </a>
        {' · '}
        <a
          href="https://myowinthein.github.io/job-buddy/terms/"
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
          Support on Ko-fi ☕
        </a>
      </p>

      {/* ── Reset All Data ───────────────────────────────────────────────────── */}
      <section className="pt-2">
        <h3 className="text-base font-semibold text-red-700 dark:text-red-400 mb-1">Reset All Data</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Permanently delete your profile, learned autofill mappings, and all data from this browser. This cannot be undone.
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

      {/* ── Import Profile — summary / review dialogs ──────────────────────────── */}
      {importScreen === 'summary' && (
        <ImportSummaryDialog
          changes={importChanges}
          title="Import Profile"
          onAcceptAll={handleImportAcceptAll}
          onRejectAll={handleImportRejectAll}
          onReview={() => setImportScreen('review')}
          isProcessing={importing}
        />
      )}
      {importScreen === 'review' && (
        <ImportReviewScreen
          changes={importChanges}
          onSave={handleImportReviewSave}
          onBack={() => setImportScreen('summary')}
          isSaving={importing}
          title="Review Import"
          saveLabel="Import Selected"
        />
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
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                This will permanently delete your profile, learned autofill mappings, and all data from this browser.
              </p>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                Consider{' '}
                <button type="button" className="underline hover:text-gray-900 dark:hover:text-gray-100 transition-colors" onClick={handleExport}>
                  exporting your profile first
                </button>.
              </p>
              <p className="text-sm font-medium text-red-600 dark:text-red-400 mb-5">This cannot be undone.</p>

              {driveState.connected && (
                <div className="mb-5">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-2">Also reset Google Drive?</p>
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
                          Disconnects Drive. Your Drive backup file is kept.
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
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">This device and Google Drive</span>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          Disconnects Drive and deletes the Drive backup file.
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
          onClick={() => { setDriveDisconnectDialog(false); setDisconnectDeleteBackup(false); }}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl dark:shadow-black/60 w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">What to do with your Drive backup?</h3>
              <button
                type="button"
                onClick={() => { setDriveDisconnectDialog(false); setDisconnectDeleteBackup(false); }}
                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none active:scale-95 transition-colors"
              >
                ×
              </button>
            </div>
            <div className="px-6 py-5 space-y-3">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name="disconnectScope"
                  checked={!disconnectDeleteBackup}
                  onChange={() => setDisconnectDeleteBackup(false)}
                  className="mt-0.5 text-blue-600"
                />
                <div>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Keep the backup file</span>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Your Drive backup remains accessible if you reconnect later.
                  </p>
                </div>
              </label>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name="disconnectScope"
                  checked={disconnectDeleteBackup}
                  onChange={() => setDisconnectDeleteBackup(true)}
                  className="mt-0.5 text-blue-600"
                />
                <div>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Delete the backup file</span>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Permanently removes the backup from Google Drive.
                  </p>
                </div>
              </label>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={() => { setDriveDisconnectDialog(false); setDisconnectDeleteBackup(false); }}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-95 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDriveDisconnect(disconnectDeleteBackup)}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 active:scale-95 transition-colors"
              >
                Disconnect
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

      {/* ── Drive restore — conflict: summary → review ────────────────────────── */}
      {driveRestoreCase === 'conflict' && driveConflictScreen === 'summary' && (
        <ImportSummaryDialog
          changes={driveConflictChanges}
          title="Profile Conflict"
          onAcceptAll={() => void handleRestoreFromDrive()}
          onRejectAll={() => void handleKeepLocal()}
          onReview={() => setDriveConflictScreen('review')}
          isProcessing={driveRestoreBusy}
        />
      )}
      {driveRestoreCase === 'conflict' && driveConflictScreen === 'review' && (
        <ImportReviewScreen
          changes={driveConflictChanges}
          onSave={handleDriveReviewSave}
          onBack={() => setDriveConflictScreen('summary')}
          isSaving={driveRestoreBusy}
          title="Review Drive Backup"
          saveLabel="Apply Selected"
        />
      )}
    </div>
  );
}
