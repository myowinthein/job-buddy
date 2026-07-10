import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

// `defineBackground` is a WXT build-time global. Stub it to a no-op that
// ignores its callback so importing the entrypoint doesn't try to register
// chrome.runtime listeners at module-eval time. Set before the dynamic import
// below so it's in place when background.ts is evaluated.
vi.stubGlobal('defineBackground', () => undefined);

vi.mock('@/src/utils/storage', () => ({
  getProfile: vi.fn(),
  getDriveBackupState: vi.fn(),
  getDriveToken: vi.fn(),
}));
vi.mock('@/src/utils/driveSync', () => ({
  syncProfileToDrive: vi.fn(),
}));

import { getProfile, getDriveBackupState, getDriveToken } from '@/src/utils/storage';
import { syncProfileToDrive } from '@/src/utils/driveSync';

const mockGetProfile = vi.mocked(getProfile);
const mockGetState = vi.mocked(getDriveBackupState);
const mockGetToken = vi.mocked(getDriveToken);
const mockSync = vi.mocked(syncProfileToDrive);

let retryPendingDriveSync: typeof import('./background').retryPendingDriveSync;

beforeAll(async () => {
  ({ retryPendingDriveSync } = await import('./background'));
});

const profile = { personal: { firstName: 'Jane' } } as never;

describe('retryPendingDriveSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSync.mockResolvedValue({ success: true } as never);
  });

  it('does nothing when no sync is pending', async () => {
    mockGetState.mockResolvedValue({ pendingSync: false } as never);
    mockGetToken.mockResolvedValue('token' as never);

    await retryPendingDriveSync();

    expect(mockGetProfile).not.toHaveBeenCalled();
    expect(mockSync).not.toHaveBeenCalled();
  });

  it('does nothing when there is no Drive token', async () => {
    mockGetState.mockResolvedValue({ pendingSync: true } as never);
    mockGetToken.mockResolvedValue(null as never);

    await retryPendingDriveSync();

    expect(mockGetProfile).not.toHaveBeenCalled();
    expect(mockSync).not.toHaveBeenCalled();
  });

  it('does nothing when the profile is missing', async () => {
    mockGetState.mockResolvedValue({ pendingSync: true } as never);
    mockGetToken.mockResolvedValue('token' as never);
    mockGetProfile.mockResolvedValue(null as never);

    await retryPendingDriveSync();

    expect(mockSync).not.toHaveBeenCalled();
  });

  it('syncs the profile when a pending sync, token, and profile are all present', async () => {
    mockGetState.mockResolvedValue({ pendingSync: true } as never);
    mockGetToken.mockResolvedValue('token' as never);
    mockGetProfile.mockResolvedValue(profile);

    await retryPendingDriveSync();

    expect(mockSync).toHaveBeenCalledWith(profile);
  });

  it('swallows errors and never throws from the startup handler', async () => {
    mockGetState.mockRejectedValue(new Error('storage unavailable'));
    mockGetToken.mockResolvedValue('token' as never);

    await expect(retryPendingDriveSync()).resolves.toBeUndefined();
    expect(mockSync).not.toHaveBeenCalled();
  });
});
