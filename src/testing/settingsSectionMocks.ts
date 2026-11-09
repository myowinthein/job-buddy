import { vi } from 'vitest';

/*
 * Module mock factories shared by the SettingsSection unit and integration
 * tests. Use them as `vi.mock(path, async () => (await import(...)).storageMock())`.
 */

export const storageMock = () => ({
  getProfile: vi.fn().mockResolvedValue(null),
  saveProfile: vi.fn().mockResolvedValue(undefined),
  getLearnedMappings: vi.fn().mockResolvedValue({}),
  saveLearnedMappings: vi.fn().mockResolvedValue(undefined),
  mergeLearnedMappings: vi.fn((local: object, remote: object) => ({ ...local, ...remote })),
  clearAllStorage: vi.fn().mockResolvedValue(undefined),
  getGeminiSettings: vi.fn().mockResolvedValue({
    apiKey: null,
    model: null,
    preference: 'auto',
    revision: null,
    verifiedAt: null,
  }),
  saveGeminiSettings: vi.fn(async (apiKey, model, preference) => ({
    apiKey,
    model,
    preference,
    revision: 'saved-revision',
    verifiedAt: 1,
  })),
  getGeminiApiKey: vi.fn().mockResolvedValue(null),
  getGeminiModel: vi.fn().mockResolvedValue(null),
  clearGeminiSettings: vi.fn().mockResolvedValue(undefined),
  saveThemePreference: vi.fn().mockResolvedValue(undefined),
});

export const themeMock = () => ({
  applyTheme: vi.fn(),
  getCurrentTheme: vi.fn(() => 'system'),
  subscribeTheme: vi.fn(() => () => {}),
});

export const geminiMock = () => ({ validateApiKey: vi.fn(), checkApiKey: vi.fn() });

export const driveSyncMock = () => ({
  claimDriveWarning: vi.fn().mockResolvedValue(true),
  getFullDriveState: vi
    .fn()
    .mockResolvedValue({ connected: false, lastSynced: null, pendingSync: false, error: null }),
  connectDrive: vi.fn(),
  inspectDriveBackup: vi.fn(),
  finishDriveReview: vi.fn().mockResolvedValue(undefined),
  completeDriveRestore: vi.fn(async (_id: string | undefined, save: () => Promise<void>) => {
    await save();
  }),
  disconnectDrive: vi.fn().mockResolvedValue(undefined),
  syncProfileToDrive: vi.fn().mockResolvedValue({ success: true, errorCode: null }),
  overwriteDriveWithLocal: vi.fn().mockResolvedValue({ success: true, errorCode: null }),
  isDriveConfigured: vi.fn(() => true),
});
