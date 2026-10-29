// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

vi.mock('@/src/utils/storage', () => ({
  getProfile: vi.fn().mockResolvedValue(null),
  saveProfile: vi.fn().mockResolvedValue(undefined),
  getLearnedMappings: vi.fn().mockResolvedValue({}),
  getApplicationHistory: vi.fn().mockResolvedValue([]),
  saveLearnedMappings: vi.fn().mockResolvedValue(undefined),
  mergeLearnedMappings: vi.fn((local: object, remote: object) => ({ ...local, ...remote })),
  saveApplicationHistory: vi.fn().mockResolvedValue(undefined),
  clearAllStorage: vi.fn().mockResolvedValue(undefined),
  getGeminiApiKey: vi.fn().mockResolvedValue(null),
  saveGeminiApiKey: vi.fn().mockResolvedValue(undefined),
  getGeminiModel: vi.fn().mockResolvedValue(null),
  saveGeminiModel: vi.fn().mockResolvedValue(undefined),
  clearGeminiSettings: vi.fn().mockResolvedValue(undefined),
  saveThemePreference: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/src/utils/theme', () => ({
  applyTheme: vi.fn(),
  getCurrentTheme: vi.fn(() => 'system'),
}));
vi.mock('@/src/resume-ai/gemini', () => ({
  validateApiKey: vi.fn(),
  checkApiKey: vi.fn(),
}));
vi.mock('@/src/utils/driveSync', () => ({
  getFullDriveState: vi
    .fn()
    .mockResolvedValue({ connected: false, lastSynced: null, pendingSync: false, error: null }),
  connectDrive: vi.fn(),
  disconnectDrive: vi.fn().mockResolvedValue(undefined),
  syncProfileToDrive: vi.fn().mockResolvedValue({ success: true, errorCode: null }),
  overwriteDriveWithLocal: vi.fn().mockResolvedValue({ success: true, errorCode: null }),
  isDriveConfigured: vi.fn(() => true),
}));

import { SettingsSection } from './SettingsSection';
import { ToastProvider } from '@/src/components/ui/Toast';
import { getProfile, saveProfile, getGeminiApiKey, getLearnedMappings } from '@/src/utils/storage';
import { getFullDriveState, connectDrive } from '@/src/utils/driveSync';
import type { Profile } from '@/src/types/profile';

function renderSection(onImportComplete = vi.fn(), onResetComplete = vi.fn()) {
  render(
    <ToastProvider>
      <SettingsSection onImportComplete={onImportComplete} onResetComplete={onResetComplete} />
    </ToastProvider>,
  );
  return { onImportComplete, onResetComplete };
}

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'p1',
    personal: {
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      phone: { countryCode: 'US', callingCode: '+1', number: '5551234567' },
    },
    address: { city: 'Austin', country: 'US' },
    professional: {},
    salary: { current: { amount: 1000, currency: 'USD', period: 'monthly' }, expected: [] },
    workAuthorization: [],
    workHistory: [],
    education: [],
    languages: [],
    links: { linkedin: 'https://linkedin.com/in/jane' },
    documents: { cv: {} },
    ...overrides,
  } as Profile;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getProfile).mockResolvedValue(null);
  vi.mocked(getGeminiApiKey).mockResolvedValue(null);
  vi.mocked(getFullDriveState).mockResolvedValue({
    connected: false,
    lastSynced: null,
    pendingSync: false,
    error: null,
  });
  vi.mocked(getLearnedMappings).mockResolvedValue({});
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('SettingsSection — real Drive document validation', () => {
  it.each(['cv', 'coverLetter'] as const)(
    'skips an oversized incoming %s in review while retaining local documents',
    async (field) => {
      const localFile = { name: 'legacy.pdf', size: 6 * 1024 * 1024, base64: 'legacy-data' };
      const local = makeProfile({
        documents: {
          cv: { url: 'https://example.com/cv', file: localFile },
          coverLetter: { url: 'https://example.com/letter', file: localFile },
        },
      });
      const remote = makeProfile({
        personal: { ...local.personal, firstName: 'Remote' },
        documents: {
          [field]: { file: { name: 'oversized.pdf', size: 6 * 1024 * 1024, base64: 'incoming' } },
          cv:
            field === 'cv'
              ? { file: { name: 'oversized.pdf', size: 6 * 1024 * 1024, base64: 'incoming' } }
              : {},
        },
      });
      vi.mocked(getProfile).mockResolvedValue(local);
      vi.mocked(connectDrive).mockResolvedValue({
        token: 'synthetic',
        fileId: 'f1',
        backup: { profile: remote, lastModified: '2026-01-01T00:00:00Z' },
      });
      const { onImportComplete } = renderSection();
      fireEvent.click(await screen.findByText('Connect Google Drive'));
      fireEvent.click(await screen.findByText('Review →'));
      expect(screen.queryByText('oversized.pdf')).toBeNull();
      fireEvent.click(screen.getByText('Apply Selected'));
      await waitFor(() => expect(onImportComplete).toHaveBeenCalled());
      const saved = vi.mocked(saveProfile).mock.calls[0][0];
      expect(saved.personal.firstName).toBe('Remote');
      expect(saved.documents).toEqual(local.documents);
    },
  );
});
