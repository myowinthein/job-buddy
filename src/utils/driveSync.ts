import { devContext, devLockName } from '@/src/devtools/context';
import { profileData } from './profileData';
import type { Profile } from '../types/profile';
import type { DriveBackupFile, DriveBackupState, DriveError } from '../types/storage';
import {
  getProfile,
  getDriveToken,
  saveDriveToken,
  clearDriveToken,
  getDriveBackupState,
  saveDriveBackupState,
  clearDriveBackupState,
  getLearnedMappings,
} from './storage';
import { equalJsonValues } from './equalJsonValues';

// ── OAuth ────────────────────────────────────────────────────────────────────

const CLIENT_ID = (import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID as string | undefined) ?? '';
const configuredClientId = () => import.meta.env.DEV && devContext() ? 'simulation-client' : CLIENT_ID;
const PLACEHOLDER = 'your_google_drive_oauth_client_id_here';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

/** Returns true when the build has a real OAuth client ID configured. */
export function isDriveConfigured(): boolean {
  return !!configuredClientId() && configuredClientId() !== PLACEHOLDER;
}
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

const BACKUP_FILENAME = 'job-buddy-profile.json';

async function authorizeDrive(
  interactive = true,
  accountEmail?: string,
  storedClientId?: string,
): Promise<{ token: string; expiresAt: number }> {
  const clientId = storedClientId ?? configuredClientId();
  if (!clientId || clientId === PLACEHOLDER) {
    console.warn(
      '[Job Buddy] VITE_GOOGLE_DRIVE_CLIENT_ID is missing or still set to the placeholder. Set it in .env.development or .env.production.',
    );
    throw new Error('not_configured');
  }
  const redirectUri = chrome.identity.getRedirectURL();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope: SCOPE,
    prompt: interactive ? 'select_account' : 'none',
    ...(accountEmail ? { login_hint: accountEmail } : {}),
  });
  const url = `${AUTH_URL}?${params.toString()}`;

  return new Promise((resolve, reject) => {
    try {
      chrome.identity.launchWebAuthFlow(
        {
          url,
          interactive,
          ...(!interactive
            ? { abortOnLoadForNonInteractive: false, timeoutMsForNonInteractive: 10_000 }
            : {}),
        },
        (responseUrl) => {
          if (chrome.runtime.lastError || !responseUrl) {
            reject(new Error(chrome.runtime.lastError?.message ?? 'OAuth flow failed'));
            return;
          }
          const hash = responseUrl.split('#')[1];
          if (!hash) {
            reject(new Error('No fragment in OAuth response'));
            return;
          }
          const parsed = new URLSearchParams(hash);
          const token = parsed.get('access_token');
          if (!token) {
            reject(new Error('No access_token in OAuth response'));
            return;
          }
          const seconds = Number(parsed.get('expires_in'));
          resolve({
            token,
            expiresAt:
              Date.now() + (seconds > 0 && Number.isFinite(seconds) ? seconds : 3600) * 1000,
          });
        },
      );
    } catch (err) {
      reject(err);
    }
  });
}

export async function launchDriveOAuth(): Promise<string> {
  return (await authorizeDrive()).token;
}

export async function revokeDriveToken(token: string): Promise<void> {
  try {
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // Best-effort revoke — silent failure is fine, the token will lapse on its own.
  }
}

// ── Drive API helpers ────────────────────────────────────────────────────────

interface DriveFileEntry {
  id: string;
  name: string;
}

async function authedFetch(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, { ...init, headers, signal: AbortSignal.timeout(20_000) });
}

function classifyError(status: number, body: string): DriveError {
  if (status === 412) return 'review_required';
  if (status === 401) return 'token_expired';
  if (status === 403 && /storagequotaexceeded/i.test(body)) return 'storage_full';
  return 'sync_error';
}

async function findBackupFileIds(token: string): Promise<string[]> {
  const files: string[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      spaces: 'appDataFolder',
      fields: 'files(id,name),nextPageToken',
      q: `name = '${BACKUP_FILENAME}'`,
      orderBy: 'modifiedTime desc',
      pageSize: '100',
      ...(pageToken ? { pageToken } : {}),
    });
    const resp = await authedFetch(token, `${DRIVE_API}/files?${params.toString()}`);
    if (!resp.ok) throw new DriveApiError(resp.status, await resp.text().catch(() => ''));
    const data = (await resp.json()) as { files?: DriveFileEntry[]; nextPageToken?: string };
    files.push(...(data.files ?? []).map((file) => file.id));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return files;
}
async function findBackupFileId(token: string): Promise<string | null> {
  return (await findBackupFileIds(token))[0] ?? null;
}

interface DownloadedBackup {
  backup: DriveBackupFile;
  etag: string | null;
}
class InvalidBackupError extends Error {}

async function downloadBackupFromDrive(token: string, fileId: string): Promise<DownloadedBackup> {
  const resp = await authedFetch(token, `${DRIVE_API}/files/${fileId}?alt=media`);
  if (!resp.ok) throw new DriveApiError(resp.status, await resp.text().catch(() => ''));
  let data: unknown;
  try {
    data = await resp.json();
  } catch {
    throw new InvalidBackupError('Unreadable Drive backup');
  }
  if (
    !data ||
    typeof data !== 'object' ||
    !('profile' in data) ||
    !data.profile ||
    typeof data.profile !== 'object' ||
    Array.isArray(data.profile)
  )
    throw new InvalidBackupError('Invalid Drive backup');
  return { backup: data as DriveBackupFile, etag: resp.headers?.get('etag') ?? null };
}

class DriveApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`Drive API ${status}`);
    this.status = status;
    this.body = body;
  }
}

async function uploadToDrive(
  token: string,
  payload: DriveBackupFile,
  existingFileId: string | null,
  etag?: string | null,
): Promise<string> {
  const json = JSON.stringify(payload);

  if (existingFileId) {
    // Update: simple media PATCH replaces file content.
    const resp = await authedFetch(
      token,
      `${DRIVE_UPLOAD}/files/${existingFileId}?uploadType=media`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(etag ? { 'If-Match': etag } : {}) },
        body: json,
      },
    );
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new DriveApiError(resp.status, body);
    }
    return existingFileId;
  }

  // Create: multipart upload with metadata + content.
  const boundary = `jb-${crypto.randomUUID()}`;
  const metadata = {
    name: BACKUP_FILENAME,
    parents: ['appDataFolder'],
  };
  const body =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    'Content-Type: application/json\r\n\r\n' +
    `${json}\r\n` +
    `--${boundary}--`;

  const resp = await authedFetch(token, `${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!resp.ok) {
    const errBody = await resp.text().catch(() => '');
    throw new DriveApiError(resp.status, errBody);
  }
  const data = (await resp.json()) as { id?: string };
  if (!data.id) throw new DriveApiError(resp.status, 'Drive upload response missing id');
  return data.id;
}

async function deleteFromDrive(token: string, fileId: string): Promise<void> {
  const resp = await authedFetch(token, `${DRIVE_API}/files/${fileId}`, { method: 'DELETE' });
  if (!resp.ok && resp.status !== 404) {
    const body = await resp.text().catch(() => '');
    throw new DriveApiError(resp.status, body);
  }
}

// Web Locks coordinate Options tabs and the extension worker. The local queue
// also covers test runtimes without the browser lock manager.
let queue: Promise<unknown> = Promise.resolve();
function withDriveLock<T>(operation: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> =>
    typeof navigator !== 'undefined' && navigator.locks
      ? await navigator.locks.request(import.meta.env.DEV ? devLockName('job-buddy:drive-backup') : 'job-buddy:drive-backup', operation)
      : await operation();
  const result = queue.then(run, run);
  queue = result.catch(() => {});
  return result;
}

export const DRIVE_RETRY_ALARM = 'jb:drive-backup-retry';
export const DRIVE_AUTH_ALARM = 'jb:drive-authorization-renewal';
const UPLOAD_ACTIVITY_MS = 30_000;
async function updateState(state: DriveBackupState): Promise<void> {
  await saveDriveBackupState(state);
  if (chrome.alarms) {
    if (state.retryAt) await chrome.alarms.create(DRIVE_RETRY_ALARM, { when: state.retryAt });
    else await chrome.alarms.clear(DRIVE_RETRY_ALARM);
    if (state.accountEmail && state.tokenExpiresAt && state.error !== 'token_expired')
      await chrome.alarms.create(DRIVE_AUTH_ALARM, {
        when: Math.max(Date.now() + 1_000, state.tokenExpiresAt - 60_000),
      });
    else await chrome.alarms.clear(DRIVE_AUTH_ALARM);
  }
  dispatchDriveStateChanged();
}
function errorCode(error: unknown): Exclude<DriveError, null> {
  if (error instanceof InvalidBackupError) return 'invalid_backup';
  return error instanceof DriveApiError ? classifyError(error.status, error.body)! : 'sync_error';
}
async function recordFailure(state: DriveBackupState, error: unknown): Promise<SyncResult> {
  const code = errorCode(error);
  const count = (state.retryCount ?? 0) + 1;
  try {
    await updateState({
      ...state,
      pendingSync: true,
      uploadingUntil: undefined,
      error: code,
      reviewRequired:
        state.reviewRequired || code === 'review_required' || code === 'invalid_backup',
      retryCount: count,
      retryAt:
        code === 'sync_error'
          ? Date.now() + Math.min(60_000 * 2 ** Math.min(count - 1, 5), 1_800_000)
          : undefined,
    });
  } catch {
    /* Local backup status can fail too; keep local saves independent. */
  }
  return { success: false, errorCode: code };
}
function expired(state: DriveBackupState): boolean {
  return state.tokenExpiresAt !== undefined && Date.now() >= state.tokenExpiresAt;
}
function timestamp(backup: DriveBackupFile): string | null {
  return typeof backup.lastModified === 'string' && Number.isFinite(Date.parse(backup.lastModified))
    ? backup.lastModified
    : null;
}
function contents(backup: Pick<DriveBackupFile, 'profile' | 'learnedMappings'>) {
  return { profile: backup.profile, learnedMappings: backup.learnedMappings ?? {} };
}
async function fingerprint(
  backup: Pick<DriveBackupFile, 'profile' | 'learnedMappings'>,
): Promise<string> {
  const stable = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(stable)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.entries(value)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, entry]) => [key, stable(entry)]),
          )
        : value;
  const bytes = new TextEncoder().encode(JSON.stringify(stable(contents(backup))));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Uses the existing Drive scope; no extra sign-in permission is requested. */
async function driveAccountEmail(token: string): Promise<string | undefined> {
  const response = await authedFetch(token, `${DRIVE_API}/about?fields=user(emailAddress)`);
  if (!response.ok) return undefined;
  const data = (await response.json()) as { user?: { emailAddress?: unknown } };
  return typeof data.user?.emailAddress === 'string' ? data.user.emailAddress : undefined;
}
async function renewUnlocked(token: string, state: DriveBackupState) {
  if (!state.accountEmail || !state.oauthClientId)
    throw new DriveApiError(401, 'Reconnect required');
  try {
    const authorization = await authorizeDrive(false, state.accountEmail, state.oauthClientId);
    // login_hint is only a hint. Verify the actual account before accepting a new token.
    if ((await driveAccountEmail(authorization.token)) !== state.accountEmail)
      throw new Error('Different account');
    const next = {
      ...state,
      tokenExpiresAt: authorization.expiresAt,
      error:
        state.error === 'token_expired'
          ? state.reviewRequired
            ? 'review_required'
            : null
          : state.error,
    };
    await saveDriveToken(authorization.token);
    await updateState(next);
    return { token: authorization.token, state: next };
  } catch {
    throw new DriveApiError(401, 'Reconnect required');
  }
}
export async function refreshDriveConnection(): Promise<void> {
  try {
    await withDriveLock(async () => {
      const token = await getDriveToken();
      if (!token) return;
      const state = await getDriveBackupState();
      if (!state.tokenExpiresAt || state.tokenExpiresAt - Date.now() > 60_000) {
        await updateState(state);
        return;
      }
      try {
        await renewUnlocked(token, state);
      } catch (error) {
        await recordFailure(state, error);
      }
    });
  } catch {
    /* Session maintenance must not interrupt the background worker. */
  }
}

export interface FullDriveState {
  connected: boolean;
  lastSynced: string | null;
  pendingSync: boolean;
  error: DriveError;
  reviewRequired?: boolean;
  tokenExpiresAt?: number;
  accountEmail?: string;
  uploadingUntil?: number;
}
export async function getFullDriveState(): Promise<FullDriveState> {
  const [token, state] = await Promise.all([getDriveToken(), getDriveBackupState()]);
  return {
    connected: !!token,
    lastSynced: state.lastSynced,
    pendingSync: state.pendingSync,
    error: token && expired(state) ? 'token_expired' : state.error,
    ...(state.reviewRequired ? { reviewRequired: true } : {}),
    ...(state.accountEmail ? { accountEmail: state.accountEmail } : {}),
    ...(state.tokenExpiresAt !== undefined ? { tokenExpiresAt: state.tokenExpiresAt } : {}),
    ...(token && state.uploadingUntil && state.uploadingUntil > Date.now()
      ? { uploadingUntil: state.uploadingUntil }
      : {}),
  };
}
export function dispatchDriveStateChanged(): void {
  try {
    window.dispatchEvent(new CustomEvent('jb:drive:state-changed'));
  } catch {
    /* The worker notifies open views through chrome.storage.onChanged. */
  }
}
export interface ConnectResult {
  token: string;
  backup: DriveBackupFile | null;
  fileId: string | null;
  errorCode?: DriveError;
  reviewId?: string;
}

async function inspectUnlocked(token: string, state: DriveBackupState): Promise<ConnectResult> {
  // Persist the pause before lookup: errors and migration writes cannot upload
  // over an unseen backup, including from another extension context.
  const reviewId = crypto.randomUUID();
  let paused = {
    ...state,
    reviewRequired: true,
    reviewId,
    pendingSync: false,
    retryAt: undefined,
    uploadingUntil: undefined,
  };
  await updateState(paused);
  try {
    const fileId = await findBackupFileId(token);
    paused = { ...paused, fileId };
    const downloaded = fileId ? await downloadBackupFromDrive(token, fileId) : null;
    const backup = downloaded?.backup ?? null;
    if (!paused.accountEmail) {
      try {
        paused = { ...paused, accountEmail: await driveAccountEmail(token) };
      } catch {
        /* Optional account label must not block a backup. */
      }
    }
    await updateState({
      ...paused,
      fileId,
      reviewRequired: !!backup,
      remoteHash: backup ? await fingerprint(backup) : undefined,
      lastSynced: backup ? timestamp(backup) : null,
      error: backup ? 'review_required' : null,
      retryCount: 0,
    });
    return { token, fileId, backup, reviewId };
  } catch (error) {
    const result = await recordFailure(paused, error);
    return { token, fileId: paused.fileId, backup: null, errorCode: result.errorCode };
  }
}
export async function connectDrive(): Promise<ConnectResult> {
  const authorization = await authorizeDrive();
  return withDriveLock(async () => {
    await saveDriveToken(authorization.token);
    return inspectUnlocked(authorization.token, {
      fileId: null,
      lastSynced: null,
      pendingSync: false,
      error: null,
      tokenExpiresAt: authorization.expiresAt,
      oauthClientId: configuredClientId(),
    });
  });
}
/** Re-read a paused backup without repeating Google sign-in. */
export async function inspectDriveBackup(): Promise<ConnectResult> {
  return withDriveLock(async () => {
    const token = await getDriveToken();
    if (!token) throw new Error('Google Drive is not connected');
    const state = await getDriveBackupState();
    if (expired(state))
      return { token, fileId: state.fileId, backup: null, errorCode: 'token_expired' };
    return inspectUnlocked(token, state);
  });
}
/** Resume only after an identical backup or accepted restore has been handled. */
export async function finishDriveReview(reviewId?: string): Promise<void> {
  await withDriveLock(async () => {
    if (!(await getDriveToken())) return;
    const state = await getDriveBackupState();
    if (state.reviewId && state.reviewId !== reviewId)
      throw new Error('Drive backup must be checked again');
    if (state.error && state.error !== 'review_required')
      throw new Error('Drive backup must be checked again');
    await updateState({ ...state, reviewRequired: false, error: null, retryAt: undefined });
  });
}
export async function completeDriveRestore(
  reviewId: string | undefined,
  save: () => Promise<void>,
): Promise<void> {
  await withDriveLock(async () => {
    const token = await getDriveToken();
    const state = await getDriveBackupState();
    if (!token || expired(state) || (state.reviewId && state.reviewId !== reviewId))
      throw new Error('Check the Drive backup again');
    const fileId = await findBackupFileId(token);
    if (!fileId) throw new Error('The Drive backup no longer exists');
    const current = await downloadBackupFromDrive(token, fileId);
    if ((await fingerprint(current.backup)) !== state.remoteHash) {
      await updateState({ ...state, reviewRequired: true, error: 'review_required' });
      throw new Error('The Drive backup changed. Review it again');
    }
    await save();
    await updateState({ ...state, reviewRequired: false, error: null, retryAt: undefined });
  });
}

export interface SyncResult {
  success: boolean;
  errorCode: DriveError;
}

async function uploadUnlocked(
  fallback: Profile | undefined,
  allowReview = false,
  reviewId?: string,
): Promise<SyncResult> {
  let token = await getDriveToken();
  if (!token) return { success: false, errorCode: null };
  let state = await getDriveBackupState();
  if (expired(state)) {
    try {
      ({ token, state } = await renewUnlocked(token, state));
    } catch (error) {
      return recordFailure(state, error);
    }
  }
  if (state.reviewRequired && !allowReview)
    return { success: false, errorCode: state.error ?? 'review_required' };
  if (allowReview && state.reviewId && state.reviewId !== reviewId)
    return { success: false, errorCode: 'review_required' };
  try {
    // Re-read inside the lock, so queued uploads never use a stale caller snapshot.
    const profile = (await getProfile()) ?? fallback;
    if (!profile) return { success: false, errorCode: null };
    const learnedMappings = await getLearnedMappings();
    const payload: DriveBackupFile = {
      profile: profileData(profile),
      learnedMappings,
      lastModified: new Date().toISOString(),
    };
    // Find the canonical newest file every time; this also recovers a deleted ID.
    let fileId = await findBackupFileId(token);
    let downloaded: DownloadedBackup | null = null;
    if (fileId) {
      try {
        downloaded = await downloadBackupFromDrive(token, fileId);
      } catch (error) {
        if (error instanceof DriveApiError && error.status === 404) fileId = null;
        else throw error;
      }
    }
    if (downloaded) {
      const hash = await fingerprint(downloaded.backup);
      if (equalJsonValues(contents(downloaded.backup), contents(payload))) {
        await updateState({
          ...state,
          fileId,
          remoteHash: hash,
          lastSynced: timestamp(downloaded.backup),
          reviewRequired: false,
          pendingSync: false,
          uploadingUntil: undefined,
          error: null,
          retryAt: undefined,
          retryCount: 0,
        });
        return { success: true, errorCode: null };
      }
      if (state.remoteHash !== hash) {
        await updateState({
          ...state,
          fileId,
          reviewRequired: true,
          pendingSync: true,
          uploadingUntil: undefined,
          error: 'review_required',
          retryAt: undefined,
        });
        return { success: false, errorCode: 'review_required' };
      }
    }
    state = { ...state, fileId, uploadingUntil: Date.now() + UPLOAD_ACTIVITY_MS, error: null };
    await updateState(state);
    const newFileId = await uploadToDrive(token, payload, fileId, downloaded?.etag);
    await updateState({
      ...state,
      fileId: newFileId,
      uploadingUntil: undefined,
      remoteHash: await fingerprint(payload),
      lastSynced: payload.lastModified,
      pendingSync: false,
      reviewRequired: false,
      error: null,
      retryAt: undefined,
      retryCount: 0,
    });
    return { success: true, errorCode: null };
  } catch (error) {
    return recordFailure(state, error);
  }
}
/** Uploads settle with a result; network/storage failure never blocks a local save. */
export async function syncProfileToDrive(profile?: Profile): Promise<SyncResult> {
  try {
    return await withDriveLock(() => uploadUnlocked(profile));
  } catch {
    return { success: false, errorCode: 'sync_error' };
  }
}
/** Explicitly chosen local data may replace only the version the user reviewed. */
export async function overwriteDriveWithLocal(
  profile: Profile,
  reviewId?: string,
): Promise<SyncResult> {
  try {
    return await withDriveLock(() => uploadUnlocked(profile, true, reviewId));
  } catch {
    return { success: false, errorCode: 'sync_error' };
  }
}
export async function retryPendingDriveSync(): Promise<void> {
  try {
    await withDriveLock(async () => {
      const token = await getDriveToken();
      if (!token) return;
      let state = await getDriveBackupState();
      if (!state.pendingSync || expired(state) || (state.error && state.error !== 'sync_error'))
        return;
      if (state.reviewRequired) {
        const checked = await inspectUnlocked(token, state);
        if (checked.errorCode) return;
        state = await getDriveBackupState();
        if (checked.backup) {
          const profile = await getProfile();
          const learnedMappings = await getLearnedMappings();
          if (!profile || !equalJsonValues(contents(checked.backup), { profile, learnedMappings }))
            return;
          await updateState({ ...state, reviewRequired: false, error: null });
        }
      }
      await uploadUnlocked(undefined);
    });
  } catch {
    /* Retry failures remain in durable backup state. */
  }
}
export async function syncIfConnected(): Promise<void> {
  await syncProfileToDrive();
}

/** Make the saved-but-not-yet-backed-up state visible during the debounce. */
export async function markDriveBackupPending(): Promise<void> {
  try {
    await withDriveLock(async () => {
      if (!(await getDriveToken())) return;
      const state = await getDriveBackupState();
      await updateState({ ...state, pendingSync: true });
    });
  } catch {
    /* A backup status failure must not affect the local edit. */
  }
}

/** Wait for uploads before deletion/revocation; failed deletion preserves access for retry. */
export async function disconnectDrive(deleteFile: boolean): Promise<void> {
  await withDriveLock(async () => {
    const [token, state] = await Promise.all([getDriveToken(), getDriveBackupState()]);
    if (deleteFile && token) {
      try {
        const ids = new Set([
          ...(await findBackupFileIds(token)),
          ...(state.fileId ? [state.fileId] : []),
        ]);
        for (const fileId of ids) await deleteFromDrive(token, fileId);
      } catch (error) {
        const code = errorCode(error);
        await updateState({
          ...state,
          error: code === 'sync_error' ? 'delete_failed' : code,
          reviewRequired: true,
          pendingSync: false,
          retryAt: undefined,
        });
        throw new Error('The Drive backup could not be deleted. Reconnect or try again.');
      }
    }
    // Clearing the token first also stops jobs queued after this operation.
    await clearDriveToken();
    await clearDriveBackupState();
    if (chrome.alarms) {
      await chrome.alarms.clear(DRIVE_RETRY_ALARM);
      await chrome.alarms.clear(DRIVE_AUTH_ALARM);
    }
    if (token) await revokeDriveToken(token);
    dispatchDriveStateChanged();
  });
}
