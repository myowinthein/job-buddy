// @vitest-environment jsdom
// Every network request and storage operation is simulated; no Google account is accessed.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
vi.hoisted(() => vi.stubEnv('VITE_GOOGLE_DRIVE_CLIENT_ID', 'audit-client'));
vi.mock('@/src/resume-ai/gemini', () => import('@/src/preview/gemini'));
vi.mock('@/src/components/options/ResumeImportSection', () => ({
  ResumeImportSection: () => null,
}));
import App from '@/entrypoints/options/App';
import { SettingsSection } from '@/src/components/options/SettingsSection';
import { ToastProvider } from '@/src/components/ui/Toast';
import { createPreviewChrome } from '@/src/preview/chrome';
import {
  settingsReviewProfile,
  SETTINGS_REVIEW_MAPPINGS,
} from '@/src/testing/settingsReviewFixture';
import type { DriveBackupFile } from '@/src/types/storage';
import {
  getProfile,
  saveProfile,
  getDriveToken,
  saveDriveBackupState,
  getDriveBackupState,
  saveLearnedMappings,
  saveThemePreference,
} from './storage';
import {
  syncProfileToDrive,
  claimDriveWarning,
  disconnectDrive,
  syncIfConnected,
  getFullDriveState,
  connectDrive,
  finishDriveReview,
  inspectDriveBackup,
  retryPendingDriveSync,
  overwriteDriveWithLocal,
  refreshDriveConnection,
  completeDriveRestore,
  markDriveBackupPending,
} from './driveSync';
import { stubJsdomLayout } from '@/src/testing/jsdomLayout';
import { createFakeDrive } from '@/src/testing/fakeDrive';

const authFlow = vi.fn();
const alarmCreate = vi.fn();
const alarmClear = vi.fn();
const backup = (): DriveBackupFile => ({
  profile: settingsReviewProfile(),
  learnedMappings: SETTINGS_REVIEW_MAPPINGS,
  lastModified: '2026-10-29T10:00:00Z',
});
const drive = createFakeDrive(backup);

beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  drive.reset();
  authFlow.mockClear();
  alarmCreate.mockClear();
  alarmClear.mockClear();
  vi.stubEnv('DEV', false);
  sessionStorage.clear();
  sessionStorage.setItem('jb:ui:section', 'settings');
  const preview = createPreviewChrome(settingsReviewProfile());
  vi.stubGlobal('chrome', {
    ...preview,
    alarms: { create: alarmCreate, clear: alarmClear },
    identity: {
      getRedirectURL: () => 'https://audit.invalid/',
      launchWebAuthFlow: (
        details: { url: string; interactive: boolean },
        callback: (url?: string) => void,
      ) => {
        authFlow(details);
        if (!details.interactive && !drive.silentAuth) callback(undefined);
        else
          callback(
            `https://audit.invalid/#access_token=${details.interactive ? 'audit-token' : 'renewed-token'}&expires_in=3600`,
          );
      },
    },
  });
  vi.stubGlobal('fetch', vi.fn(drive.fetch));
  stubJsdomLayout();
});
afterEach(async () => {
  cleanup();
  await act(async () => {
    await Promise.resolve();
  });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function connected() {
  await saveLearnedMappings(SETTINGS_REVIEW_MAPPINGS);
  const result = await connectDrive();
  expect(result.errorCode).toBeUndefined();
  if (result.backup) await finishDriveReview(result.reviewId);
  return result;
}
async function edit(firstName: string) {
  const profile = settingsReviewProfile();
  profile.personal.firstName = firstName;
  await saveProfile(profile);
  return profile;
}
function mount(app = false) {
  const done = vi.fn();
  render(
    <ToastProvider>
      {app ? <App /> : <SettingsSection onImportComplete={done} onResetComplete={done} />}
    </ToastProvider>,
  );
  return done;
}
const writes = () =>
  drive.calls.filter(
    ({ method, url }) =>
      url.includes('/upload/drive/') && (method === 'PATCH' || method === 'POST'),
  );

it('limits secondary Drive warnings until a backup succeeds, including silent retries', async () => {
  await connected();
  const profile = (await getProfile())!;
  drive.lookupFailures = 1;
  expect((await syncProfileToDrive()).errorCode).toBe('sync_error');
  expect(await claimDriveWarning('sync_error', profile.id)).toBe(true);
  expect(await claimDriveWarning('sync_error', profile.id)).toBe(false);
  await retryPendingDriveSync();
  expect((await getDriveBackupState()).error).toBeNull();
  drive.lookupFailures = 1;
  await syncProfileToDrive();
  expect(await claimDriveWarning('sync_error', profile.id)).toBe(true);
});

it('rejects delayed warnings after disconnect, profile replacement, or a different Drive error', async () => {
  await connected();
  const profile = (await getProfile())!;
  const state = await getDriveBackupState();
  await saveDriveBackupState({ ...state, error: 'storage_full' });
  expect(await claimDriveWarning('sync_error', profile.id)).toBe(false);
  expect(await claimDriveWarning('storage_full', 'old-profile')).toBe(false);
  expect(await claimDriveWarning('storage_full', profile.id)).toBe(true);
  await disconnectDrive(false);
  expect(await claimDriveWarning('storage_full', profile.id)).toBe(false);
});

it('reports each direct backup failure and prevents a later secondary repeat', async () => {
  await connected();
  drive.lookupFailures = 2;
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Back Up Now' }));
  const warning = 'Your profile is saved. The backup will retry automatically.';
  await waitFor(() => expect(screen.getAllByText(warning).some(element => element.closest('[role="alert"]'))).toBe(true));
  fireEvent.click(await screen.findByRole('button', { name: 'Retry Backup' }));
  await waitFor(() => expect(screen.getAllByText(warning).filter(element => element.closest('[role="alert"]'))).toHaveLength(2));
  expect(await claimDriveWarning('sync_error', (await getProfile())!.id)).toBe(false);
});

it('keeps reporting profile save success while limiting Drive warnings across page remounts', async () => {
  await connected();
  sessionStorage.setItem('jb:ui:section', 'personal');
  drive.lookupFailures = 3;
  mount(true);
  const warning = 'Profile saved. Drive backup is pending.';
  for (let attempt = 1; attempt <= 2; attempt++) {
    fireEvent.click(await screen.findByRole('button', { name: 'Save Personal' }));
    await waitFor(() => expect(screen.getAllByText('Personal information saved')).toHaveLength(attempt));
    await waitFor(() => expect(screen.getAllByText(warning)).toHaveLength(1));
    // Wait for the actual failed backup and warning claim before remounting.
    await waitFor(() => expect(drive.lookupFailures).toBe(3 - attempt));
  }
  cleanup();
  mount(true);
  fireEvent.click(await screen.findByRole('button', { name: 'Save Personal' }));
  await screen.findByText('Personal information saved');
  await waitFor(() => expect(drive.lookupFailures).toBe(0));
  expect(screen.queryByText(warning)).toBeNull();
});

it('uploads the full profile and mappings, with document bytes and no device preferences', async () => {
  drive.remote = null;
  await connected();
  await saveThemePreference('dark');
  expect((await syncProfileToDrive()).success).toBe(true);
  expect((drive.remote as DriveBackupFile | null)?.profile).toEqual(settingsReviewProfile());
  expect((drive.remote as DriveBackupFile | null)?.learnedMappings).toEqual(SETTINGS_REVIEW_MAPPINGS);
  expect(Object.keys(drive.remote!).sort()).toEqual(['lastModified', 'learnedMappings', 'profile']);
});
it('identical connection needs no dialog and preserves the backup timestamp', async () => {
  await saveLearnedMappings(SETTINGS_REVIEW_MAPPINGS);
  mount();
  fireEvent.click(await screen.findByText('Connect Google Drive'));
  await screen.findByText('Drive backup is up to date.');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect((await getDriveBackupState()).lastSynced).toBe(drive.remote!.lastModified);
  expect((await getDriveBackupState()).reviewRequired).toBe(false);
  expect(writes()).toHaveLength(0);
});
it('failed lookup never turns into an upload over an unseen backup', async () => {
  drive.remote!.profile.personal.firstName = 'Cloud Only';
  drive.lookupFailures = 1;
  mount();
  fireEvent.click(await screen.findByText('Connect Google Drive'));
  await screen.findAllByText(/The backup will retry automatically/);
  await syncIfConnected();
  expect(writes()).toHaveLength(0);
  expect(drive.remote!.profile.personal.firstName).toBe('Cloud Only');
  expect((await getDriveBackupState()).reviewRequired).toBe(true);
  expect(alarmCreate).toHaveBeenCalled();
});
it('an unreadable backup is protected from both automatic and manual uploads', async () => {
  drive.corruptDownload = true;
  const result = await connectDrive();
  expect(result.errorCode).toBe('invalid_backup');
  expect((await syncProfileToDrive()).success).toBe(false);
  await syncIfConnected();
  expect(writes()).toHaveLength(0);
  expect(alarmCreate).not.toHaveBeenCalled();
});
it('dismissed review remains paused and can be reopened without signing in again', async () => {
  drive.remote!.profile.personal.firstName = 'Cloud Only';
  mount();
  fireEvent.click(await screen.findByText('Connect Google Drive'));
  await screen.findByRole('dialog', { name: 'Restore Drive Backup' });
  fireEvent.keyDown(window, { key: 'Escape' });
  await syncIfConnected();
  expect(writes()).toHaveLength(0);
  fireEvent.click(await screen.findByText('Review Backup'));
  expect(await screen.findByRole('dialog', { name: 'Restore Drive Backup' })).toBeTruthy();
});
it('a newer drive.remote backup pauses uploads instead of overwriting another browser', async () => {
  await connected();
  await edit('Local Edit');
  drive.remote!.profile.personal.firstName = 'New Cloud Edit';
  drive.version++;
  expect((await syncProfileToDrive()).errorCode).toBe('review_required');
  expect(drive.remote!.profile.personal.firstName).toBe('New Cloud Edit');
  expect(writes()).toHaveLength(0);
});
it('conditional upload rejects a drive.remote change made after the download', async () => {
  await connected();
  await edit('Local Edit');
  drive.holdUploads = true;
  const task = syncProfileToDrive();
  await waitFor(() => expect(drive.pendingUploads).toHaveLength(1));
  drive.remote!.profile.personal.firstName = 'Changed During Upload';
  drive.version++;
  drive.pendingUploads[0]();
  expect((await task).errorCode).toBe('review_required');
  expect(drive.remote!.profile.personal.firstName).toBe('Changed During Upload');
});
it('queued uploads fetch the latest saved profile and finish in order', async () => {
  await connected();
  await edit('First');
  drive.holdUploads = true;
  const first = syncProfileToDrive();
  await waitFor(() => expect(drive.pendingUploads).toHaveLength(1));
  await edit('Latest');
  const second = syncProfileToDrive();
  expect(drive.pendingUploads).toHaveLength(1);
  drive.pendingUploads[0]();
  await first;
  await waitFor(() => expect(drive.pendingUploads).toHaveLength(2));
  drive.pendingUploads[1]();
  await second;
  expect(drive.remote!.profile.personal.firstName).toBe('Latest');
});
it('simultaneous first uploads create only one backup', async () => {
  drive.remote = null;
  await connected();
  const results = await Promise.all([syncProfileToDrive(), syncProfileToDrive()]);
  expect(results.every((result) => result.success)).toBe(true);
  expect(writes().filter(({ method }) => method === 'POST')).toHaveLength(1);
});
it('a background echo of a successful save does not upload the same data twice', async () => {
  await connected();
  await edit('Changed');
  await syncProfileToDrive();
  await syncIfConnected();
  expect(writes()).toHaveLength(1);
});
it.each([false, true])(
  'shows real background upload activity and clears it after completion (conflict: %s)',
  async (conflict) => {
    await connected();
    await edit('Background Change');
    mount();
    await screen.findByText('Connected');
    drive.holdUploads = true;
    let upload: Promise<void>;
    await act(async () => {
      upload = syncIfConnected();
      await waitFor(() => expect(drive.pendingUploads).toHaveLength(1));
    });
    expect((await getFullDriveState()).uploadingUntil).toBeGreaterThan(Date.now());
    expect(screen.getByText('Backing up…', { selector: '[role="status"]' })).toBeTruthy();
    expect(screen.getAllByText('Backing up…')).toHaveLength(1);
    expect((screen.getByRole('button', { name: 'Back Up Now' }) as HTMLButtonElement).disabled).toBe(true);
    if (conflict) drive.version++;
    await act(async () => {
      drive.pendingUploads[0]();
      await upload;
    });
    expect((await getFullDriveState()).uploadingUntil).toBeUndefined();
    expect(screen.getByText(conflict ? 'Backup paused' : 'Connected')).toBeTruthy();
    expect(drive.remote!.profile.personal.firstName).toBe(conflict ? 'Alex' : 'Background Change');
  },
);
it('keeps queued backups pending without claiming an upload is running', async () => {
  await connected();
  await markDriveBackupPending();
  mount();
  await screen.findByText('Backup pending');
  expect(screen.queryByText('Backing up…')).toBeNull();
  expect((await getFullDriveState()).uploadingUntil).toBeUndefined();
  expect(writes()).toHaveLength(0);
});
it('expires abandoned upload activity instead of leaving a stuck spinner', async () => {
  await connected();
  await saveDriveBackupState({ ...(await getDriveBackupState()), uploadingUntil: Date.now() - 1 });
  expect((await getFullDriveState()).uploadingUntil).toBeUndefined();
  mount();
  await screen.findByText('Connected');
  expect(screen.queryByText('Backing up…')).toBeNull();
});
it('clears interrupted activity in an open Settings view even after authorization expires', async () => {
  await connected();
  await saveDriveBackupState({
    ...(await getDriveBackupState()),
    tokenExpiresAt: Date.now() - 1,
    uploadingUntil: Date.now() + 500,
  });
  mount();
  await screen.findByText('Backing up…', { selector: '[role="status"]' });
  await screen.findByText('Sign-in needed');
  expect(screen.getByText('Your Drive session expired.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Reconnect' })).toBeTruthy();
  expect(screen.queryByText('Reconnect Google Drive to continue backups.')).toBeNull();
  expect(screen.queryByText('Backing up…')).toBeNull();
});
it('disconnect waits for an in-flight upload and leaves no resurrected connection state', async () => {
  await connected();
  await edit('Changed');
  drive.holdUploads = true;
  const upload = syncProfileToDrive();
  await waitFor(() => expect(drive.pendingUploads).toHaveLength(1));
  let done = false;
  const disconnect = disconnectDrive(false).then(() => {
    done = true;
  });
  await Promise.resolve();
  expect(done).toBe(false);
  drive.pendingUploads[0]();
  await upload;
  await disconnect;
  expect(await getDriveToken()).toBeNull();
  expect((await getDriveBackupState()).fileId).toBeNull();
  await syncIfConnected();
  expect(writes()).toHaveLength(1);
});
it('failed deletion preserves the backup and access for retry', async () => {
  await connected();
  drive.deleteFails = true;
  await expect(disconnectDrive(true)).rejects.toThrow('could not be deleted');
  expect(drive.remote).not.toBeNull();
  expect(await getDriveToken()).not.toBeNull();
  expect((await getDriveBackupState()).error).toBe('delete_failed');
  drive.deleteFails = false;
  await disconnectDrive(true);
  expect(drive.remote).toBeNull();
  expect(await getProfile()).toEqual(settingsReviewProfile());
});
it.each([false, true])(
  'reset respects the cloud checkbox when deletion succeeds: %s',
  async (deleteBackup) => {
    await connected();
    const done = mount();
    fireEvent.click(await screen.findByText('Reset Now'));
    if (deleteBackup)
      fireEvent.click(screen.getByRole('checkbox', { name: 'Also delete the Drive backup' }));
    fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: 'DELETE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset All Data' }));
    await waitFor(() => expect(done).toHaveBeenCalled());
    expect(await getProfile()).toBeNull();
    expect(drive.remote === null).toBe(deleteBackup);
  },
);
it('failed cloud deletion prevents reset from erasing local data or access', async () => {
  await connected();
  drive.deleteFails = true;
  const done = mount();
  fireEvent.click(await screen.findByText('Reset Now'));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Also delete the Drive backup' }));
  fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: 'DELETE' } });
  fireEvent.click(screen.getByRole('button', { name: 'Reset All Data' }));
  await screen.findByText('Reset failed. Please try again.');
  expect(done).not.toHaveBeenCalled();
  expect(await getProfile()).toEqual(settingsReviewProfile());
  expect(drive.remote).not.toBeNull();
  expect(await getDriveToken()).not.toBeNull();
});
it('a deleted drive.remote file is recreated safely from the saved local profile', async () => {
  await connected();
  drive.remote = null;
  await edit('Recover');
  expect((await syncProfileToDrive()).success).toBe(true);
  expect(drive.remote!.profile.personal.firstName).toBe('Recover');
  expect(writes()[0].method).toBe('POST');
});
it('Drive review preserves unrelated local edits made after opening', async () => {
  drive.remote!.profile.personal.firstName = 'Remote';
  const done = mount();
  fireEvent.click(await screen.findByText('Connect Google Drive'));
  await screen.findByRole('dialog', { name: 'Restore Drive Backup' });
  const latest = settingsReviewProfile();
  latest.professional.summary = 'Saved Elsewhere';
  await saveProfile(latest);
  fireEvent.click(screen.getByText('Review Changes'));
  fireEvent.click(screen.getByRole('button', { name: /^Restore Selected/ }));
  await waitFor(() => expect(done).toHaveBeenCalled());
  expect((await getProfile())!.professional.summary).toBe('Saved Elsewhere');
});
it('background status changes update Settings without refreshing', async () => {
  await connected();
  mount();
  await screen.findByText('Back Up Now');
  await act(async () => {
    await saveDriveBackupState({
      fileId: 'audit-file',
      lastSynced: null,
      pendingSync: true,
      error: 'sync_error',
    });
  });
  expect(await screen.findByText(/The backup will retry automatically/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Disconnect' })).toBeTruthy();
});
it('an expired stored authorization is shown before a failed upload is needed', async () => {
  await connected();
  const state = await getDriveBackupState();
  await saveDriveBackupState({ ...state, tokenExpiresAt: Date.now() - 1 });
  expect((await getFullDriveState()).error).toBe('token_expired');
  expect((await syncProfileToDrive()).errorCode).toBe('token_expired');
  expect(writes()).toHaveLength(0);
});
it('retry after a failed lookup checks the backup instead of overwriting it', async () => {
  drive.remote!.profile.personal.firstName = 'Cloud Only';
  drive.lookupFailures = 1;
  await connectDrive();
  await retryPendingDriveSync();
  expect(writes()).toHaveLength(0);
  expect((await getDriveBackupState()).reviewRequired).toBe(true);
});
it('a decision from an older review cannot approve a newer inspection', async () => {
  const first = await connectDrive();
  const latest = await inspectDriveBackup();
  await expect(finishDriveReview(first.reviewId)).rejects.toThrow('checked again');
  expect((await overwriteDriveWithLocal(settingsReviewProfile(), first.reviewId)).errorCode).toBe(
    'review_required',
  );
  await finishDriveReview(latest.reviewId);
});
it('JSON import automatically backs up the accepted result', async () => {
  await connected();
  mount(true);
  await screen.findByText('Choose File');
  fireEvent.change(document.querySelector('input[type="file"]')!, {
    target: {
      files: [
        new File(
          [JSON.stringify({ profile: { personal: { firstName: 'Imported' } } })],
          'test.json',
          { type: 'application/json' },
        ),
      ],
    },
  });
  await screen.findByText('This may be another person’s profile');
  fireEvent.click(screen.getByRole('radio', { name: /Update current profile/ }));
  fireEvent.click(screen.getByText('Import All'));
  await screen.findByText('Profile imported successfully');
  await waitFor(() => expect(drive.remote!.profile.personal.firstName).toBe('Imported'));
});

it('shows the actual connected account without adding OAuth scopes', async () => {
  drive.email = 'audit@example.test';
  await saveLearnedMappings(SETTINGS_REVIEW_MAPPINGS);
  mount();
  fireEvent.click(await screen.findByText('Connect Google Drive'));
  await screen.findByText('Drive backup is up to date.');
  expect(screen.getByText(drive.email)).toBeTruthy();
  expect(new URL(authFlow.mock.calls[0][0].url).searchParams.get('scope')).toBe(
    'https://www.googleapis.com/auth/drive.appdata',
  );
});
it('silently renews a session only after verifying the same Google account', async () => {
  drive.email = 'audit@example.test';
  drive.silentAuth = true;
  await connected();
  const state = await getDriveBackupState();
  await saveDriveBackupState({ ...state, tokenExpiresAt: Date.now() + 30_000 });
  await refreshDriveConnection();
  expect(await getDriveToken()).toBe('renewed-token');
  expect((await getDriveBackupState()).tokenExpiresAt).toBeGreaterThan(Date.now() + 3_500_000);
  const details = authFlow.mock.calls.at(-1)![0];
  expect(details.interactive).toBe(false);
  expect(new URL(details.url).searchParams.get('login_hint')).toBe('audit@example.test');
  expect(writes()).toHaveLength(0);
});
it('rejects silent renewal for a different account and requests reconnect', async () => {
  drive.email = 'audit@example.test';
  drive.silentAuth = true;
  await connected();
  drive.email = 'different@example.test';
  const state = await getDriveBackupState();
  await saveDriveBackupState({ ...state, tokenExpiresAt: Date.now() - 1 });
  await refreshDriveConnection();
  expect(await getDriveToken()).toBe('audit-token');
  expect((await getDriveBackupState()).error).toBe('token_expired');
  expect(writes()).toHaveLength(0);
});
it('requests reconnect when Google cannot renew silently', async () => {
  drive.email = 'audit@example.test';
  await connected();
  const state = await getDriveBackupState();
  await saveDriveBackupState({ ...state, tokenExpiresAt: Date.now() - 1 });
  await refreshDriveConnection();
  expect((await getDriveBackupState()).error).toBe('token_expired');
  expect(authFlow.mock.calls.at(-1)![0].interactive).toBe(false);
});
it('does not apply an older restore after the cloud backup changes', async () => {
  const reviewed = await connectDrive();
  drive.remote!.profile.personal.firstName = 'Newer Cloud';
  drive.version++;
  const save = vi.fn(async () => {
    await edit('Old Restore');
  });
  await expect(completeDriveRestore(reviewed.reviewId, save)).rejects.toThrow('changed');
  expect(save).not.toHaveBeenCalled();
  expect((await getProfile())!.personal.firstName).toBe('Alex');
});
it('keeps disconnect focus inside the modal and restores the opener', async () => {
  await connected();
  mount();
  const opener = await screen.findByRole('button', { name: 'Disconnect' });
  opener.focus();
  fireEvent.click(opener);
  const dialog = screen.getByRole('dialog', { name: 'Disconnect Google Drive' });
  expect(document.activeElement).toBe(dialog);
  fireEvent.keyDown(dialog, { key: 'Tab' });
  expect(document.activeElement).toBe(
    screen.getByRole('checkbox', { name: 'Also delete the Drive backup' }),
  );
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(document.activeElement).toBe(opener);
});

it('allows an explicit decision when the only drive.remote differences are invalid fields', async () => {
  drive.remote!.profile.personal.email = 'invalid-email';
  await saveLearnedMappings(SETTINGS_REVIEW_MAPPINGS);
  mount();
  fireEvent.click(await screen.findByText('Connect Google Drive'));
  await screen.findByRole('dialog', { name: 'Restore Drive Backup' });
  expect(screen.getByText('1 item will be skipped')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Restore All' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Keep Current' }));
  await screen.findByText('Profile backed up to Google Drive.');
  expect(drive.remote!.profile.personal.email).toBe(settingsReviewProfile().personal.email);
});

it('refuses a Keep Current upload after its local snapshot was replaced', async () => {
  const inspected = await connectDrive();
  const reviewed = settingsReviewProfile();
  await saveProfile({
    ...reviewed,
    id: 'another-person',
    personal: { ...reviewed.personal, firstName: 'Sam', email: 'sam@example.com' },
  });
  const before = structuredClone(drive.remote);
  expect((await overwriteDriveWithLocal(reviewed, inspected.reviewId)).errorCode).toBe(
    'review_required',
  );
  expect(writes()).toHaveLength(0);
  expect(drive.remote).toEqual(before);
  expect((await getDriveBackupState()).reviewRequired).toBe(true);
});
