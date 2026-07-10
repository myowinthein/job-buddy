// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory chrome.storage.local
const store: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get(key: string, cb: (r: Record<string, unknown>) => void) { cb({ [key]: store[key] }); },
      set(items: Record<string, unknown>, cb: () => void) { Object.assign(store, items); cb(); },
      remove(keys: string[], cb: () => void) { keys.forEach(k => delete store[k]); cb(); },
    },
  },
  runtime: { lastError: null },
  identity: {
    getRedirectURL: vi.fn(() => 'https://extension-redirect/'),
    launchWebAuthFlow: vi.fn(),
  },
});

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import {
  isDriveConfigured,
  getFullDriveState,
  syncProfileToDrive,
  overwriteDriveWithLocal,
  revokeDriveToken,
  disconnectDrive,
  dispatchDriveStateChanged,
  retryPendingDriveSync,
} from './driveSync';
import type { Profile } from '../types/profile';

// Loads a fresh copy of the driveSync module with VITE_GOOGLE_DRIVE_CLIENT_ID
// stubbed so isDriveConfigured() returns true — needed to exercise connectDrive,
// whose launchDriveOAuth() short-circuits with 'not_configured' otherwise.
async function importConfiguredDriveSync() {
  vi.stubEnv('VITE_GOOGLE_DRIVE_CLIENT_ID', 'test-client-id');
  vi.resetModules();
  const mod = await import('./driveSync');
  return mod;
}

// Drives chrome.identity.launchWebAuthFlow to resolve with a redirect URL that
// carries the given access token in its fragment, or to fail via lastError.
function mockAuthFlow(opts: { token?: string; fail?: boolean }) {
  (chrome.identity.launchWebAuthFlow as ReturnType<typeof vi.fn>).mockImplementation(
    (_details: unknown, cb: (url?: string) => void) => {
      const runtime = chrome.runtime as { lastError: { message: string } | null };
      if (opts.fail) {
        runtime.lastError = { message: 'user cancelled' };
        cb(undefined);
        runtime.lastError = null;
        return;
      }
      cb(`https://extension-redirect/#access_token=${opts.token}&token_type=Bearer`);
    },
  );
}

function makeProfile(): Profile {
  return { personal: { firstName: 'Test' } } as unknown as Profile;
}

function mockFetchSequence(responses: Array<{ ok: boolean; status?: number; body?: unknown }>) {
  let i = 0;
  fetchMock.mockImplementation(() => {
    const r = responses[i++] ?? { ok: true, body: {} };
    const status = r.status ?? (r.ok ? 200 : 500);
    return Promise.resolve({
      ok: r.ok,
      status,
      json: () => Promise.resolve(r.body ?? {}),
      text: () => Promise.resolve(typeof r.body === 'string' ? r.body : JSON.stringify(r.body ?? '')),
    });
  });
}

beforeEach(() => {
  Object.keys(store).forEach(k => delete store[k]);
  fetchMock.mockReset();
  vi.clearAllMocks();
});

describe('isDriveConfigured', () => {
  it('returns false when no CLIENT_ID env var is set', () => {
    // import.meta.env is not populated in Vitest, so CLIENT_ID resolves to ''
    expect(isDriveConfigured()).toBe(false);
  });
});

describe('getFullDriveState', () => {
  it('returns disconnected defaults when nothing is stored', async () => {
    const state = await getFullDriveState();
    expect(state).toEqual({
      connected:   false,
      lastSynced:  null,
      pendingSync: false,
      error:       null,
    });
  });

  it('returns connected:true when a token is stored', async () => {
    store['driveToken'] = 'tok-abc';
    const state = await getFullDriveState();
    expect(state.connected).toBe(true);
  });
});

describe('dispatchDriveStateChanged', () => {
  it('dispatches jb:drive:state-changed on window', () => {
    const listener = vi.fn();
    window.addEventListener('jb:drive:state-changed', listener);
    dispatchDriveStateChanged();
    window.removeEventListener('jb:drive:state-changed', listener);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('syncProfileToDrive', () => {
  it('returns success:false with null errorCode when no token is stored', async () => {
    const result = await syncProfileToDrive(makeProfile());
    expect(result).toEqual({ success: false, errorCode: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uploads successfully when token exists and no prior fileId', async () => {
    store['driveToken'] = 'tok-valid';
    store['driveBackupState'] = { fileId: null, lastSynced: null, pendingSync: false, error: null };
    mockFetchSequence([
      { ok: true, body: { files: [] } },        // findBackupFileId (no existing file)
      { ok: true, body: { id: 'new-file-id' } }, // multipart POST create
    ]);
    const result = await syncProfileToDrive(makeProfile());
    expect(result.success).toBe(true);
    expect(result.errorCode).toBeNull();
  });

  it('patches existing file when fileId is already stored', async () => {
    store['driveToken'] = 'tok-valid';
    store['driveBackupState'] = { fileId: 'existing-id', lastSynced: null, pendingSync: false, error: null };
    mockFetchSequence([
      { ok: true, body: { id: 'existing-id' } }, // PATCH update
    ]);
    const result = await syncProfileToDrive(makeProfile());
    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('existing-id'),
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('classifies 401 as token_expired', async () => {
    store['driveToken'] = 'tok-expired';
    store['driveBackupState'] = { fileId: 'file-id', lastSynced: null, pendingSync: false, error: null };
    mockFetchSequence([{ ok: false, status: 401, body: 'Unauthorized' }]);
    const result = await syncProfileToDrive(makeProfile());
    expect(result).toEqual({ success: false, errorCode: 'token_expired' });
  });

  it('classifies 403 with quota body as storage_full', async () => {
    store['driveToken'] = 'tok-valid';
    store['driveBackupState'] = { fileId: 'file-id', lastSynced: null, pendingSync: false, error: null };
    mockFetchSequence([{ ok: false, status: 403, body: 'storageQuotaExceeded' }]);
    const result = await syncProfileToDrive(makeProfile());
    expect(result).toEqual({ success: false, errorCode: 'storage_full' });
  });

  it('classifies other errors as sync_error', async () => {
    store['driveToken'] = 'tok-valid';
    store['driveBackupState'] = { fileId: 'file-id', lastSynced: null, pendingSync: false, error: null };
    mockFetchSequence([{ ok: false, status: 500, body: 'Internal Server Error' }]);
    const result = await syncProfileToDrive(makeProfile());
    expect(result).toEqual({ success: false, errorCode: 'sync_error' });
  });

  it('sets pendingSync:true on failure', async () => {
    store['driveToken'] = 'tok-valid';
    store['driveBackupState'] = { fileId: 'file-id', lastSynced: null, pendingSync: false, error: null };
    mockFetchSequence([{ ok: false, status: 500, body: '' }]);
    await syncProfileToDrive(makeProfile());
    const saved = store['driveBackupState'] as { pendingSync: boolean };
    expect(saved.pendingSync).toBe(true);
  });
});

describe('connectDrive', () => {
  it('rejects when the OAuth flow fails', async () => {
    const mod = await importConfiguredDriveSync();
    mockAuthFlow({ fail: true });
    await expect(mod.connectDrive()).rejects.toThrow('user cancelled');
    vi.unstubAllEnvs();
  });

  it('OAuth succeeds but file lookup fails → stores token, writes pendingSync:true', async () => {
    const mod = await importConfiguredDriveSync();
    mockAuthFlow({ token: 'tok-fresh' });
    // findBackupFileId → non-ok response → DriveApiError → classifyError.
    mockFetchSequence([{ ok: false, status: 500, body: 'boom' }]);

    const result = await mod.connectDrive();

    expect(result).toEqual({ token: 'tok-fresh', backup: null, fileId: null });
    expect(store['driveToken']).toBe('tok-fresh');
    const state = store['driveBackupState'] as { pendingSync: boolean; error: string | null };
    expect(state.pendingSync).toBe(true);
    expect(state.error).toBe('sync_error');
    vi.unstubAllEnvs();
  });

  it('full success: stores token, finds file, downloads backup, clears pending', async () => {
    const mod = await importConfiguredDriveSync();
    mockAuthFlow({ token: 'tok-ok' });
    const backupFile = { profile: { personal: { firstName: 'Cloud' } }, learnedMappings: {}, lastModified: '2026-01-01T00:00:00Z' };
    mockFetchSequence([
      { ok: true, body: { files: [{ id: 'file-1', name: 'job-buddy-profile.json' }] } }, // findBackupFileId
      { ok: true, body: backupFile },                                                     // downloadBackupFromDrive
    ]);

    const result = await mod.connectDrive();

    expect(result.token).toBe('tok-ok');
    expect(result.fileId).toBe('file-1');
    expect(result.backup).toEqual(backupFile);
    const state = store['driveBackupState'] as { pendingSync: boolean; error: string | null; fileId: string | null };
    expect(state.pendingSync).toBe(false);
    expect(state.error).toBeNull();
    expect(state.fileId).toBe('file-1');
    vi.unstubAllEnvs();
  });
});

describe('overwriteDriveWithLocal', () => {
  it('delegates to syncProfileToDrive and propagates its result', async () => {
    // No token stored → syncProfileToDrive returns the no-token result, which
    // overwriteDriveWithLocal must return verbatim.
    const result = await overwriteDriveWithLocal(makeProfile());
    expect(result).toEqual({ success: false, errorCode: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('propagates a successful sync result', async () => {
    store['driveToken'] = 'tok-valid';
    store['driveBackupState'] = { fileId: 'existing-id', lastSynced: null, pendingSync: false, error: null };
    mockFetchSequence([{ ok: true, body: { id: 'existing-id' } }]); // PATCH update
    const result = await overwriteDriveWithLocal(makeProfile());
    expect(result).toEqual({ success: true, errorCode: null });
  });
});

describe('revokeDriveToken', () => {
  it('resolves silently when the revoke fetch rejects', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    await expect(revokeDriveToken('tok-abc')).resolves.toBeUndefined();
  });

  it('POSTs to the revoke endpoint with the token', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: vi.fn(), text: vi.fn() });
    await revokeDriveToken('tok-xyz');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('token=tok-xyz'),
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('disconnectDrive', () => {
  it('clears token and backup state regardless of deleteFile', async () => {
    store['driveToken'] = 'tok-abc';
    store['driveBackupState'] = { fileId: null, lastSynced: null, pendingSync: false, error: null };
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: vi.fn(), text: vi.fn().mockResolvedValue('') });
    await disconnectDrive(false);
    expect(store['driveToken']).toBeUndefined();
    expect(store['driveBackupState']).toBeUndefined();
  });

  it('calls Drive delete endpoint when deleteFile=true and fileId exists', async () => {
    store['driveToken'] = 'tok-abc';
    store['driveBackupState'] = { fileId: 'file-xyz', lastSynced: null, pendingSync: false, error: null };
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: vi.fn(), text: vi.fn().mockResolvedValue('') });
    await disconnectDrive(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('file-xyz'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('does not call delete when deleteFile=false', async () => {
    store['driveToken'] = 'tok-abc';
    store['driveBackupState'] = { fileId: 'file-xyz', lastSynced: null, pendingSync: false, error: null };
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: vi.fn(), text: vi.fn().mockResolvedValue('') });
    await disconnectDrive(false);
    // Only revoke call (no DELETE)
    const deleteCalled = fetchMock.mock.calls.some(
      ([, init]) => (init as RequestInit)?.method === 'DELETE',
    );
    expect(deleteCalled).toBe(false);
  });
});

describe('retryPendingDriveSync', () => {
  it('does nothing when no sync is pending', async () => {
    store['driveBackupState'] = { fileId: null, lastSynced: null, pendingSync: false, error: null };
    store['driveToken'] = 'tok-abc';
    store['profile'] = makeProfile();

    await retryPendingDriveSync();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does nothing when there is no Drive token', async () => {
    store['driveBackupState'] = { fileId: null, lastSynced: null, pendingSync: true, error: null };
    store['profile'] = makeProfile();

    await retryPendingDriveSync();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does nothing when there is no profile to upload', async () => {
    store['driveBackupState'] = { fileId: null, lastSynced: null, pendingSync: true, error: null };
    store['driveToken'] = 'tok-abc';

    await retryPendingDriveSync();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uploads the profile when a pending sync, token, and profile are all present', async () => {
    store['driveBackupState'] = { fileId: 'file-id', lastSynced: null, pendingSync: true, error: null };
    store['driveToken'] = 'tok-abc';
    store['profile'] = makeProfile();
    mockFetchSequence([{ ok: true, body: {} }]);

    await retryPendingDriveSync();

    expect(fetchMock).toHaveBeenCalled();
  });

  it('resolves without throwing when the upload fails', async () => {
    store['driveBackupState'] = { fileId: 'file-id', lastSynced: null, pendingSync: true, error: null };
    store['driveToken'] = 'tok-abc';
    store['profile'] = makeProfile();
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(retryPendingDriveSync()).resolves.toBeUndefined();
  });
});

