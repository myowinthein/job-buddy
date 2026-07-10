import type { Profile } from '../types/profile';
import type { DriveBackupFile, DriveError } from '../types/storage';
import {
  getDriveToken,
  saveDriveToken,
  clearDriveToken,
  getDriveBackupState,
  saveDriveBackupState,
  clearDriveBackupState,
  getLearnedMappings,
} from './storage';

// ── OAuth ────────────────────────────────────────────────────────────────────

const CLIENT_ID   = (import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID as string | undefined) ?? '';
const PLACEHOLDER = 'your_google_drive_oauth_client_id_here';
const SCOPE       = 'https://www.googleapis.com/auth/drive.appdata';

/** Returns true when the build has a real OAuth client ID configured. */
export function isDriveConfigured(): boolean {
  return !!CLIENT_ID && CLIENT_ID !== PLACEHOLDER;
}
const AUTH_URL  = 'https://accounts.google.com/o/oauth2/v2/auth';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

const BACKUP_FILENAME = 'job-buddy-profile.json';

export async function launchDriveOAuth(): Promise<string> {
  if (!isDriveConfigured()) {
    console.warn('[Job Buddy] VITE_GOOGLE_DRIVE_CLIENT_ID is missing or still set to the placeholder. Set it in .env.development or .env.production.');
    throw new Error('not_configured');
  }
  const redirectUri = chrome.identity.getRedirectURL();
  const params = new URLSearchParams({
    client_id:     CLIENT_ID,
    redirect_uri:  redirectUri,
    response_type: 'token',
    scope:         SCOPE,
    prompt:        'select_account',
  });
  const url = `${AUTH_URL}?${params.toString()}`;

  return new Promise((resolve, reject) => {
    try {
      chrome.identity.launchWebAuthFlow(
        { url, interactive: true },
        (responseUrl) => {
          if (chrome.runtime.lastError || !responseUrl) {
            reject(new Error(chrome.runtime.lastError?.message ?? 'OAuth flow failed'));
            return;
          }
          const hash = responseUrl.split('#')[1];
          if (!hash) { reject(new Error('No fragment in OAuth response')); return; }
          const parsed = new URLSearchParams(hash);
          const token = parsed.get('access_token');
          if (!token) { reject(new Error('No access_token in OAuth response')); return; }
          resolve(token);
        },
      );
    } catch (err) {
      reject(err);
    }
  });
}

export async function revokeDriveToken(token: string): Promise<void> {
  try {
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: 'POST' });
  } catch {
    // Best-effort revoke — silent failure is fine, the token will lapse on its own.
  }
}

// ── Drive API helpers ────────────────────────────────────────────────────────

interface DriveFileEntry { id: string; name: string; }

async function authedFetch(
  token: string,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, { ...init, headers });
}

function classifyError(status: number, body: string): DriveError {
  if (status === 401) return 'token_expired';
  if (status === 403 && /storagequotaexceeded|quotaexceeded/i.test(body)) return 'storage_full';
  return 'sync_error';
}

async function findBackupFileId(token: string): Promise<string | null> {
  const params = new URLSearchParams({
    spaces: 'appDataFolder',
    fields: 'files(id,name)',
    q:      `name = '${BACKUP_FILENAME}'`,
  });
  const resp = await authedFetch(token, `${DRIVE_API}/files?${params.toString()}`);
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new DriveApiError(resp.status, body);
  }
  const data = await resp.json() as { files?: DriveFileEntry[] };
  const file = data.files?.[0];
  return file?.id ?? null;
}

async function downloadBackupFromDrive(token: string, fileId: string): Promise<DriveBackupFile | null> {
  const resp = await authedFetch(token, `${DRIVE_API}/files/${fileId}?alt=media`);
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new DriveApiError(resp.status, body);
  }
  try {
    const data = await resp.json() as DriveBackupFile;
    if (!data || typeof data !== 'object' || !data.profile) return null;
    return data;
  } catch {
    return null;
  }
}

class DriveApiError extends Error {
  status: number;
  body:   string;
  constructor(status: number, body: string) {
    super(`Drive API ${status}`);
    this.status = status;
    this.body   = body;
  }
}

async function uploadToDrive(
  token: string,
  payload: DriveBackupFile,
  existingFileId: string | null,
): Promise<string> {
  const json = JSON.stringify(payload);

  if (existingFileId) {
    // Update: simple media PATCH replaces file content.
    const resp = await authedFetch(
      token,
      `${DRIVE_UPLOAD}/files/${existingFileId}?uploadType=media`,
      {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    json,
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
    name:    BACKUP_FILENAME,
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

  const resp = await authedFetch(
    token,
    `${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id`,
    {
      method:  'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  if (!resp.ok) {
    const errBody = await resp.text().catch(() => '');
    throw new DriveApiError(resp.status, errBody);
  }
  const data = await resp.json() as { id?: string };
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

// ── Public API ───────────────────────────────────────────────────────────────

export interface FullDriveState {
  connected:   boolean;
  lastSynced:  string | null;
  pendingSync: boolean;
  error:       DriveError;
}

export async function getFullDriveState(): Promise<FullDriveState> {
  const [token, state] = await Promise.all([getDriveToken(), getDriveBackupState()]);
  return {
    connected:   !!token,
    lastSynced:  state.lastSynced,
    pendingSync: state.pendingSync,
    error:       state.error,
  };
}

export function dispatchDriveStateChanged(): void {
  try {
    window.dispatchEvent(new CustomEvent('jb:drive:state-changed'));
  } catch {
    // background/service-worker context — no window. Safe to ignore.
  }
}

export interface ConnectResult {
  token:  string;
  backup: DriveBackupFile | null;
  fileId: string | null;
}

export async function connectDrive(): Promise<ConnectResult> {
  const token = await launchDriveOAuth();
  await saveDriveToken(token);

  let fileId: string | null = null;
  let backup: DriveBackupFile | null = null;
  try {
    fileId = await findBackupFileId(token);
    if (fileId) backup = await downloadBackupFromDrive(token, fileId);
  } catch (err) {
    // Connection succeeded but lookup failed. Surface as sync_error so the UI
    // shows the "Retry" state; don't tear down the just-acquired token.
    const status = err instanceof DriveApiError ? err.status : 0;
    const body   = err instanceof DriveApiError ? err.body   : '';
    const error  = classifyError(status, body);
    await saveDriveBackupState({
      fileId:      null,
      lastSynced:  null,
      pendingSync: true,
      error,
    });
    dispatchDriveStateChanged();
    return { token, backup: null, fileId: null };
  }

  await saveDriveBackupState({
    fileId,
    lastSynced:  null,
    pendingSync: false,
    error:       null,
  });
  dispatchDriveStateChanged();
  return { token, backup, fileId };
}

export interface SyncResult {
  success:   boolean;
  errorCode: DriveError;
}

// Upload current local profile to Drive. NEVER throws — failures are captured
// in driveBackupState.error and signalled via the return value. Callers are
// expected to fire-and-forget; never block local saves on this.
export async function syncProfileToDrive(profile: Profile): Promise<SyncResult> {
  const token = await getDriveToken();
  if (!token) return { success: false, errorCode: null };

  const [prevState, learnedMappings] = await Promise.all([
    getDriveBackupState(),
    getLearnedMappings(),
  ]);

  try {
    let fileId = prevState.fileId;
    if (!fileId) {
      try { fileId = await findBackupFileId(token); }
      catch (err) {
        if (err instanceof DriveApiError) throw err;
        throw new DriveApiError(0, '');
      }
    }

    const payload: DriveBackupFile = {
      profile,
      learnedMappings,
      lastModified: new Date().toISOString(),
    };

    const newFileId = await uploadToDrive(token, payload, fileId);

    await saveDriveBackupState({
      fileId:      newFileId,
      lastSynced:  payload.lastModified,
      pendingSync: false,
      error:       null,
    });
    dispatchDriveStateChanged();
    return { success: true, errorCode: null };
  } catch (err) {
    const status = err instanceof DriveApiError ? err.status : 0;
    const body   = err instanceof DriveApiError ? err.body   : '';
    const errorCode = classifyError(status, body);

    await saveDriveBackupState({
      fileId:      prevState.fileId,
      lastSynced:  prevState.lastSynced,
      pendingSync: true,
      error:       errorCode,
    });
    dispatchDriveStateChanged();
    return { success: false, errorCode };
  }
}

// Force-upload local profile and clear any conflict state. Used after the
// user picks "Keep Local" in the restore conflict dialog.
export async function overwriteDriveWithLocal(profile: Profile): Promise<SyncResult> {
  return syncProfileToDrive(profile);
}

// Disconnect: revoke token, optionally delete the Drive file, then clear all
// Drive-related local storage. Always silent on failure.
export async function disconnectDrive(deleteFile: boolean): Promise<void> {
  const [token, state] = await Promise.all([getDriveToken(), getDriveBackupState()]);

  if (deleteFile && token && state.fileId) {
    try { await deleteFromDrive(token, state.fileId); } catch { /* silent */ }
  }
  if (token) await revokeDriveToken(token);

  await Promise.all([clearDriveToken(), clearDriveBackupState()]);
  dispatchDriveStateChanged();
}
