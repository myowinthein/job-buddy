import { documentFileSizeError } from '@/src/utils/documentLimits';
import { QuickFillSettings } from './QuickFillSettings';
import { updateQuickFillPreferences } from '@/src/quick-fill/preferences';
import { GeminiSettings } from './GeminiSettings';
import { profileData, hasCredentialSettings } from '@/src/utils/profileData';
import { SettingsDialog } from './shared/SettingsDialog';
import { ImportWarnings } from '@/src/components/shared/ImportWarnings';
import { SectionHeader } from './shared/SectionHeader';
import { useState, useRef, useEffect } from 'react';
import type { Profile } from '@/src/types/profile';
import type {
  LearnedMappings,
  DriveBackupFile,
  DriveError,
} from '@/src/types/storage';
import {
  getProfile,
  saveProfile,
  getLearnedMappings,
  saveLearnedMappings,
  mergeLearnedMappings,
  clearAllStorage,
  clearGeminiSettings,
  saveThemePreference,
} from '@/src/utils/storage';
import { applyTheme, getCurrentTheme, subscribeTheme } from '@/src/utils/theme';
import type { ThemePreference } from '@/src/utils/theme';
import { validateImportedProfile } from '@/src/utils/profileValidator';
import type { InvalidField } from '@/src/utils/profileValidator';
import { useToast } from '@/src/components/ui/useToast';
import { useEscapeToClose } from '@/src/components/ui/useEscapeToClose';
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
import {
  acceptAllChanges,
  backupDataChanges,
  selectedBackupData,
  validateBackupData,
} from '@/src/utils/backupImport';
import { calculateDerivedFields } from '@/src/utils/derivedFields';
import type { FieldChange } from '@/src/resume-ai/types';
import ImportSummaryDialog from '@/src/components/shared/ImportSummaryDialog';
import ImportReviewScreen from '@/src/components/shared/ImportReviewScreen';
import { ImportModeChoice } from '@/src/components/shared/ImportModeChoice';
import {
  assertImportCurrent,
  initialImportMode,
  possibleDifferentPerson,
  replacementChanges,
  ImportProfileChangedError,
  type ImportMode,
} from '@/src/utils/importPolicy';
import { replaceImportedProfile } from '@/src/utils/replaceImportedProfile';
import { withProfileWriteLock } from '@/src/utils/profileWriteLock';

interface Props {
  onImportComplete: () => void;
  onResetComplete: () => void;
}

interface ParsedImport {
  invalidFields: InvalidField[];
  incoming: Partial<Profile>;
  backup: ReturnType<typeof validateBackupData>;
  localMappings: LearnedMappings;
}

function backupImportChanges(
  base: Partial<Profile>,
  incoming: Partial<Profile>,
  mappings: LearnedMappings,
  backup: { learnedMappings?: LearnedMappings },
  mode: ImportMode | null,
) {
  return [
    ...(mode === 'replace' ? replacementChanges(base, incoming) : generateDiff(base, incoming)),
    ...backupDataChanges(mappings, backup.learnedMappings, mode ?? 'update'),
  ];
}

// ── Shared button classes ────────────────────────────────────────────────────
// disabled:opacity-50 is harmless on buttons that never receive a `disabled`
// prop — the pseudo-class simply never matches — so one constant per variant
// covers every button in this file, rather than fieldCls.ts-style per-state
// strings.
const btnPrimaryCls =
  'px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 active:scale-95 transition-colors';
const btnSecondaryCls =
  'px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 active:scale-95 transition-colors';
const footerLinkCls =
  'rounded-sm hover:text-blue-600 dark:hover:text-blue-400 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-500 transition-colors';

function issueReportUrl(): string {
  const url = new URL('https://github.com/myowinthein/job-buddy/issues/new');
  url.searchParams.set('template', 'report-a-problem.yml');
  const version = typeof chrome !== 'undefined' ? chrome.runtime?.getManifest?.().version : undefined;
  if (version) url.searchParams.set('version', version);
  return url.href;
}

// ── Drive timestamp formatter ────────────────────────────────────────────────
// Timestamps are stored as UTC ISO strings. Display converts to local timezone:
//   "Today at HH:mm" / "Yesterday at HH:mm" / full locale date for older entries.
function fmtDriveTimestamp(iso: string | null): string {
  if (!iso) return 'No backup yet';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'No backup yet';

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfD = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diffDays = Math.round((startOfToday - startOfD) / 86_400_000);
    const timeStr = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

    if (diffDays === 0) return `Today at ${timeStr}`;
    if (diffDays === 1) return `Yesterday at ${timeStr}`;

    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
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

// Update mode merges backup metadata with the latest saved data.
// Replacement uses replaceImportedProfile instead.
async function saveImportedData(
  profile: Profile,
  learnedMappings: LearnedMappings | undefined,
): Promise<void> {
  profile = { ...profile, id: profile.id || crypto.randomUUID() };
  let updated = profile;
  try {
    updated = { ...profile, derived: calculateDerivedFields(profile) };
  } catch {
    /* Keep the accepted raw data even when derivation fails. */
  }
  await saveProfile(updated);
  if (learnedMappings) {
    const localMappings = await getLearnedMappings();
    await saveLearnedMappings(mergeLearnedMappings(localMappings, learnedMappings));
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SettingsSection({ onImportComplete, onResetComplete }: Props) {
  const { showToast } = useToast();
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetting, setResetting] = useState(false);

  const [parsedImport, setParsedImport] = useState<ParsedImport | null>(null);
  const [importScreen, setImportScreen] = useState<'idle' | 'summary' | 'review'>('idle');
  const [importChanges, setImportChanges] = useState<FieldChange[]>([]);
  const [importBaseProfile, setImportBaseProfile] = useState<Partial<Profile>>({});
  const [importMode, setImportMode] = useState<ImportMode | null>('update');
  const chooseImportMode = (mode: ImportMode) => {
    if (!parsedImport) return;
    setImportMode(mode);
    setImportChanges(backupImportChanges(
      importBaseProfile, parsedImport.incoming, parsedImport.localMappings,
      parsedImport.backup, mode,
    ));
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const importButtonRef = useRef<HTMLButtonElement>(null);

  // ── Appearance state ─────────────────────────────────────────────────────────
  // getCurrentTheme() is synchronous — initTheme() is awaited before React
  // renders, so the correct preference is already cached in theme.ts.
  const [themePreference, setThemePreference] = useState<ThemePreference>(getCurrentTheme);
  useEffect(() => subscribeTheme(() => setThemePreference(getCurrentTheme())), []);

  const handleThemeChange = async (value: ThemePreference) => {
    const previous = getCurrentTheme();
    setThemePreference(value);
    applyTheme(value);
    try {
      await saveThemePreference(value);
    } catch {
      setThemePreference(previous);
      applyTheme(previous);
      showToast('error', 'Could not save appearance. Please try again.');
    }
  };

  const [aiResetVersion, setAiResetVersion] = useState(0);

  // ── Cloud Backup state ───────────────────────────────────────────────────────
  const [driveState, setDriveState] = useState<FullDriveState>({
    connected: false,
    lastSynced: null,
    pendingSync: false,
    error: null,
  });
  const [driveConnecting, setDriveConnecting] = useState(false);
  const [driveSyncing, setDriveSyncing] = useState(false);
  const [driveActionLabel, setDriveActionLabel] = useState('Back Up Now');
  const driveIdleLabel = !driveState.connected
    ? 'Connect Google Drive'
    : driveState.error === 'token_expired'
      ? 'Reconnect'
      : driveState.reviewRequired
        ? 'Review Backup'
        : driveState.error
          ? 'Retry Backup'
          : 'Back Up Now';
  const driveButtonLabel = driveConnecting || driveSyncing ? driveActionLabel : driveIdleLabel;
  const driveBackupBusy = driveSyncing || !!driveState.uploadingUntil;
  const [driveDisconnectDialog, setDriveDisconnectDialog] = useState(false);
  const [driveDisconnectBusy, setDriveDisconnectBusy] = useState(false);
  const [disconnectDeleteBackup, setDisconnectDeleteBackup] = useState(false);
  const [driveRestoreCase, setDriveRestoreCase] = useState<'empty' | 'conflict' | null>(null);
  const [driveRestoreData, setDriveRestoreData] = useState<DriveBackupFile | null>(null);
  const [driveLocalProfile, setDriveLocalProfile] = useState<Partial<Profile> | null>(null);
  const [driveRestoreBusy, setDriveRestoreBusy] = useState(false);
  const [driveReviewId, setDriveReviewId] = useState<string | undefined>();
  const [driveConflictChanges, setDriveConflictChanges] = useState<FieldChange[]>([]);
  const [driveImportWarnings, setDriveImportWarnings] = useState<string[]>([]);
  const [driveConflictScreen, setDriveConflictScreen] = useState<'summary' | 'review'>('summary');
  const [driveImportMode, setDriveImportMode] = useState<ImportMode | null>('update');
  const [driveLocalMappings, setDriveLocalMappings] = useState<LearnedMappings>({});
  const chooseDriveImportMode = (mode: ImportMode) => {
    if (!driveRestoreData) return;
    setDriveImportMode(mode);
    setDriveConflictChanges(backupImportChanges(
      driveLocalProfile ?? {}, driveRestoreData.profile, driveLocalMappings,
      driveRestoreData, mode,
    ));
  };
  const [resetScope, setResetScope] = useState<'device' | 'everywhere'>('device');

  // Storage events reach other Options tabs and background-worker updates.
  useEffect(() => {
    let active = true;
    const handler = () => {
      void getFullDriveState()
        .then((state) => {
          if (active) setDriveState(state);
        })
        .catch(() => {});
    };
    const storageHandler = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
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
    const timer = window.setTimeout(
      () => {
        void getFullDriveState()
          .then(setDriveState)
          .catch(() => {});
      },
      Math.min(delay + 1, 2_147_483_647),
    );
    return () => window.clearTimeout(timer);
  }, [driveState.tokenExpiresAt]);
  useEffect(() => {
    if (!driveState.uploadingUntil) return;
    const delay = Math.max(0, driveState.uploadingUntil - Date.now());
    const timer = window.setTimeout(
      () => {
        void getFullDriveState()
          .then(setDriveState)
          .catch(() => {});
      },
      Math.min(delay + 1, 2_147_483_647),
    );
    return () => window.clearTimeout(timer);
  }, [driveState.uploadingUntil]);

  // ── Export ──────────────────────────────────────────────────────────────────

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const [profile, learnedMappings] = await Promise.all([getProfile(), getLearnedMappings()]);

      if (isProfileEmpty(profile) && !Object.keys(learnedMappings).length) {
        showToast('warning', 'No saved data to export.');
        return;
      }

      const backupProfile = profileData(profile ?? { id: crypto.randomUUID() });
      const exportData = {
        _comment:
          'This is your Job Buddy profile backup. Import it back into the Job Buddy extension to restore your data.',
        version: '1.0',
        profileId: backupProfile.id,
        exportedAt: new Date().toISOString(),
        profile: backupProfile,
        learnedMappings,
      };

      const json = JSON.stringify(exportData, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `job-buddy-profile-${backupProfile.id.slice(0, 8)}-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);

      showToast('success', 'Profile exported successfully');
    } catch (err) {
      console.error('[Job Buddy] Export failed:', err);
      showToast('error', 'Failed to export profile');
    } finally {
      setExporting(false);
    }
  };

  // ── Import — file selection ──────────────────────────────────────────────────

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so the same file can be selected again
    e.target.value = '';
    if (!file) return;
    const sizeError = documentFileSizeError(file.size);
    if (sizeError) {
      showToast('error', sizeError);
      return;
    }

    setImporting(true);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(await file.text());
      } catch {
        showToast('error', 'Select a valid Job Buddy export file.');
        return;
      }
      if (!parsed || typeof parsed !== 'object' || !('profile' in parsed)) {
        showToast('error', 'Select a valid Job Buddy export file.');
        return;
      }
      const raw = parsed as Record<string, unknown>;
      if (!raw.profile || typeof raw.profile !== 'object' || Array.isArray(raw.profile)) {
        showToast('error', 'Select a valid Job Buddy export file.');
        return;
      }
      const validation = validateImportedProfile(raw.profile);
      const backup = validateBackupData(raw);
      const invalidFields = [...validation.invalidFields, ...backup.invalidFields];
      if (hasCredentialSettings(raw))
        invalidFields.push({
          path: 'AI settings',
          reason: 'API keys and connection settings are not imported.',
        });
      let [currentProfile, localMappings] = await Promise.all([
        getProfile(),
        getLearnedMappings(),
      ]);
      const metadataChanges = backupDataChanges(localMappings, backup.learnedMappings);
      const hasIncomingData =
        !isProfileEmpty(validation.sanitized) ||
        metadataChanges.some((change) => change.status !== 'unchanged');
      // Fully valid files still import immediately when there is no profile to replace.
      // Partly invalid files show their skipped items before any data is written.
      if (
        isProfileEmpty(currentProfile) && !Object.keys(localMappings).length &&
        !invalidFields.length && hasIncomingData
      ) {
        try {
          await withProfileWriteLock(async () => {
            const latest = (await getProfile({ rejectOnError: true })) ?? {};
            assertImportCurrent(currentProfile ?? {}, latest, []);
            if (!isProfileEmpty(latest)) throw new ImportProfileChangedError(latest);
            await saveImportedData(validation.sanitized as Profile, backup.learnedMappings);
          });
          showToast('success', 'Profile imported successfully');
          onImportComplete();
          return;
        } catch (error) {
          if (!(error instanceof ImportProfileChangedError)) throw error;
          currentProfile = error.current as Profile;
          localMappings = await getLearnedMappings();
          showToast('warning', error.message);
        }
      }
      const mode = initialImportMode(currentProfile ?? {}, validation.sanitized);
      const diff = backupImportChanges(
        currentProfile ?? {}, validation.sanitized, localMappings, backup, mode,
      );
      setImportMode(mode);
      setImportBaseProfile(currentProfile ?? {});
      setImportChanges(diff);
      setParsedImport({ invalidFields, incoming: validation.sanitized, backup, localMappings });
      setImportScreen('summary');
    } catch (err) {
      console.error('[Job Buddy] Import failed:', err);
      showToast('error', 'Import failed. Please try again.');
    } finally {
      setImporting(false);
    }
  };

  // ── Import — shared save helper ───────────────────────────────────────────────

  const performImportSave = async (finalChanges: FieldChange[]) => {
    if (!parsedImport || !importMode) return;
    setImporting(true);
    try {
      if (!finalChanges.some((change) => change.status !== 'unchanged' && change.accepted)) return;
      if (importMode === 'replace') await replaceImportedProfile(importBaseProfile, finalChanges);
      else {
        await withProfileWriteLock(async () => {
          const latestProfile = (await getProfile({ rejectOnError: true })) ?? {};
          assertImportCurrent(importBaseProfile, latestProfile, finalChanges);
          const applied = applyChanges(latestProfile, finalChanges);
          const backup = selectedBackupData(finalChanges);
          await saveImportedData(applied as Profile, backup.learnedMappings);
        });
      }
      const skipped = parsedImport.invalidFields.length;
      const suffix = skipped > 0 ? ` (${skipped} item${skipped !== 1 ? 's' : ''} skipped)` : '';
      showToast('success', `Profile imported successfully${suffix}`);
      setImportScreen('idle');
      setImportChanges([]);
      setImportBaseProfile({});
      setParsedImport(null);
      onImportComplete();
    } catch (err) {
      if (err instanceof ImportProfileChangedError) {
        const localMappings = await getLearnedMappings();
        const mode = initialImportMode(err.current, parsedImport.incoming);
        setImportBaseProfile(err.current);
        setImportMode(mode);
        setParsedImport({ ...parsedImport, localMappings });
        setImportChanges(backupImportChanges(
          err.current, parsedImport.incoming, localMappings, parsedImport.backup, mode,
        ));
        setImportScreen('summary');
        showToast('warning', 'Your profile changed in another tab. Review it or import the file again.');
        return;
      }
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

  const driveFailureText = (error: DriveError) =>
    error === 'token_expired'
      ? 'Reconnect Google Drive to continue backups.'
      : error === 'storage_full'
        ? 'Google Drive is full. Free up space and retry.'
        : error === 'invalid_backup'
          ? 'The Drive backup could not be read. Your profile is unchanged.'
          : error === 'delete_failed'
            ? 'The Drive backup could not be deleted. Try disconnecting again.'
            : error === 'review_required'
              ? 'Review the Drive backup before continuing.'
              : 'Backup failed and will retry. Your profile is saved in this browser.';

  const handleDriveBackupResult = async (result: ConnectResult) => {
    if (result.errorCode) {
      showToast('warning', driveFailureText(result.errorCode));
      return;
    }
    const { backup } = result;
    setDriveReviewId(result.reviewId);
    const [localProfile, localMappings] = await Promise.all([getProfile(), getLearnedMappings()]);
    setDriveLocalProfile(localProfile);
    setDriveLocalMappings(localMappings);
    if (backup) {
      const validation = validateImportedProfile(backup.profile);
      if (Object.keys(validation.sanitized).length === 0) {
        showToast(
          'error',
          'The Drive backup contains no valid profile data. Your profile is unchanged.',
        );
        return;
      }
      const backupData = validateBackupData({ learnedMappings: backup.learnedMappings });
      setDriveImportWarnings(
        [...validation.invalidFields, ...backupData.invalidFields].map(
          (field) => `${FIELD_DEFS.find((def) => def.id === field.path)?.label ?? field.path}: ${field.reason}`,
        ),
      );
      const validatedBackup = {
        ...backup,
        profile: validation.sanitized as Profile,
        learnedMappings: backupData.learnedMappings,
      };
      const mode = initialImportMode(localProfile ?? {}, validatedBackup.profile);
      setDriveImportMode(mode);
      if (isProfileEmpty(localProfile) && !Object.keys(localMappings).length) {
        setDriveRestoreCase('empty');
        setDriveRestoreData(validatedBackup);
      } else {
        const diff = backupImportChanges(
          localProfile ?? {}, validatedBackup.profile, localMappings, validatedBackup, mode,
        );
        if (
          diff.every((change) => change.status === 'unchanged') &&
          validation.invalidFields.length === 0 &&
          backupData.invalidFields.length === 0
        ) {
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
      showToast(
        synced.success ? 'success' : 'warning',
        synced.success ? 'Profile backed up to Google Drive.' : driveFailureText(synced.errorCode),
      );
    }
  };
  const handleDriveConnect = async () => {
    setDriveActionLabel(driveIdleLabel);
    setDriveConnecting(true);
    try {
      await handleDriveBackupResult(await connectDrive());
    } catch {
      showToast('error', 'Could not connect to Drive. Try again.');
    } finally {
      setDriveConnecting(false);
    }
  };
  const handleDriveCheck = async () => {
    setDriveActionLabel(driveIdleLabel);
    setDriveConnecting(true);
    try {
      await handleDriveBackupResult(await inspectDriveBackup());
    } catch {
      showToast('error', 'Could not check the Drive backup. Try again.');
    } finally {
      setDriveConnecting(false);
    }
  };
  const handleDriveSyncNow = async () => {
    if (driveState.reviewRequired) {
      await handleDriveCheck();
      return;
    }
    setDriveActionLabel(driveIdleLabel);
    setDriveSyncing(true);
    try {
      const profile = await getProfile();
      if (!profile) {
        showToast('warning', 'No profile data to back up.');
        return;
      }
      const result = await syncProfileToDrive(profile);
      if (result.success) showToast('success', 'Profile backed up to Google Drive.');
      else if (result.errorCode) showToast('warning', driveFailureText(result.errorCode));
    } catch {
      showToast('error', 'Backup failed. Your profile is saved locally.');
    } finally {
      setDriveSyncing(false);
    }
  };
  const handleDriveDisconnect = async (deleteFile: boolean) => {
    setDriveDisconnectBusy(true);
    try {
      await disconnectDrive(deleteFile);
      setDriveDisconnectDialog(false);
      setDisconnectDeleteBackup(false);
      showToast(
        'success',
        deleteFile
          ? 'Drive disconnected and backup deleted.'
          : 'Google Drive disconnected. Your last backup was kept.',
      );
    } catch {
      showToast(
        'error',
        deleteFile
          ? 'Could not delete the Drive backup. Reconnect or try again.'
          : 'Could not disconnect Drive. Try again.',
      );
    } finally {
      setDriveDisconnectBusy(false);
    }
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
    if (!driveRestoreData || (driveRestoreCase === 'conflict' && !driveImportMode)) return;
    const changes = driveRestoreCase === 'conflict' ? driveConflictChanges : backupImportChanges(
      driveLocalProfile ?? {}, driveRestoreData.profile, driveLocalMappings,
      driveRestoreData, 'update',
    );
    await handleDriveReviewSave(acceptAllChanges(changes));
  };

  const refreshDriveImport = async (current: Partial<Profile>) => {
    if (!driveRestoreData) return;
    const mappings = await getLearnedMappings();
    const mode = initialImportMode(current, driveRestoreData.profile);
    setDriveLocalProfile(current);
    setDriveLocalMappings(mappings);
    setDriveImportMode(mode);
    setDriveConflictChanges(backupImportChanges(
      current, driveRestoreData.profile, mappings, driveRestoreData, mode,
    ));
    setDriveRestoreCase('conflict');
    setDriveConflictScreen('summary');
  };

  const handleKeepLocal = async () => {
    if (!driveLocalProfile) {
      closeRestoreDialog();
      return;
    }
    setDriveRestoreBusy(true);
    try {
      const latestProfile = (await getProfile({ rejectOnError: true })) ?? {};
      assertImportCurrent(driveLocalProfile, latestProfile, []);
      const res = await overwriteDriveWithLocal(
        latestProfile as Profile,
        driveReviewId,
      );
      if (res.success) {
        showToast('success', 'Profile backed up to Google Drive.');
      } else if (res.errorCode) {
        showToast('warning', driveFailureText(res.errorCode));
        return;
      }
      closeRestoreDialog();
    } catch (error) {
      if (error instanceof ImportProfileChangedError) {
        await refreshDriveImport(error.current);
        showToast('warning', error.message);
      } else showToast('error', 'Backup failed. Please try again.');
    } finally {
      setDriveRestoreBusy(false);
    }
  };

  const handleDriveReviewSave = async (finalChanges: FieldChange[]) => {
    if (!driveRestoreData || !driveImportMode) return;
    setDriveRestoreBusy(true);
    try {
      if (
        driveRestoreCase !== 'empty' &&
        !finalChanges.some((change) => change.accepted && change.status !== 'unchanged')
      ) return;
      await completeDriveRestore(driveReviewId, async () => {
        if (driveImportMode === 'replace') {
          await replaceImportedProfile(driveLocalProfile ?? {}, finalChanges, true);
        } else {
          await withProfileWriteLock(async () => {
            const latestProfile = (await getProfile({ rejectOnError: true })) ?? {};
            assertImportCurrent(driveLocalProfile ?? {}, latestProfile, finalChanges);
            const applied = driveRestoreCase === 'empty' && isProfileEmpty(latestProfile)
              ? driveRestoreData.profile : applyChanges(latestProfile, finalChanges);
            const mappings = driveRestoreCase === 'empty'
              ? driveRestoreData.learnedMappings : selectedBackupData(finalChanges).learnedMappings;
            await saveImportedData(applied as Profile, mappings);
          });
        }
      });
      showToast('success', 'Profile restored from Google Drive.');
      onImportComplete();
      closeRestoreDialog();
    } catch (error) {
      if (error instanceof ImportProfileChangedError) {
        await refreshDriveImport(error.current);
        showToast('warning', error.message);
      } else showToast('error', 'Restore failed. Please try again.');
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
      // Fail visibly before deleting profile data if credential cleanup fails.
      await clearGeminiSettings();
      await clearAllStorage();
      await saveThemePreference('system');
      await updateQuickFillPreferences({
        enabled: true,
        fillMode: 'merge',
        disabledSites: [],
        position: undefined,
      });
      setThemePreference('system');
      applyTheme('system');
      setAiResetVersion((version) => version + 1);
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
        <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-1">
          Appearance
        </h3>
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

      <QuickFillSettings />

      <GeminiSettings key={aiResetVersion} resetInProgress={resetting} />

      {/* ── Export ────────────────────────────────────────────────────────────── */}
      <section className="mb-8 pb-8 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-1">
          Export Profile
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Back up your profile as JSON or transfer it to another browser or device.
        </p>
        <button type="button" onClick={handleExport} disabled={exporting} className={btnPrimaryCls}>
          {exporting ? 'Exporting…' : 'Download File'}
        </button>
      </section>

      {/* ── Import ────────────────────────────────────────────────────────────── */}
      <section className="mb-8 pb-8 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-1">
          Import Profile
        </h3>
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
          {importing ? 'Importing…' : 'Choose File'}
        </button>
      </section>

      {/* ── Cloud Backup ──────────────────────────────────────────────────────── */}
      <section className="mb-8 pb-8 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-1">
          Cloud Backup
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Automatically back up your profile and learned mappings to Google Drive.
        </p>

        {!driveState.connected && !driveConnecting && !isDriveConfigured() && (
          <span role="status" className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
            Google Drive backup is unavailable in this build.
          </span>
        )}
        {!driveState.connected && isDriveConfigured() && (
          <div className="space-y-3">
            {driveConnecting && (
              <span role="status" className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400">
                <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full border-2 border-current border-r-transparent animate-spin motion-reduce:animate-none" />
                Checking Drive backup…
              </span>
            )}
            <div>
              <button type="button" onClick={handleDriveConnect} disabled={driveConnecting} className={btnPrimaryCls}>
                {driveButtonLabel}
              </button>
            </div>
          </div>
        )}
        {driveState.connected && (
          <div className="space-y-2">
            <div className="space-y-3">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 break-all">
                    {driveState.accountEmail || 'Google Drive'}
                  </p>
                  <span
                    role="status"
                    className={`inline-flex items-center gap-1.5 text-xs ${driveBackupBusy || driveConnecting ? 'text-blue-600 dark:text-blue-400' : driveState.error || driveState.reviewRequired || driveState.pendingSync ? 'text-amber-700 dark:text-amber-400' : 'text-green-700 dark:text-green-400'}`}
                  >
                    {driveBackupBusy || driveConnecting ? (
                      <span
                        aria-hidden="true"
                        className="h-3 w-3 shrink-0 rounded-full border-2 border-current border-r-transparent animate-spin motion-reduce:animate-none"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-current"
                      />
                    )}
                    {driveBackupBusy
                      ? 'Backing up…'
                      : driveConnecting
                        ? 'Checking Drive backup…'
                        : driveState.error === 'token_expired'
                          ? 'Reconnect needed'
                          : driveState.error === 'sync_error'
                            ? 'Backup pending'
                            : driveState.error || driveState.reviewRequired
                              ? 'Backup paused'
                              : driveState.pendingSync
                                ? 'Backup pending'
                                : 'Connected'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {driveState.lastSynced && Number.isFinite(Date.parse(driveState.lastSynced))
                    ? `Last backed up: ${fmtDriveTimestamp(driveState.lastSynced)}`
                    : 'No backup yet'}
                </p>
              </div>
              {driveState.error && !driveBackupBusy && !driveConnecting && (
                <p role="status" className="text-sm text-amber-700 dark:text-amber-400">
                  {driveFailureText(driveState.error)}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={
                    driveState.error === 'token_expired'
                      ? handleDriveConnect
                      : driveState.reviewRequired
                        ? handleDriveCheck
                        : handleDriveSyncNow
                  }
                  disabled={driveConnecting || driveBackupBusy || driveDisconnectBusy || driveRestoreBusy}
                  className={btnPrimaryCls}
                >
                  {driveButtonLabel}
                </button>
                <button
                  type="button"
                  onClick={() => setDriveDisconnectDialog(true)}
                  disabled={driveConnecting || driveBackupBusy || driveDisconnectBusy || driveRestoreBusy}
                  className={btnSecondaryCls}
                >
                  Disconnect
                </button>
                {driveState.error === 'storage_full' && (
                  <a
                    href="https://one.google.com/storage"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 dark:text-blue-400 underline"
                  >
                    Manage Storage
                  </a>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── Reset All Data ───────────────────────────────────────────────────── */}
      <section className="pt-2">
        <h3 className="text-base font-semibold text-red-700 dark:text-red-400 mb-1">
          Reset All Data
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Delete your profile, mappings, and settings from this device.
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
        <nav
          aria-label="Settings links"
          className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium"
        >
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
            href={issueReportUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className={footerLinkCls}
          >
            Report an issue
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
          importControls={parsedImport && possibleDifferentPerson(importBaseProfile, parsedImport.incoming) && <ImportModeChoice current={importBaseProfile} incoming={parsedImport.incoming} mode={importMode} onChange={chooseImportMode} busy={importing} />}
          replacement={importMode === 'replace'}
          canProceed={importMode !== null && (importMode !== 'replace' || importChanges.some(c => c.hasIncomingValue === true))}
          forceDecision={importMode !== 'update'}
          acceptLabel={importMode === 'replace' ? 'Replace Profile' : 'Import All'}
          returnFocusRef={importButtonRef}
          warnings={parsedImport?.invalidFields.map(
            (field) =>
              `${FIELD_DEFS.find((def) => def.id === field.path)?.label ?? field.path}: ${field.reason}`,
          )}
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
          warnings={parsedImport?.invalidFields.map(
            (field) =>
              `${FIELD_DEFS.find((def) => def.id === field.path)?.label ?? field.path}: ${field.reason}`,
          )}
          onSave={performImportSave}
          onBack={() => setImportScreen('summary')}
          isSaving={importing}
          title="Review Profile"
          replacement={importMode === 'replace'}
          saveLabel={importMode === 'replace' ? 'Replace Profile' : 'Import Selected'}
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
            <h3
              id="reset-data-title"
              className="text-base font-semibold text-gray-900 dark:text-gray-100"
            >
              Reset All Data
            </h3>
            <p
              id="reset-data-description"
              className="mt-2 text-pretty text-sm text-gray-500 dark:text-gray-400"
            >
              This will permanently delete your profile, mappings, and settings from this browser.
              {driveState.connected && ' Drive will also be disconnected.'}
            </p>

            {driveState.connected && (
              <label className="mt-4 flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={resetScope === 'everywhere'}
                  disabled={resetting}
                  aria-describedby={resetScope === 'everywhere' ? 'reset-drive-warning' : undefined}
                  onChange={(e) => setResetScope(e.target.checked ? 'everywhere' : 'device')}
                  className="mt-0.5 accent-red-600"
                />
                Also delete the Drive backup
              </label>
            )}
            {driveState.connected && resetScope === 'everywhere' && (
              <p id="reset-drive-warning" className="mt-2 text-xs text-red-600 dark:text-red-400">
                Your Drive backup will also be permanently deleted.
              </p>
            )}

            <div className="mt-5">
              <label
                htmlFor="reset-confirmation"
                className="block text-sm text-gray-700 dark:text-gray-300 mb-2"
              >
                Type{' '}
                <code className="font-mono font-semibold text-red-600 dark:text-red-400">
                  DELETE
                </code>{' '}
                to confirm
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
              <button type="button" onClick={handleResetDialogClose} className={btnSecondaryCls}>
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
        <SettingsDialog
          title="Disconnect Google Drive"
          busy={driveDisconnectBusy}
          onDismiss={closeDriveDisconnectDialog}
        >
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Disconnecting keeps your profile in this browser and your latest backup in Drive.
          </p>
          <label className="mt-4 flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={disconnectDeleteBackup}
              disabled={driveDisconnectBusy}
              onChange={(event) => setDisconnectDeleteBackup(event.target.checked)}
              className="mt-0.5 accent-red-600"
            />
            Also delete the Drive backup
          </label>
          {disconnectDeleteBackup && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">
              The Drive backup will be permanently deleted.
            </p>
          )}
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={closeDriveDisconnectDialog}
              disabled={driveDisconnectBusy}
              className={btnSecondaryCls}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleDriveDisconnect(disconnectDeleteBackup)}
              disabled={driveDisconnectBusy}
              className={
                disconnectDeleteBackup
                  ? 'px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50'
                  : btnPrimaryCls
              }
            >
              {driveDisconnectBusy
                ? 'Disconnecting…'
                : disconnectDeleteBackup
                  ? 'Delete & Disconnect'
                  : 'Disconnect'}
            </button>
          </div>
        </SettingsDialog>
      )}
      {driveRestoreCase === 'empty' && driveRestoreData && (
        <SettingsDialog
          title="Restore Drive Backup"
          busy={driveRestoreBusy}
          onDismiss={dismissRestoreDialog}
        >
          <p className="mt-2 text-pretty text-sm text-gray-500 dark:text-gray-400">
            Restore your profile and learned mappings from Drive.
          </p>
          <ImportWarnings warnings={driveImportWarnings} />
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={dismissRestoreDialog}
              disabled={driveRestoreBusy}
              className={btnSecondaryCls}
            >
              Not Now
            </button>
            <button
              type="button"
              onClick={handleRestoreFromDrive}
              disabled={driveRestoreBusy}
              className={btnPrimaryCls}
            >
              {driveRestoreBusy ? 'Restoring…' : 'Restore All'}
            </button>
          </div>
        </SettingsDialog>
      )}

      {/* ── Drive restore — conflict: summary → review ────────────────────────── */}
      {driveRestoreCase === 'conflict' && driveConflictScreen === 'summary' && (
        <ImportSummaryDialog
          changes={driveConflictChanges}
          title="Restore Drive Backup"
          description="Restore this backup or upload your saved profile."
          importControls={driveRestoreData && possibleDifferentPerson(driveLocalProfile ?? {}, driveRestoreData.profile) && <ImportModeChoice current={driveLocalProfile ?? {}} incoming={driveRestoreData.profile} mode={driveImportMode} onChange={chooseDriveImportMode} busy={driveRestoreBusy} />}
          replacement={driveImportMode === 'replace'}
          canProceed={driveImportMode !== null && (driveImportMode !== 'replace' || driveConflictChanges.some(c => c.hasIncomingValue === true))}
          acceptLabel={driveImportMode === 'replace' ? 'Replace Profile' : 'Restore All'}
          rejectLabel={driveImportMode === 'update' ? 'Keep Current' : 'Cancel'}
          forceDecision={driveImportWarnings.length > 0 || driveImportMode !== 'update'}
          warnings={driveImportWarnings}
          onDismiss={dismissRestoreDialog}
          onAcceptAll={() => void handleRestoreFromDrive()}
          onRejectAll={driveImportMode === 'update' ? () => void handleKeepLocal() : dismissRestoreDialog}
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
          replacement={driveImportMode === 'replace'}
          saveLabel={driveImportMode === 'replace' ? 'Replace Profile' : 'Restore Selected'}
        />
      )}
    </div>
  );
}
