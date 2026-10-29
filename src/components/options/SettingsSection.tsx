import { SettingsDialog } from './shared/SettingsDialog';
import { ImportWarnings } from '@/src/components/shared/ImportWarnings';
import { SectionHeader } from './shared/SectionHeader';
import { useState, useRef, useEffect } from 'react';
import type { Profile } from '@/src/types/profile';
import type { LearnedMappings, ApplicationEntry, DriveBackupFile, DriveError } from '@/src/types/storage';
import {
  getProfile,
  saveProfile,
  getLearnedMappings,
  getApplicationHistory,
  saveLearnedMappings,
  mergeLearnedMappings,
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
import { validateImportedProfile } from '@/src/utils/profileValidator';
import type { InvalidField } from '@/src/utils/profileValidator';
import { useToast } from '@/src/components/ui/useToast';
import { useEscapeToClose } from '@/src/components/ui/useEscapeToClose';
import { validateApiKey, checkApiKey } from '@/src/resume-ai/gemini';
import {
  getFullDriveState,
  connectDrive,
  inspectDriveBackup,
  finishDriveReview,
  completeDriveRestore,
  disconnectDrive,
  syncProfileToDrive,
  overwriteDriveWithLocal,
  isDriveConfigured,
} from '@/src/utils/driveSync';
import type { ConnectResult, FullDriveState } from '@/src/utils/driveSync';
import { generateDiff, applyChanges, FIELD_DEFS } from '@/src/resume-ai/parser';
import { acceptAllChanges, backupDataChanges, mergeApplicationHistory, selectedBackupData, validateBackupData } from '@/src/utils/backupImport';
import { calculateDerivedFields } from '@/src/utils/derivedFields';
import { DEFAULT_GEMINI_MODEL, GEMINI_MODEL_PRIORITY, MODEL_DISPLAY_NAMES, toGeminiModel } from '@/src/resume-ai/types';
import type { FieldChange, GeminiModel } from '@/src/resume-ai/types';
import ImportSummaryDialog from '@/src/components/shared/ImportSummaryDialog';
import ImportReviewScreen from '@/src/components/shared/ImportReviewScreen';

interface Props {
  onImportComplete: () => void;
  onResetComplete:  () => void;
}

interface ParsedImport {
  invalidFields: InvalidField[];
}


// ── Shared button classes ────────────────────────────────────────────────────
// disabled:opacity-50 is harmless on buttons that never receive a `disabled`
// prop — the pseudo-class simply never matches — so one constant per variant
// covers every button in this file, rather than fieldCls.ts-style per-state
// strings.
const btnPrimaryCls   = 'px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 active:scale-95 transition-colors';
const btnSecondaryCls = 'px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 active:scale-95 transition-colors';
const footerLinkCls = 'rounded-sm hover:text-blue-600 dark:hover:text-blue-400 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-500 transition-colors';

// ── Drive timestamp formatter ────────────────────────────────────────────────
// Timestamps are stored as UTC ISO strings. Display converts to local timezone:
//   "Today at HH:mm" / "Yesterday at HH:mm" / full locale date for older entries.
function fmtDriveTimestamp(iso: string | null): string {
  if (!iso) return 'No backup yet';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'No backup yet';

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
    return 'No backup yet';
  }
}

// Optional-only profiles also contain user data and must get import review.
function isProfileEmpty(profile: Partial<Profile> | null): boolean {
  return !profile || FIELD_DEFS.every((field) => field.isEmpty(field.getValue(profile)));
}

// Shared by JSON imports and both Drive restore paths. Learned mappings are
// always merged, never overwritten, so an older import can't erase newer learning.
async function saveImportedData(
  profile: Profile,
  learnedMappings: LearnedMappings | undefined,
  applicationHistory: ApplicationEntry[] | undefined,
): Promise<void> {
  profile = { ...profile, id: profile.id || crypto.randomUUID() };
  let updated = profile;
  try { updated = { ...profile, derived: calculateDerivedFields(profile) }; }
  catch { /* Keep the accepted raw data even when derivation fails. */ }
  await saveProfile(updated);
  if (learnedMappings) {
    const localMappings = await getLearnedMappings();
    await saveLearnedMappings(mergeLearnedMappings(localMappings, learnedMappings));
  }
  if (applicationHistory) await saveApplicationHistory(mergeApplicationHistory(await getApplicationHistory(), applicationHistory));
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SettingsSection({ onImportComplete, onResetComplete }: Props) {
  const { showToast } = useToast();
  const [importing,     setImporting]     = useState(false);
  const [showResetDialog,    setShowResetDialog]    = useState(false);
  const [resetConfirmText,   setResetConfirmText]   = useState('');
  const [resetting,          setResetting]          = useState(false);

  const [parsedImport,      setParsedImport]      = useState<ParsedImport | null>(null);
  const [importScreen,      setImportScreen]      = useState<'idle' | 'summary' | 'review'>('idle');
  const [importChanges,     setImportChanges]     = useState<FieldChange[]>([]);
  const [importBaseProfile, setImportBaseProfile] = useState<Partial<Profile>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const importButtonRef = useRef<HTMLButtonElement>(null);

  // ── Appearance state ─────────────────────────────────────────────────────────
  // getCurrentTheme() is synchronous — initTheme() is awaited before React
  // renders, so the correct preference is already cached in theme.ts.
  const [themePreference, setThemePreference] = useState<ThemePreference>(getCurrentTheme);

  const handleThemeChange = async (value: ThemePreference) => {
    const previous = getCurrentTheme();
    setThemePreference(value);
    applyTheme(value);
    try { await saveThemePreference(value); }
    catch {
      setThemePreference(previous);
      applyTheme(previous);
      showToast('error', 'Could not save appearance. Please try again.');
    }
  };

  // ── AI Features state ────────────────────────────────────────────────────────
  const [geminiKey,        setGeminiKey]        = useState('');
  const [geminiKeyStatus,  setGeminiKeyStatus]  = useState<'idle' | 'validating' | 'valid' | 'invalid' | 'no_model'>('idle');
  const [geminiModel,      setGeminiModelState] = useState<GeminiModel>(DEFAULT_GEMINI_MODEL);
  const geminiDebounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const probeIdRef         = useRef(0);

  // The pending debounce is otherwise only cleared when the input changes
  // again — without this, navigating away from Settings mid-debounce leaves
  // the timeout to fire later and call setState on an unmounted component.
  useEffect(() => {
    return () => {
      if (geminiDebounceRef.current) clearTimeout(geminiDebounceRef.current);
    };
  }, []);

  // ── Cloud Backup state ───────────────────────────────────────────────────────
  const [driveState, setDriveState] = useState<FullDriveState>({ connected: false, lastSynced: null, pendingSync: false, error: null });
  const [driveConnecting,       setDriveConnecting]       = useState(false);
  const [driveSyncing,          setDriveSyncing]          = useState(false);
  const [driveDisconnectDialog,   setDriveDisconnectDialog]   = useState(false);
  const [driveDisconnectBusy, setDriveDisconnectBusy] = useState(false);
  const [disconnectDeleteBackup,  setDisconnectDeleteBackup]  = useState(false);
  const [driveRestoreCase,      setDriveRestoreCase]      = useState<'empty' | 'conflict' | null>(null);
  const [driveRestoreData,      setDriveRestoreData]      = useState<DriveBackupFile | null>(null);
  const [driveLocalProfile,     setDriveLocalProfile]     = useState<Partial<Profile> | null>(null);
  const [driveRestoreBusy,      setDriveRestoreBusy]      = useState(false);
  const [driveReviewId, setDriveReviewId] = useState<string | undefined>();
  const [driveConflictChanges,  setDriveConflictChanges]  = useState<FieldChange[]>([]);
  const [driveImportWarnings, setDriveImportWarnings] = useState<string[]>([]);
  const [driveConflictScreen,   setDriveConflictScreen]   = useState<'summary' | 'review'>('summary');
  const [resetScope,            setResetScope]            = useState<'device' | 'everywhere'>('device');

  useEffect(() => {
    Promise.all([getGeminiApiKey(), getGeminiModel()]).then(([key, model]) => {
      if (key) {
        setGeminiKey(key);
        setGeminiKeyStatus('valid');
        setGeminiModelState(toGeminiModel(model));
      }
    });
  }, []);

  // Storage events reach other Options tabs and background-worker updates.
  useEffect(() => {
    let active = true;
    const handler = () => {
      void getFullDriveState().then((state) => { if (active) setDriveState(state); }).catch(() => {});
    };
    const storageHandler = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && ('driveToken' in changes || 'driveBackupState' in changes)) handler();
    };
    handler();
    window.addEventListener('jb:drive:state-changed', handler);
    if (typeof chrome !== 'undefined') chrome.storage?.onChanged?.addListener(storageHandler);
    return () => {
      active = false;
      window.removeEventListener('jb:drive:state-changed', handler);
      if (typeof chrome !== 'undefined') chrome.storage?.onChanged?.removeListener(storageHandler);
    };
  }, []);
  useEffect(() => {
    if (!driveState.tokenExpiresAt) return;
    const delay = driveState.tokenExpiresAt - Date.now();
    if (delay <= 0) return;
    const timer = window.setTimeout(() => {
      void getFullDriveState().then(setDriveState).catch(() => {});
    }, Math.min(delay + 1, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [driveState.tokenExpiresAt]);

  const handleGeminiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const key = e.target.value;
    setGeminiKey(key);
    if (geminiDebounceRef.current) clearTimeout(geminiDebounceRef.current);

    if (!key.trim()) {
      probeIdRef.current++; // invalidate any in-flight debounce callback below
      setGeminiKeyStatus('idle');
      void clearGeminiSettings();
      return;
    }

    geminiDebounceRef.current = setTimeout(async () => {
      const trimmed = key.trim();
      // Guards the whole callback, not just the probe step — if the key is
      // cleared or changed again before this settles, every checkpoint below
      // bails out rather than resurrecting a stale value.
      const callId = ++probeIdRef.current;

      // Step 1: validate the key independently via the models list endpoint
      setGeminiKeyStatus('validating');
      const keyCheck = await checkApiKey(trimmed);
      if (callId !== probeIdRef.current) return;

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
      if (callId !== probeIdRef.current) return;
      setGeminiKeyStatus('valid');
      setGeminiModelState(DEFAULT_GEMINI_MODEL);
      showToast('success', 'API key saved.');

      // Step 3: background model probe — fully decoupled from key validation
      const result = await validateApiKey(trimmed);
      if (callId !== probeIdRef.current) return;

      if (result.valid && result.model && result.model !== DEFAULT_GEMINI_MODEL) {
        await saveGeminiModel(result.model);
        setGeminiModelState(result.model);
      } else if (result.keyValidNoModel) {
        setGeminiKeyStatus('no_model');
      } else if (result.keyInvalid) {
        await clearGeminiSettings();
        setGeminiKeyStatus('invalid');
      }
      // Network error during probe: leave key + default model in storage
    }, 800);
  };

  const handleGeminiModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as GeminiModel;
    setGeminiModelState(value);
    void saveGeminiModel(value);
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

    setImporting(true);
    try {
      let parsed: unknown;
      try { parsed = JSON.parse(await file.text()); }
      catch { showToast('error', 'Invalid file. Please select a valid Job Buddy export file.'); return; }
      if (!parsed || typeof parsed !== 'object' || !('profile' in parsed)) {
        showToast('error', 'Invalid file. Please select a valid Job Buddy export file.');
        return;
      }
      const raw = parsed as Record<string, unknown>;
      if (!raw.profile || typeof raw.profile !== 'object' || Array.isArray(raw.profile)) {
        showToast('error', 'This file does not contain a valid profile.');
        return;
      }
      const validation = validateImportedProfile(raw.profile);
      const backup = validateBackupData(raw);
      const invalidFields = [...validation.invalidFields, ...backup.invalidFields];
      const [currentProfile, localMappings, localHistory] = await Promise.all([getProfile(), getLearnedMappings(), getApplicationHistory()]);
      const metadataChanges = backupDataChanges(localMappings, backup.learnedMappings, localHistory, backup.applicationHistory);
      const hasIncomingData = !isProfileEmpty(validation.sanitized) || metadataChanges.some((change) => change.status !== 'unchanged');
      // Fully valid files still import immediately when there is no profile to replace.
      // Partly invalid files show their skipped items before any data is written.
      if (isProfileEmpty(currentProfile) && !invalidFields.length && hasIncomingData) {
        await saveImportedData(validation.sanitized as Profile, backup.learnedMappings, backup.applicationHistory);
        showToast('success', 'Profile imported successfully');
        onImportComplete();
        return;
      }
      const diff = [
        ...generateDiff(currentProfile ?? {}, validation.sanitized),
        ...metadataChanges,
      ];
      setImportBaseProfile(currentProfile ?? {});
      setImportChanges(diff);
      setParsedImport({ invalidFields });
      setImportScreen('summary');
    } catch (err) {
      console.error('[Job Buddy] Import failed:', err);
      showToast('error', 'Import failed. Please try again.');
    } finally { setImporting(false); }
  };

  // ── Import — shared save helper ───────────────────────────────────────────────

  const performImportSave = async (finalChanges: FieldChange[]) => {
    if (!parsedImport) return;
    setImporting(true);
    try {
      if (!finalChanges.some((change) => change.status !== 'unchanged' && change.accepted)) return;
      const latestProfile = await getProfile();
      const applied = applyChanges(latestProfile ?? importBaseProfile, finalChanges);
      const backup = selectedBackupData(finalChanges);
      await saveImportedData(applied as Profile, backup.learnedMappings, backup.applicationHistory);
      const skipped = parsedImport.invalidFields.length;
      const suffix  = skipped > 0 ? ` (${skipped} item${skipped !== 1 ? 's' : ''} skipped)` : '';
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
    void performImportSave(acceptAllChanges(importChanges));
  };

  const handleImportRejectAll = () => {
    setImportScreen('idle');
    setImportChanges([]);
    setImportBaseProfile({});
    setParsedImport(null);
  };

  // ── Cloud Backup — handlers ──────────────────────────────────────────────────

  const driveFailureText = (error: DriveError) => error === 'token_expired'
    ? 'Reconnect Google Drive to continue backups.'
    : error === 'storage_full' ? 'Google Drive is full. Free up space, then try again.'
    : error === 'invalid_backup' ? 'The Drive backup could not be read. Your profile is unchanged.'
    : error === 'delete_failed' ? 'The Drive backup could not be deleted. Try disconnecting again.'
    : error === 'review_required' ? 'Review the Drive backup before continuing.'
    : 'Backup failed. Your profile is saved in this browser. A retry is scheduled.';

  const handleDriveBackupResult = async (result: ConnectResult) => {
    if (result.errorCode) { showToast('warning', driveFailureText(result.errorCode)); return; }
    const { backup } = result;
    setDriveReviewId(result.reviewId);
    const localProfile = await getProfile();
    setDriveLocalProfile(localProfile);
    if (backup) {
      const validation = validateImportedProfile(backup.profile);
      if (Object.keys(validation.sanitized).length === 0) {
        showToast('error', 'The Drive backup contains no valid profile data. Your profile is unchanged.');
        return;
      }
      const backupData = validateBackupData({ learnedMappings: backup.learnedMappings });
      setDriveImportWarnings([...validation.invalidFields, ...backupData.invalidFields].map((field) => `${field.path}: ${field.reason}`));
      const validatedBackup = { ...backup, profile: validation.sanitized as Profile, learnedMappings: backupData.learnedMappings };
      if (isProfileEmpty(localProfile)) {
        setDriveRestoreCase('empty');
        setDriveRestoreData(validatedBackup);
      } else {
        const localMappings = await getLearnedMappings();
        const diff = [...generateDiff(localProfile ?? {}, validatedBackup.profile), ...backupDataChanges(localMappings, validatedBackup.learnedMappings)];
        if (diff.every((change) => change.status === 'unchanged') && validation.invalidFields.length === 0 && backupData.invalidFields.length === 0) {
          await finishDriveReview(result.reviewId);
          showToast('success', 'Drive backup is up to date.');
          return;
        }
        setDriveConflictChanges(diff);
        setDriveConflictScreen('summary');
        setDriveRestoreCase('conflict');
        setDriveRestoreData(validatedBackup);
      }
    } else if (localProfile) {
      const synced = await syncProfileToDrive(localProfile);
      showToast(synced.success ? 'success' : 'warning', synced.success ? 'Profile backed up to Google Drive.' : driveFailureText(synced.errorCode));
    }
  };
  const handleDriveConnect = async () => {
    setDriveConnecting(true);
    try { await handleDriveBackupResult(await connectDrive()); }
    catch { showToast('error', 'Could not connect to Google Drive. Please try again.'); }
    finally { setDriveConnecting(false); }
  };
  const handleDriveCheck = async () => {
    setDriveConnecting(true);
    try { await handleDriveBackupResult(await inspectDriveBackup()); }
    catch { showToast('error', 'Could not check the Drive backup. Please try again.'); }
    finally { setDriveConnecting(false); }
  };
  const handleDriveSyncNow = async () => {
    if (driveState.reviewRequired) { await handleDriveCheck(); return; }
    setDriveSyncing(true);
    try {
      const profile = await getProfile();
      if (!profile) { showToast('warning', 'No profile data to back up.'); return; }
      const result = await syncProfileToDrive(profile);
      if (result.success) showToast('success', 'Profile backed up to Google Drive.');
      else if (result.errorCode) showToast('warning', driveFailureText(result.errorCode));
    } catch { showToast('error', 'Backup failed. Your profile is saved in this browser.'); }
    finally { setDriveSyncing(false); }
  };
  const handleDriveDisconnect = async (deleteFile: boolean) => {
    setDriveDisconnectBusy(true);
    try {
      await disconnectDrive(deleteFile);
      setDriveDisconnectDialog(false);
      setDisconnectDeleteBackup(false);
      showToast('success', deleteFile ? 'Drive backup deleted. Google Drive disconnected.' : 'Google Drive disconnected. Your last backup was kept.');
    } catch {
      showToast('error', deleteFile ? 'Could not delete the Drive backup. Reconnect or try again.' : 'Could not disconnect Google Drive. Please try again.');
    } finally { setDriveDisconnectBusy(false); }
  };

  const closeRestoreDialog = () => {
    setDriveRestoreCase(null);
    setDriveRestoreData(null);
    setDriveLocalProfile(null);
    setDriveConflictChanges([]);
    setDriveConflictScreen('summary');
    setDriveImportWarnings([]);
  };

  // closeRestoreDialog() is also called internally by the async handlers
  // below on success, before their own `finally` clears driveRestoreBusy —
  // guarding closeRestoreDialog itself would block those. This wrapper is
  // for the user-facing dismiss controls (backdrop, ×, Skip) only.
  const dismissRestoreDialog = () => {
    if (driveRestoreBusy) return;
    closeRestoreDialog();
  };

  const closeDriveDisconnectDialog = () => {
    if (driveDisconnectBusy) return;
    setDriveDisconnectDialog(false);
    setDisconnectDeleteBackup(false);
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
      await completeDriveRestore(driveReviewId, async () => {
        const latestProfile = await getProfile();
        const changes = driveRestoreCase === 'conflict' ? acceptAllChanges(driveConflictChanges)
          : generateDiff(driveLocalProfile ?? {}, validation.sanitized);
        const restored = driveRestoreCase === 'empty' && isProfileEmpty(latestProfile)
          ? validation.sanitized
          : applyChanges(latestProfile ?? { id: driveRestoreData.profile.id }, changes);
        await saveImportedData(restored as Profile, driveRestoreCase === 'conflict'
          ? selectedBackupData(changes).learnedMappings : driveRestoreData.learnedMappings, undefined);
      });
      const fresh = await getFullDriveState();
      setDriveState(fresh);
      showToast('success', 'Profile restored from Google Drive.');
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
      const latestProfile = await getProfile();
      const res = await overwriteDriveWithLocal((latestProfile ?? driveLocalProfile) as Profile, driveReviewId);
      if (res.success) {
        showToast('success', 'Profile backed up to Google Drive.');
      } else if (res.errorCode) {
        showToast('warning', driveFailureText(res.errorCode));
        return;
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
      if (!finalChanges.some((change) => change.accepted && change.status !== 'unchanged')) return;
      await completeDriveRestore(driveReviewId, async () => {
        const latestProfile = await getProfile();
        const applied = applyChanges(latestProfile ?? driveLocalProfile, finalChanges);
        await saveImportedData(applied as Profile, selectedBackupData(finalChanges).learnedMappings, undefined);
      });
      showToast('success', 'Profile restored from Google Drive.');
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
      const freshDriveState = await getFullDriveState();
      if (freshDriveState.connected) {
        // 'device' → keep Drive backup file; 'everywhere' → delete it
        await disconnectDrive(resetScope === 'everywhere');
      }
      if (geminiDebounceRef.current) clearTimeout(geminiDebounceRef.current);
      probeIdRef.current++;
      await clearAllStorage();
      // clearAllStorage() only covers profile/learnedMappings/applicationHistory —
      // the UI copy promises "all data from this browser", so the Gemini key
      // and theme preference need to go too.
      await clearGeminiSettings();
      await saveThemePreference('system');
      setThemePreference('system');
      applyTheme('system');
      // SettingsSection stays mounted across a reset (it isn't remounted the
      // way profile sections are), so its own displayed state needs to catch
      // up too — same pairing already used for the keyInvalid probe case above.
      setGeminiKey('');
      setGeminiKeyStatus('idle');
      setGeminiModelState(DEFAULT_GEMINI_MODEL);
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
    // No-op while a reset is actually in flight — matches ImportReviewScreen's
    // isSaving guard. clearAllStorage() etc. aren't meaningfully cancelable
    // mid-flight, so dismissing here would just hide the dialog while the
    // reset kept running with no visible UI.
    if (resetting) return;
    setShowResetDialog(false);
    setResetConfirmText('');
    setResetScope('device');
  };

  // Each reuses the exact same handler its dialog's backdrop click already
  // uses, guards included. Shared summary/review dialogs manage their own
  // dismissal separately from data actions.
  useEscapeToClose(showResetDialog ? handleResetDialogClose : undefined);

  return (
    <div>
      <SectionHeader sectionId="settings" />

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
              onClick={() => void handleThemeChange(opt)}
              aria-pressed={themePreference === opt}
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

        {(geminiKeyStatus === 'valid' || geminiKeyStatus === 'no_model') && (
          <div className="mt-4 max-w-md">
            <label htmlFor="gemini-model" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              AI Model
            </label>
            <select
              id="gemini-model"
              value={geminiModel}
              onChange={handleGeminiModelChange}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {GEMINI_MODEL_PRIORITY.map((m) => (
                <option key={m} value={m}>{MODEL_DISPLAY_NAMES[m]}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Job Buddy selects a working model for your key. Change it if needed.
            </p>
          </div>
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
          Back up your profile as JSON or transfer it to another browser or device.
        </p>
        <button
          type="button"
          onClick={handleExport}
          className={btnPrimaryCls}
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
          ref={importButtonRef}
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          className={btnSecondaryCls}
        >
          Choose File
        </button>
      </section>

      {/* ── Cloud Backup ──────────────────────────────────────────────────────── */}
      <section className="mb-8 pb-8 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-1">Cloud Backup</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Automatically back up your profile and learned mappings to Google Drive.
        </p>

        {!driveState.connected && !driveConnecting && !isDriveConfigured() && (
          <p className="text-sm text-gray-500 dark:text-gray-400">Google Drive backup is unavailable in this build.</p>
        )}
        {!driveState.connected && !driveConnecting && isDriveConfigured() && (
          <button type="button" onClick={handleDriveConnect} className={btnPrimaryCls}>Connect Google Drive</button>
        )}
        {driveConnecting && <p className="text-sm text-gray-500 dark:text-gray-400" role="status">Checking Drive backup…</p>}
        {driveState.connected && !driveConnecting && (
          <div className="space-y-2">
            <div className="space-y-3">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 break-all">
                    {driveState.accountEmail || 'Google Drive'}
                  </p>
                  <span role="status" className={`inline-flex items-center gap-1.5 text-xs ${driveState.error || driveState.reviewRequired || driveState.pendingSync ? 'text-amber-700 dark:text-amber-400' : 'text-green-700 dark:text-green-400'}`}>
                    <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
                    {driveState.error === 'token_expired' ? 'Reconnect needed'
                      : driveState.error === 'sync_error' ? 'Backup pending'
                      : driveState.error || driveState.reviewRequired ? 'Backup paused'
                      : driveState.pendingSync ? 'Backup pending' : 'Connected'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {driveState.lastSynced && Number.isFinite(Date.parse(driveState.lastSynced)) ? `Last backed up: ${fmtDriveTimestamp(driveState.lastSynced)}` : 'No backup yet'}
                </p>
              </div>
              {driveState.error && <p role="status" className="text-sm text-amber-700 dark:text-amber-400">{driveFailureText(driveState.error)}</p>}
              <div className="flex flex-wrap items-center gap-2">
                <button type="button"
                  onClick={driveState.error === 'token_expired' ? handleDriveConnect
                    : driveState.reviewRequired ? handleDriveCheck : handleDriveSyncNow}
                  disabled={driveSyncing || driveDisconnectBusy || driveRestoreBusy}
                  className={btnPrimaryCls}>
                  {driveSyncing ? 'Backing up…' : driveState.error === 'token_expired' ? 'Reconnect'
                    : driveState.reviewRequired ? 'Review Backup' : driveState.error ? 'Retry Backup' : 'Back Up Now'}
                </button>
                <button type="button" onClick={() => setDriveDisconnectDialog(true)}
                  disabled={driveSyncing || driveDisconnectBusy || driveRestoreBusy}
                  className={btnSecondaryCls}>Disconnect</button>
                {driveState.error === 'storage_full' && <a href="https://one.google.com/storage" target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 dark:text-blue-400 underline">Manage Storage</a>}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── Reset All Data ───────────────────────────────────────────────────── */}
      <section className="pt-2">
        <h3 className="text-base font-semibold text-red-700 dark:text-red-400 mb-1">Reset All Data</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Delete your profile, mappings, history, and settings from this device.
        </p>
        <button
          type="button"
          onClick={() => setShowResetDialog(true)}
          className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 active:scale-95 transition-colors"
        >
          Reset Now
        </button>
      </section>

      <footer className="mt-10 pt-5 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
        <nav aria-label="Settings links" className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
          <a
            href="https://myowinthein.github.io/job-buddy/legal/privacy/"
            target="_blank"
            rel="noopener noreferrer"
            className={footerLinkCls}
          >
            Privacy Policy
          </a>
          <span aria-hidden="true">·</span>
          <a
            href="https://myowinthein.github.io/job-buddy/legal/disclaimer/"
            target="_blank"
            rel="noopener noreferrer"
            className={footerLinkCls}
          >
            Disclaimer
          </a>
          <span aria-hidden="true">·</span>
          <a
            href="https://ko-fi.com/myowinthein"
            target="_blank"
            rel="noopener noreferrer"
            className={`${footerLinkCls} inline-flex items-center gap-1 font-normal`}
          >
            Support on Ko-fi <span aria-hidden="true">↗</span>
          </a>
        </nav>
      </footer>

      {/* ── Import Profile — summary / review dialogs ──────────────────────────── */}
      {importScreen === 'summary' && (
        <ImportSummaryDialog
          changes={importChanges}
          title="Import Profile"
          returnFocusRef={importButtonRef}
          warnings={parsedImport?.invalidFields.map((field) => `${FIELD_DEFS.find((def) => def.id === field.path)?.label ?? field.path}: ${field.reason}`)}
          onDismiss={handleImportRejectAll}
          onAcceptAll={handleImportAcceptAll}
          onRejectAll={handleImportRejectAll}
          onReview={() => setImportScreen('review')}
          isProcessing={importing}
        />
      )}
      {importScreen === 'review' && (
        <ImportReviewScreen
          changes={importChanges}
          onChangesChange={setImportChanges}
          returnFocusRef={importButtonRef}
          onDismiss={handleImportRejectAll}
          warnings={parsedImport?.invalidFields.map((field) => `${FIELD_DEFS.find((def) => def.id === field.path)?.label ?? field.path}: ${field.reason}`)}
          onSave={performImportSave}
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
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-data-title"
            aria-describedby="reset-data-description"
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl dark:shadow-black/60 w-full max-w-sm p-6 mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="reset-data-title" className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Reset All Data
            </h3>
            <p id="reset-data-description" className="mt-2 text-pretty text-sm text-gray-500 dark:text-gray-400">
              This will permanently delete your profile, mappings, history, and settings from this browser.
              {driveState.connected && ' Drive will also be disconnected.'}
            </p>

            {driveState.connected && (
              <label className="mt-4 flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={resetScope === 'everywhere'}
                  disabled={resetting}
                  onChange={(e) => setResetScope(e.target.checked ? 'everywhere' : 'device')}
                  className="mt-0.5 accent-red-600"
                />
                Also delete the Drive backup
              </label>
            )}

            <div className="mt-5">
              <label htmlFor="reset-confirmation" className="block text-sm text-gray-700 dark:text-gray-300 mb-2">
                Type <code className="font-mono font-semibold text-red-600 dark:text-red-400">DELETE</code> to confirm
              </label>
              <input
                type="text"
                id="reset-confirmation"
                value={resetConfirmText}
                disabled={resetting}
                onChange={(e) => setResetConfirmText(e.target.value)}
                placeholder="DELETE"
                autoComplete="off"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={handleResetDialogClose}
                className={btnSecondaryCls}
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

      {driveDisconnectDialog && (
        <SettingsDialog title="Disconnect Google Drive" busy={driveDisconnectBusy} onDismiss={closeDriveDisconnectDialog}>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Your profile stays in this browser. Your last successful backup stays in Drive.</p>
          <label className="mt-4 flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
            <input type="checkbox" checked={disconnectDeleteBackup} disabled={driveDisconnectBusy}
              onChange={(event) => setDisconnectDeleteBackup(event.target.checked)} className="mt-0.5 accent-red-600"/>
            Also delete the Drive backup
          </label>
          {disconnectDeleteBackup && <p className="mt-2 text-xs text-red-600 dark:text-red-400">The Drive backup will be permanently deleted.</p>}
          <div className="mt-6 flex justify-end gap-3">
            <button type="button" onClick={closeDriveDisconnectDialog} disabled={driveDisconnectBusy} className={btnSecondaryCls}>Cancel</button>
            <button type="button" onClick={() => void handleDriveDisconnect(disconnectDeleteBackup)} disabled={driveDisconnectBusy}
              className={disconnectDeleteBackup ? 'px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50' : btnPrimaryCls}>
              {driveDisconnectBusy ? 'Disconnecting…' : disconnectDeleteBackup ? 'Delete & Disconnect' : 'Disconnect'}
            </button>
          </div>
        </SettingsDialog>
      )}
      {driveRestoreCase === 'empty' && driveRestoreData && (
        <SettingsDialog title="Restore Drive Backup" busy={driveRestoreBusy} onDismiss={dismissRestoreDialog}>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Restore your saved profile and learned mappings from Google Drive.</p>
          <ImportWarnings warnings={driveImportWarnings}/>
          <div className="mt-6 flex justify-end gap-3">
            <button type="button" onClick={dismissRestoreDialog} disabled={driveRestoreBusy} className={btnSecondaryCls}>Not Now</button>
            <button type="button" onClick={handleRestoreFromDrive} disabled={driveRestoreBusy} className={btnPrimaryCls}>{driveRestoreBusy ? 'Restoring…' : 'Restore All'}</button>
          </div>
        </SettingsDialog>
      )}

      {/* ── Drive restore — conflict: summary → review ────────────────────────── */}
      {driveRestoreCase === 'conflict' && driveConflictScreen === 'summary' && (
        <ImportSummaryDialog
          changes={driveConflictChanges}
          title="Restore Drive Backup"
          description="Choose which details to restore. Keeping current uploads this browser’s profile to Drive."
          acceptLabel="Restore All"
          forceDecision={driveImportWarnings.length > 0}
          warnings={driveImportWarnings}
          onDismiss={dismissRestoreDialog}
          onAcceptAll={() => void handleRestoreFromDrive()}
          onRejectAll={() => void handleKeepLocal()}
          onReview={() => setDriveConflictScreen('review')}
          isProcessing={driveRestoreBusy}
        />
      )}
      {driveRestoreCase === 'conflict' && driveConflictScreen === 'review' && (
        <ImportReviewScreen
          changes={driveConflictChanges}
          onChangesChange={setDriveConflictChanges}
          onDismiss={dismissRestoreDialog}
          incomingLabel="From Drive"
          warnings={driveImportWarnings}
          onSave={handleDriveReviewSave}
          onBack={() => setDriveConflictScreen('summary')}
          isSaving={driveRestoreBusy}
          title="Review Drive Backup"
          saveLabel="Restore Selected"
        />
      )}
    </div>
  );
}
