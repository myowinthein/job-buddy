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

let remote: DriveBackupFile | null;
let remoteVersion = 1;
let driveEmail: string | undefined;
let silentAuthAllowed = false;
const authFlow = vi.fn();
const alarmCreate = vi.fn();
const alarmClear = vi.fn();
let deleteFails: boolean;
let lookupFailures: number;
let corruptDownload: boolean;
let patchMissing: boolean;
let calls: Array<{ method: string; url: string; payload?: DriveBackupFile }>;
let holdUploads: boolean;
let pendingUploads: Array<() => void>;
const response = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers({ etag: `"v${remoteVersion}"` }),
  json: async () => structuredClone(body),
  text: async () => JSON.stringify(body),
});
const backup = (): DriveBackupFile => ({
  profile: settingsReviewProfile(),
  learnedMappings: SETTINGS_REVIEW_MAPPINGS,
  lastModified: '2026-10-29T10:00:00Z',
});

beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  remoteVersion = 1;
  driveEmail = undefined;
  silentAuthAllowed = false;
  authFlow.mockClear();
  alarmCreate.mockClear();
  alarmClear.mockClear();
  remote = backup();
  deleteFails = false;
  lookupFailures = 0;
  corruptDownload = false;
  patchMissing = false;
  calls = [];
  pendingUploads = [];
  holdUploads = false;
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
        if (!details.interactive && !silentAuthAllowed) callback(undefined);
        else
          callback(
            `https://audit.invalid/#access_token=${details.interactive ? 'audit-token' : 'renewed-token'}&expires_in=3600`,
          );
      },
    },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, options: RequestInit = {}) => {
      const method = options.method ?? 'GET';
      const url = String(input);
      const call: (typeof calls)[number] = { method, url };
      calls.push(call);
      if (url.startsWith('https://oauth2.googleapis.com/revoke')) return response({});
      if (!url.startsWith('https://www.googleapis.com/'))
        throw new Error('Unexpected audit network destination');
      if (url.includes('/about?')) return response({ user: { emailAddress: driveEmail } });
      if (method === 'DELETE') {
        if (deleteFails) return response('offline', 503);
        remote = null;
        return response({});
      }
      if (method === 'PATCH' || method === 'POST') {
        if (patchMissing && method === 'PATCH') return response('not found', 404);
        const body = options.body as string;
        const payload =
          method === 'PATCH'
            ? JSON.parse(body)
            : JSON.parse(
                body.split('Content-Type: application/json\r\n\r\n')[1].split('\r\n--')[0],
              );
        call.payload = payload;
        const finish = () => {
          const match = new Headers(options.headers).get('If-Match');
          if (match && match !== `"v${remoteVersion}"`) return response('changed', 412);
          remote = structuredClone(payload);
          remoteVersion++;
          return response({ id: 'audit-file' });
        };
        if (holdUploads)
          return new Promise((resolve) => pendingUploads.push(() => resolve(finish())));
        return finish();
      }
      if (url.includes('alt=media')) return response(corruptDownload ? 'invalid backup' : remote);
      if (lookupFailures-- > 0) return response('temporary lookup error', 503);
      return response({
        files: remote ? [{ id: 'audit-file', name: 'job-buddy-profile.json' }] : [],
      });
    }),
  );
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
  calls.filter(
    ({ method, url }) =>
      url.includes('/upload/drive/') && (method === 'PATCH' || method === 'POST'),
  );

it('uploads the full profile and mappings, with document bytes and no device preferences', async () => {
  remote = null;
  await connected();
  await saveThemePreference('dark');
  expect((await syncProfileToDrive()).success).toBe(true);
  expect((remote as DriveBackupFile | null)?.profile).toEqual(settingsReviewProfile());
  expect((remote as DriveBackupFile | null)?.learnedMappings).toEqual(SETTINGS_REVIEW_MAPPINGS);
  expect(Object.keys(remote!).sort()).toEqual(['lastModified', 'learnedMappings', 'profile']);
});
it('identical connection needs no dialog and preserves the backup timestamp', async () => {
  await saveLearnedMappings(SETTINGS_REVIEW_MAPPINGS);
  mount();
  fireEvent.click(await screen.findByText('Connect Google Drive'));
  await screen.findByText('Drive backup is up to date.');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect((await getDriveBackupState()).lastSynced).toBe(remote!.lastModified);
  expect((await getDriveBackupState()).reviewRequired).toBe(false);
  expect(writes()).toHaveLength(0);
});
it('failed lookup never turns into an upload over an unseen backup', async () => {
  remote!.profile.personal.firstName = 'Cloud Only';
  lookupFailures = 1;
  mount();
  fireEvent.click(await screen.findByText('Connect Google Drive'));
  await screen.findAllByText(/The backup will retry automatically/);
  await syncIfConnected();
  expect(writes()).toHaveLength(0);
  expect(remote!.profile.personal.firstName).toBe('Cloud Only');
  expect((await getDriveBackupState()).reviewRequired).toBe(true);
  expect(alarmCreate).toHaveBeenCalled();
});
it('an unreadable backup is protected from both automatic and manual uploads', async () => {
  corruptDownload = true;
  const result = await connectDrive();
  expect(result.errorCode).toBe('invalid_backup');
  expect((await syncProfileToDrive()).success).toBe(false);
  await syncIfConnected();
  expect(writes()).toHaveLength(0);
  expect(alarmCreate).not.toHaveBeenCalled();
});
it('dismissed review remains paused and can be reopened without signing in again', async () => {
  remote!.profile.personal.firstName = 'Cloud Only';
  mount();
  fireEvent.click(await screen.findByText('Connect Google Drive'));
  await screen.findByRole('dialog', { name: 'Restore Drive Backup' });
  fireEvent.keyDown(window, { key: 'Escape' });
  await syncIfConnected();
  expect(writes()).toHaveLength(0);
  fireEvent.click(await screen.findByText('Review Backup'));
  expect(await screen.findByRole('dialog', { name: 'Restore Drive Backup' })).toBeTruthy();
});
it('a newer remote backup pauses uploads instead of overwriting another browser', async () => {
  await connected();
  await edit('Local Edit');
  remote!.profile.personal.firstName = 'New Cloud Edit';
  remoteVersion++;
  expect((await syncProfileToDrive()).errorCode).toBe('review_required');
  expect(remote!.profile.personal.firstName).toBe('New Cloud Edit');
  expect(writes()).toHaveLength(0);
});
it('conditional upload rejects a remote change made after the download', async () => {
  await connected();
  await edit('Local Edit');
  holdUploads = true;
  const task = syncProfileToDrive();
  await waitFor(() => expect(pendingUploads).toHaveLength(1));
  remote!.profile.personal.firstName = 'Changed During Upload';
  remoteVersion++;
  pendingUploads[0]();
  expect((await task).errorCode).toBe('review_required');
  expect(remote!.profile.personal.firstName).toBe('Changed During Upload');
});
it('queued uploads fetch the latest saved profile and finish in order', async () => {
  await connected();
  await edit('First');
  holdUploads = true;
  const first = syncProfileToDrive();
  await waitFor(() => expect(pendingUploads).toHaveLength(1));
  await edit('Latest');
  const second = syncProfileToDrive();
  expect(pendingUploads).toHaveLength(1);
  pendingUploads[0]();
  await first;
  await waitFor(() => expect(pendingUploads).toHaveLength(2));
  pendingUploads[1]();
  await second;
  expect(remote!.profile.personal.firstName).toBe('Latest');
});
it('simultaneous first uploads create only one backup', async () => {
  remote = null;
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
    holdUploads = true;
    let upload: Promise<void>;
    await act(async () => {
      upload = syncIfConnected();
      await waitFor(() => expect(pendingUploads).toHaveLength(1));
    });
    expect((await getFullDriveState()).uploadingUntil).toBeGreaterThan(Date.now());
    expect(screen.getByText('Backing up…', { selector: '[role="status"]' })).toBeTruthy();
    expect(screen.getAllByText('Backing up…')).toHaveLength(1);
    expect((screen.getByRole('button', { name: 'Back Up Now' }) as HTMLButtonElement).disabled).toBe(true);
    if (conflict) remoteVersion++;
    await act(async () => {
      pendingUploads[0]();
      await upload;
    });
    expect((await getFullDriveState()).uploadingUntil).toBeUndefined();
    expect(screen.getByText(conflict ? 'Backup paused' : 'Connected')).toBeTruthy();
    expect(remote!.profile.personal.firstName).toBe(conflict ? 'Alex' : 'Background Change');
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
  holdUploads = true;
  const upload = syncProfileToDrive();
  await waitFor(() => expect(pendingUploads).toHaveLength(1));
  let done = false;
  const disconnect = disconnectDrive(false).then(() => {
    done = true;
  });
  await Promise.resolve();
  expect(done).toBe(false);
  pendingUploads[0]();
  await upload;
  await disconnect;
  expect(await getDriveToken()).toBeNull();
  expect((await getDriveBackupState()).fileId).toBeNull();
  await syncIfConnected();
  expect(writes()).toHaveLength(1);
});
it('failed deletion preserves the backup and access for retry', async () => {
  await connected();
  deleteFails = true;
  await expect(disconnectDrive(true)).rejects.toThrow('could not be deleted');
  expect(remote).not.toBeNull();
  expect(await getDriveToken()).not.toBeNull();
  expect((await getDriveBackupState()).error).toBe('delete_failed');
  deleteFails = false;
  await disconnectDrive(true);
  expect(remote).toBeNull();
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
    expect(remote === null).toBe(deleteBackup);
  },
);
it('failed cloud deletion prevents reset from erasing local data or access', async () => {
  await connected();
  deleteFails = true;
  const done = mount();
  fireEvent.click(await screen.findByText('Reset Now'));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Also delete the Drive backup' }));
  fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: 'DELETE' } });
  fireEvent.click(screen.getByRole('button', { name: 'Reset All Data' }));
  await screen.findByText('Reset failed. Please try again.');
  expect(done).not.toHaveBeenCalled();
  expect(await getProfile()).toEqual(settingsReviewProfile());
  expect(remote).not.toBeNull();
  expect(await getDriveToken()).not.toBeNull();
});
it('a deleted remote file is recreated safely from the saved local profile', async () => {
  await connected();
  remote = null;
  await edit('Recover');
  expect((await syncProfileToDrive()).success).toBe(true);
  expect(remote!.profile.personal.firstName).toBe('Recover');
  expect(writes()[0].method).toBe('POST');
});
it('Drive review preserves unrelated local edits made after opening', async () => {
  remote!.profile.personal.firstName = 'Remote';
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
  remote!.profile.personal.firstName = 'Cloud Only';
  lookupFailures = 1;
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
  await waitFor(() => expect(remote!.profile.personal.firstName).toBe('Imported'));
});

it('shows the actual connected account without adding OAuth scopes', async () => {
  driveEmail = 'audit@example.test';
  await saveLearnedMappings(SETTINGS_REVIEW_MAPPINGS);
  mount();
  fireEvent.click(await screen.findByText('Connect Google Drive'));
  await screen.findByText('Drive backup is up to date.');
  expect(screen.getByText(driveEmail)).toBeTruthy();
  expect(new URL(authFlow.mock.calls[0][0].url).searchParams.get('scope')).toBe(
    'https://www.googleapis.com/auth/drive.appdata',
  );
});
it('silently renews a session only after verifying the same Google account', async () => {
  driveEmail = 'audit@example.test';
  silentAuthAllowed = true;
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
  driveEmail = 'audit@example.test';
  silentAuthAllowed = true;
  await connected();
  driveEmail = 'different@example.test';
  const state = await getDriveBackupState();
  await saveDriveBackupState({ ...state, tokenExpiresAt: Date.now() - 1 });
  await refreshDriveConnection();
  expect(await getDriveToken()).toBe('audit-token');
  expect((await getDriveBackupState()).error).toBe('token_expired');
  expect(writes()).toHaveLength(0);
});
it('requests reconnect when Google cannot renew silently', async () => {
  driveEmail = 'audit@example.test';
  await connected();
  const state = await getDriveBackupState();
  await saveDriveBackupState({ ...state, tokenExpiresAt: Date.now() - 1 });
  await refreshDriveConnection();
  expect((await getDriveBackupState()).error).toBe('token_expired');
  expect(authFlow.mock.calls.at(-1)![0].interactive).toBe(false);
});
it('does not apply an older restore after the cloud backup changes', async () => {
  const reviewed = await connectDrive();
  remote!.profile.personal.firstName = 'Newer Cloud';
  remoteVersion++;
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

it('allows an explicit decision when the only remote differences are invalid fields', async () => {
  remote!.profile.personal.email = 'invalid-email';
  await saveLearnedMappings(SETTINGS_REVIEW_MAPPINGS);
  mount();
  fireEvent.click(await screen.findByText('Connect Google Drive'));
  await screen.findByRole('dialog', { name: 'Restore Drive Backup' });
  expect(screen.getByText('1 item will be skipped')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Restore All' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Keep Current' }));
  await screen.findByText('Profile backed up to Google Drive.');
  expect(remote!.profile.personal.email).toBe(settingsReviewProfile().personal.email);
});

it('refuses a Keep Current upload after its local snapshot was replaced', async () => {
  const inspected = await connectDrive();
  const reviewed = settingsReviewProfile();
  await saveProfile({
    ...reviewed,
    id: 'another-person',
    personal: { ...reviewed.personal, firstName: 'Sam', email: 'sam@example.com' },
  });
  const before = structuredClone(remote);
  expect((await overwriteDriveWithLocal(reviewed, inspected.reviewId)).errorCode).toBe(
    'review_required',
  );
  expect(writes()).toHaveLength(0);
  expect(remote).toEqual(before);
  expect((await getDriveBackupState()).reviewRequired).toBe(true);
});
