// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

vi.mock('@/src/components/options/QuickFillSettings', () => ({ QuickFillSettings: () => null }));
vi.mock('@/src/quick-fill/preferences', () => ({ updateQuickFillPreferences: vi.fn().mockResolvedValue(undefined) }));

vi.mock('@/src/utils/storage', () => ({
  getProfile: vi.fn().mockResolvedValue(null),
  saveProfile: vi.fn().mockResolvedValue(undefined),
  getLearnedMappings: vi.fn().mockResolvedValue({}),
  saveLearnedMappings: vi.fn().mockResolvedValue(undefined),
  mergeLearnedMappings: vi.fn((local: object, remote: object) => ({ ...local, ...remote })),
  clearAllStorage: vi.fn().mockResolvedValue(undefined),
  getGeminiSettings: vi.fn().mockResolvedValue({ apiKey: null, model: null, preference: 'auto', revision: null, verifiedAt: null }),
  saveGeminiSettings: vi.fn(async (apiKey, model, preference) => ({ apiKey, model, preference, revision: 'saved-revision', verifiedAt: 1 })),
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
  subscribeTheme: vi.fn(() => () => {}),
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
  inspectDriveBackup: vi.fn(),
  finishDriveReview: vi.fn().mockResolvedValue(undefined),
  completeDriveRestore: vi.fn(async (_id: string | undefined, save: () => Promise<void>) => { await save(); }),
  disconnectDrive: vi.fn().mockResolvedValue(undefined),
  syncProfileToDrive: vi.fn().mockResolvedValue({ success: true, errorCode: null }),
  overwriteDriveWithLocal: vi.fn().mockResolvedValue({ success: true, errorCode: null }),
  isDriveConfigured: vi.fn(() => true),
}));

import { SettingsSection } from './SettingsSection';
import { ToastProvider } from '@/src/components/ui/Toast';
import { getProfile, saveProfile, getGeminiApiKey, getLearnedMappings, saveLearnedMappings } from '@/src/utils/storage';
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

it('reviews imports into optional-only profiles instead of overwriting their existing data', async () => {
  const local = { id: 'optional-profile', professional: { summary: 'Keep this summary' }, links: { github: 'https://github.com/local' } } as Profile;
  vi.mocked(getProfile).mockResolvedValue(local);
  const { onImportComplete } = renderSection();
  const file = new File([JSON.stringify({ profile: { personal: { firstName: 'Imported' } } })], 'backup.json', { type: 'application/json' });
  fireEvent.change(document.querySelector('input[accept=".json"]')!, { target: { files: [file] } });
  fireEvent.click(await screen.findByText('Import All'));
  await waitFor(() => expect(onImportComplete).toHaveBeenCalled());
  expect(vi.mocked(saveProfile).mock.calls[0][0]).toMatchObject({
    personal: { firstName: 'Imported' },
    professional: { summary: 'Keep this summary' },
    links: { github: 'https://github.com/local' },
    derived: { fullName: 'Imported' },
  });
});

it('preserves legacy links and editor-valid emails through a real JSON review', async () => {
  const local = makeProfile();
  vi.mocked(getProfile).mockResolvedValue(local);
  const links = { github: 'https://github.com/imported', twitter: 'https://twitter.com/imported', dribbble: 'https://dribbble.com/imported', behance: 'https://behance.net/imported' };
  const { onImportComplete } = renderSection();
  const file = new File([JSON.stringify({ profile: { personal: { email: "o'brien@example.com" }, links } })], 'backup.json', { type: 'application/json' });
  fireEvent.change(document.querySelector('input[accept=".json"]')!, { target: { files: [file] } });
  await screen.findByText('This may be another person’s profile');
  fireEvent.click(screen.getByRole('radio', { name: /Update current profile/ }));
  fireEvent.click(screen.getByText('Import All'));
  await waitFor(() => expect(onImportComplete).toHaveBeenCalled());
  expect(vi.mocked(saveProfile).mock.calls[0][0]).toMatchObject({
    personal: { email: "o'brien@example.com" },
    links: { ...local.links, ...links },
  });
});

it('keeps local-only fields when accepting all changes from a sparse Drive backup', async () => {
  const local = { id: 'optional-profile', professional: { summary: 'Local summary' }, links: { github: 'https://github.com/local' } } as Profile;
  vi.mocked(getProfile).mockResolvedValue(local);
  vi.mocked(connectDrive).mockResolvedValue({
    token: 'synthetic', fileId: 'f1',
    backup: { profile: { personal: { firstName: 'Remote' } } as Profile, lastModified: '2026-01-01T00:00:00Z' },
  });
  const { onImportComplete } = renderSection();
  fireEvent.click(await screen.findByText('Connect Google Drive'));
  fireEvent.click(await screen.findByText('Restore All'));
  await waitFor(() => expect(onImportComplete).toHaveBeenCalled());
  expect(vi.mocked(saveProfile).mock.calls[0][0]).toMatchObject({
    personal: { firstName: 'Remote' },
    professional: { summary: 'Local summary' },
    links: { github: 'https://github.com/local' },
  });
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
      fireEvent.click(await screen.findByText('Review Changes'));
      expect(screen.queryByText('oversized.pdf')).toBeNull();
      fireEvent.click(screen.getByRole('button', {name:/^Restore Selected/}));
      await waitFor(() => expect(onImportComplete).toHaveBeenCalled());
      const saved = vi.mocked(saveProfile).mock.calls[0][0];
      expect(saved.personal.firstName).toBe('Remote');
      expect(saved.documents).toEqual(local.documents);
    },
  );
});


it.each([false, true])('uses one Drive profile/mapping save with storage failure=%s', async (failMappings) => {
  const backup = { profile: makeProfile(), lastModified: '2026-01-01T00:00:00Z',
    ...(failMappings ? { learnedMappings: { 'site.test': { name: 'personal.firstName' } } } : {}),
  };
  vi.mocked(connectDrive).mockResolvedValue({ token: 'synthetic', fileId: 'f1', backup });
  if (failMappings) vi.mocked(saveProfile).mockRejectedValueOnce(new Error('synthetic write failure'));
  const { onImportComplete } = renderSection();
  fireEvent.click(await screen.findByText('Connect Google Drive'));
  fireEvent.click(await screen.findByText('Restore All'));
  if (failMappings) {
    expect(await screen.findByText('Restore failed. Please try again.')).toBeTruthy();
    expect(saveProfile).toHaveBeenCalledTimes(1);
    expect(vi.mocked(saveProfile).mock.calls[0][1]).toMatchObject({ incoming: backup.learnedMappings });
    expect(saveLearnedMappings).not.toHaveBeenCalled();
    expect(onImportComplete).not.toHaveBeenCalled();
  } else {
    await waitFor(() => expect(onImportComplete).toHaveBeenCalled());
    expect(getLearnedMappings).toHaveBeenCalledTimes(1); // read for review; no metadata write needed
    expect(saveLearnedMappings).not.toHaveBeenCalled();
  }
});


it('reports credential settings as skipped rather than importing them from JSON', async () => {
  renderSection();
  const file = new File(
    [
      JSON.stringify({
        profile: { personal: { firstName: 'Imported' }, geminiApiKey: 'synthetic-key' },
        geminiApiKey: 'synthetic-key',
      }),
    ],
    'backup.json',
    { type: 'application/json' },
  );
  fireEvent.change(document.querySelector('input[accept=".json"]')!, { target: { files: [file] } });
  expect(await screen.findByText(/API keys and connection settings cannot be imported/)).toBeTruthy();
  expect(saveProfile).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Import All'));
  await waitFor(() => expect(saveProfile).toHaveBeenCalled());
  expect(JSON.stringify(vi.mocked(saveProfile).mock.calls[0][0])).not.toContain('synthetic-key');
});

it('rejects an oversized JSON backup before parsing any data', async () => {
  renderSection();
  const file = new File(['{}'], 'large.json', { type: 'application/json' });
  Object.defineProperty(file, 'size', { value: 4 * 1024 * 1024 + 1 });
  const read = vi.spyOn(file, 'text');
  fireEvent.change(document.querySelector('input[accept=".json"]')!, { target: { files: [file] } });
  expect(await screen.findByText(/File exceeds 4 MB limit/)).toBeTruthy();
  expect(read).not.toHaveBeenCalled();
  expect(saveProfile).not.toHaveBeenCalled();
});
