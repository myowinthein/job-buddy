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
  disconnectDrive,
  dispatchDriveStateChanged,
} from './driveSync';
import type { Profile } from '../types/profile';

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

