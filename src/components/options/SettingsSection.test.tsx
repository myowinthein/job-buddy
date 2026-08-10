// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';

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
  getAiAnswerDraftsEnabled: vi.fn().mockResolvedValue(false),
  saveAiAnswerDraftsEnabled: vi.fn().mockResolvedValue(undefined),
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
  getFullDriveState: vi.fn().mockResolvedValue({ connected: false, lastSynced: null, pendingSync: false, error: null }),
  connectDrive: vi.fn(),
  disconnectDrive: vi.fn().mockResolvedValue(undefined),
  syncProfileToDrive: vi.fn().mockResolvedValue({ success: true, errorCode: null }),
  overwriteDriveWithLocal: vi.fn().mockResolvedValue({ success: true, errorCode: null }),
  isDriveConfigured: vi.fn(() => true),
}));
vi.mock('@/src/resume-ai/parser', () => ({
  generateDiff: vi.fn(() => []),
  applyChanges: vi.fn((base: object) => base),
}));
vi.mock('@/src/utils/profileValidator', () => ({
  validateImportedProfile: vi.fn((p: object) => ({ sanitized: p, invalidFields: [] })),
}));

import { SettingsSection } from './SettingsSection';
import { ToastProvider } from '@/src/components/ui/Toast';
import { getProfile, saveProfile, getGeminiApiKey, clearAllStorage, saveLearnedMappings, getLearnedMappings, getApplicationHistory, saveGeminiModel, clearGeminiSettings, saveThemePreference, getAiAnswerDraftsEnabled, saveAiAnswerDraftsEnabled } from '@/src/utils/storage';
import { checkApiKey, validateApiKey } from '@/src/resume-ai/gemini';
import { getFullDriveState, disconnectDrive, connectDrive, syncProfileToDrive } from '@/src/utils/driveSync';
import { applyTheme } from '@/src/utils/theme';
import type { Profile } from '@/src/types/profile';
import type { KeyValidationResult } from '@/src/resume-ai/types';

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
    personal: { firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', phone: { countryCode: 'US', callingCode: '+1', number: '5551234567' } },
    address: { city: 'Austin', country: 'US' },
    professional: {},
    salary: { current: { amount: 1000, currency: 'USD', period: 'monthly' }, expected: [] },
    workAuthorization: [], workHistory: [], education: [], languages: [],
    links: { linkedin: 'https://linkedin.com/in/jane' },
    documents: { cv: {} },
    ...overrides,
  } as Profile;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getProfile).mockResolvedValue(null);
  vi.mocked(getGeminiApiKey).mockResolvedValue(null);
  vi.mocked(getAiAnswerDraftsEnabled).mockResolvedValue(false);
  vi.mocked(getFullDriveState).mockResolvedValue({ connected: false, lastSynced: null, pendingSync: false, error: null });
  vi.mocked(getLearnedMappings).mockResolvedValue({});
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('SettingsSection — Gemini key validation race guard (probeIdRef)', () => {
  it('discards a stale background probe result when the key changes again before it resolves', async () => {
    vi.useFakeTimers();
    let resolveFirstProbe!: (v: KeyValidationResult) => void;
    vi.mocked(checkApiKey).mockResolvedValue('valid');
    vi.mocked(validateApiKey)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirstProbe = resolve; }))
      .mockResolvedValueOnce({ valid: true, model: 'gemini-3.6-flash' });

    renderSection();
    const input = screen.getByLabelText('Gemini API Key') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'first-key' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(800); }); // fire debounce -> checkApiKey + first validateApiKey (pending)

    fireEvent.change(input, { target: { value: 'second-key' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(800); }); // fire debounce -> checkApiKey + second validateApiKey (resolves immediately)

    // The second (current) probe's result should already be applied.
    expect(vi.mocked(saveGeminiModel)).toHaveBeenCalledWith('gemini-3.6-flash');

    // Now let the FIRST (stale) probe resolve — its result must be ignored.
    await act(async () => { resolveFirstProbe({ valid: true, model: 'gemini-3.1-flash-lite' }); });
    expect(vi.mocked(saveGeminiModel)).not.toHaveBeenCalledWith('gemini-3.1-flash-lite');
  });
});

describe('SettingsSection — profile import merges learned mappings, never overwrites', () => {
  it('merges rather than overwrites learned mappings on an empty-profile immediate import', async () => {
    vi.mocked(getProfile).mockResolvedValue(null); // triggers the "empty profile, import immediately" path
    vi.mocked(getLearnedMappings).mockResolvedValue({ 'existing.com': { sig: { path: 'a.b', count: 2 } } });

    const { onImportComplete } = renderSection();

    const file = new File(
      [JSON.stringify({ profile: makeProfile(), learnedMappings: { 'new.com': { sig2: { path: 'c.d', count: 1 } } } })],
      'export.json', { type: 'application/json' },
    );
    const fileInput = document.querySelector('input[type="file"][accept=".json"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => expect(onImportComplete).toHaveBeenCalled());
    expect(vi.mocked(saveLearnedMappings)).toHaveBeenCalledWith(
      expect.objectContaining({ 'existing.com': expect.anything(), 'new.com': expect.anything() }),
    );
  });
});

describe('SettingsSection — Reset All Data confirmation gate', () => {
  it('disables the reset button until DELETE is typed, and clears storage once confirmed', async () => {
    vi.mocked(getProfile).mockResolvedValue(makeProfile()); // non-empty, so Reset Now proceeds to the dialog

    renderSection();
    fireEvent.click(await screen.findByText('Reset Now'));
    await screen.findByText('This cannot be undone.');

    const resetButton = screen.getByRole('button', { name: 'Reset All Data' }) as HTMLButtonElement;
    expect(resetButton.disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText('DELETE'), { target: { value: 'DELETE' } });
    expect(resetButton.disabled).toBe(false);

    fireEvent.click(resetButton);
    await waitFor(() => expect(vi.mocked(clearAllStorage)).toHaveBeenCalled());
  });

  it('deletes the Drive backup only when "everywhere" scope is selected', async () => {
    vi.mocked(getProfile).mockResolvedValue(makeProfile());
    vi.mocked(getFullDriveState).mockResolvedValue({ connected: true, lastSynced: null, pendingSync: false, error: null });

    renderSection();
    fireEvent.click(await screen.findByText('Reset Now'));
    await screen.findByText('This cannot be undone.');

    fireEvent.click(screen.getByLabelText(/This device and Google Drive/));
    fireEvent.change(screen.getByPlaceholderText('DELETE'), { target: { value: 'DELETE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset All Data' }));

    await waitFor(() => expect(vi.mocked(disconnectDrive)).toHaveBeenCalledWith(true));
  });

  it('also clears the Gemini key and resets the theme preference, matching the "all data" UI copy', async () => {
    vi.mocked(getProfile).mockResolvedValue(makeProfile());

    renderSection();
    fireEvent.click(await screen.findByText('Reset Now'));
    await screen.findByText('This cannot be undone.');

    fireEvent.change(screen.getByPlaceholderText('DELETE'), { target: { value: 'DELETE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset All Data' }));

    await waitFor(() => expect(vi.mocked(clearAllStorage)).toHaveBeenCalled());
    expect(vi.mocked(clearGeminiSettings)).toHaveBeenCalled();
    expect(vi.mocked(saveThemePreference)).toHaveBeenCalledWith('system');
    expect(vi.mocked(applyTheme)).toHaveBeenCalledWith('system');
  });

  it('closes on Escape before confirming', async () => {
    vi.mocked(getProfile).mockResolvedValue(makeProfile());

    renderSection();
    fireEvent.click(await screen.findByText('Reset Now'));
    await screen.findByText('This cannot be undone.');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText('This cannot be undone.')).toBeNull();
  });

  it('ignores Escape while a reset is actually in flight', async () => {
    vi.mocked(getProfile).mockResolvedValue(makeProfile());
    let resolveClear!: () => void;
    vi.mocked(clearAllStorage).mockReturnValueOnce(new Promise((resolve) => { resolveClear = () => resolve(undefined); }));

    renderSection();
    fireEvent.click(await screen.findByText('Reset Now'));
    await screen.findByText('This cannot be undone.');
    fireEvent.change(screen.getByPlaceholderText('DELETE'), { target: { value: 'DELETE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset All Data' }));

    await screen.findByText('Resetting…');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByText('Resetting…')).toBeTruthy(); // dialog is still up, mid-reset

    resolveClear();
    await waitFor(() => expect(screen.queryByText('This cannot be undone.')).toBeNull());
  });
});

describe('SettingsSection — fmtDriveTimestamp (via the connected Drive state display)', () => {
  it('shows "Today at ..." for a timestamp from earlier today', async () => {
    const today = new Date();
    vi.mocked(getFullDriveState).mockResolvedValue({ connected: true, lastSynced: today.toISOString(), pendingSync: false, error: null });
    renderSection();
    expect(await screen.findByText(/Last synced: Today at/)).toBeTruthy();
  });

  it('shows "Not synced yet" when lastSynced is null', async () => {
    vi.mocked(getFullDriveState).mockResolvedValue({ connected: true, lastSynced: null, pendingSync: false, error: null });
    renderSection();
    expect(await screen.findByText(/Last synced: Not synced yet/)).toBeTruthy();
  });

  it('shows "Not synced yet" for an unparseable timestamp rather than crashing', async () => {
    vi.mocked(getFullDriveState).mockResolvedValue({ connected: true, lastSynced: 'not-a-date', pendingSync: false, error: null });
    renderSection();
    expect(await screen.findByText(/Last synced: Not synced yet/)).toBeTruthy();
  });
});

describe('SettingsSection — Google Drive connect/restore/conflict flow', () => {
  it('shows a restore dialog when connecting with an empty local profile and a Drive backup exists', async () => {
    vi.mocked(getProfile).mockResolvedValue(null);
    vi.mocked(connectDrive).mockResolvedValue({
      token: 't', fileId: 'f1',
      backup: { profile: makeProfile(), lastModified: '2026-01-01T00:00:00.000Z' },
    });

    renderSection();
    fireEvent.click(await screen.findByText('Connect Google Drive'));

    expect(await screen.findByText('Profile found in Google Drive. Restore it?')).toBeTruthy();
  });

  it('restores the Drive backup on Restore, merges learned mappings, and completes the import', async () => {
    vi.mocked(getProfile).mockResolvedValue(null);
    const backupProfile = makeProfile();
    vi.mocked(connectDrive).mockResolvedValue({
      token: 't', fileId: 'f1',
      backup: { profile: backupProfile, learnedMappings: { 'a.com': { sig: { path: 'a.b', count: 2 } } }, lastModified: '2026-01-01T00:00:00.000Z' },
    });
    vi.mocked(getLearnedMappings).mockResolvedValue({ 'b.com': { sig2: { path: 'c.d', count: 2 } } });

    const { onImportComplete } = renderSection();
    fireEvent.click(await screen.findByText('Connect Google Drive'));
    fireEvent.click(await screen.findByText('Restore'));

    await waitFor(() => expect(vi.mocked(saveProfile)).toHaveBeenCalledWith(backupProfile));
    expect(vi.mocked(saveLearnedMappings)).toHaveBeenCalledWith(
      expect.objectContaining({ 'a.com': expect.anything(), 'b.com': expect.anything() }),
    );
    expect(onImportComplete).toHaveBeenCalled();
    // The restore dialog closes.
    expect(screen.queryByText('Profile found in Google Drive. Restore it?')).toBeNull();
  });

  it('shows a conflict summary dialog when connecting with a non-empty local profile', async () => {
    vi.mocked(getProfile).mockResolvedValue(makeProfile());
    vi.mocked(connectDrive).mockResolvedValue({
      token: 't', fileId: 'f1',
      backup: { profile: makeProfile({ personal: { firstName: 'Other', lastName: 'Person' } } as Partial<Profile>), lastModified: '2026-01-01T00:00:00.000Z' },
    });

    renderSection();
    fireEvent.click(await screen.findByText('Connect Google Drive'));

    expect(await screen.findByText('Profile Conflict')).toBeTruthy();
  });

  it('pushes the local profile to Drive as the initial snapshot when no backup exists yet', async () => {
    vi.mocked(getProfile).mockResolvedValue(makeProfile());
    vi.mocked(connectDrive).mockResolvedValue({ token: 't', fileId: null, backup: null });

    renderSection();
    fireEvent.click(await screen.findByText('Connect Google Drive'));

    await waitFor(() => expect(vi.mocked(syncProfileToDrive)).toHaveBeenCalled());
  });

  it('shows an error toast when connectDrive rejects', async () => {
    vi.mocked(connectDrive).mockRejectedValue(new Error('oauth failed'));

    renderSection();
    fireEvent.click(await screen.findByText('Connect Google Drive'));

    expect(await screen.findByText('Could not connect to Google Drive. Please try again.')).toBeTruthy();
  });

  it('closes the restore dialog on Escape', async () => {
    vi.mocked(getProfile).mockResolvedValue(null);
    vi.mocked(connectDrive).mockResolvedValue({
      token: 't', fileId: 'f1',
      backup: { profile: makeProfile(), lastModified: '2026-01-01T00:00:00.000Z' },
    });

    renderSection();
    fireEvent.click(await screen.findByText('Connect Google Drive'));
    await screen.findByText('Profile found in Google Drive. Restore it?');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText('Profile found in Google Drive. Restore it?')).toBeNull();
  });

  it('ignores Escape on the restore dialog while a restore is actually in flight', async () => {
    vi.mocked(getProfile).mockResolvedValue(null);
    vi.mocked(connectDrive).mockResolvedValue({
      token: 't', fileId: 'f1',
      backup: { profile: makeProfile(), lastModified: '2026-01-01T00:00:00.000Z' },
    });
    let resolveSave!: () => void;
    vi.mocked(saveProfile).mockReturnValueOnce(new Promise((resolve) => { resolveSave = () => resolve(undefined); }));

    renderSection();
    fireEvent.click(await screen.findByText('Connect Google Drive'));
    fireEvent.click(await screen.findByText('Restore'));

    await screen.findByText('Restoring…');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByText('Restoring…')).toBeTruthy(); // dialog is still up, mid-restore

    resolveSave();
    await waitFor(() => expect(screen.queryByText('Profile found in Google Drive. Restore it?')).toBeNull());
  });

  it('closes the disconnect dialog on Escape', async () => {
    vi.mocked(getFullDriveState).mockResolvedValue({ connected: true, lastSynced: null, pendingSync: false, error: null });

    renderSection();
    fireEvent.click(await screen.findByText('Disconnect'));
    await screen.findByText('What to do with your Drive backup?');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText('What to do with your Drive backup?')).toBeNull();
  });
});

describe('SettingsSection — Export', () => {
  it('shows a warning and does not build a download when there is no profile', async () => {
    vi.mocked(getProfile).mockResolvedValue(null);
    renderSection();
    fireEvent.click(await screen.findByText('Download File'));
    expect(await screen.findByText('No profile data to export.')).toBeTruthy();
  });

  it('builds the export JSON blob with profile/learnedMappings/applicationHistory and triggers a download', async () => {
    const profile = makeProfile({ id: 'abcdef1234567890' });
    vi.mocked(getProfile).mockResolvedValue(profile);
    vi.mocked(getLearnedMappings).mockResolvedValue({ 'a.com': { sig: { path: 'personal.firstName', count: 2 } } });
    vi.mocked(getApplicationHistory).mockResolvedValue([]);

    const createObjectURL = vi.fn((_blob: Blob) => 'blob:mock-url');
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    const clickSpy = vi.fn();
    const realCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreateElement(tag);
      if (tag === 'a') el.click = clickSpy;
      return el;
    });

    renderSection();
    fireEvent.click(await screen.findByText('Download File'));

    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    const parsed = JSON.parse(await blob.text());
    expect(parsed.profile).toEqual(profile);
    expect(parsed.learnedMappings).toEqual({ 'a.com': { sig: { path: 'personal.firstName', count: 2 } } });
    expect(parsed.applicationHistory).toEqual([]);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    expect(await screen.findByText('Profile exported successfully')).toBeTruthy();

    createElementSpy.mockRestore();
  });
});

describe('SettingsSection — AI-Drafted Answers setting', () => {
  it('is hidden when no Gemini key is configured', async () => {
    renderSection();
    await screen.findByText('AI Features');
    expect(screen.queryByText('AI-Drafted Answers')).toBeNull();
  });

  it('shows Off selected by default once a valid key is configured', async () => {
    vi.mocked(getGeminiApiKey).mockResolvedValue('valid-key');
    renderSection();

    await screen.findByText('AI-Drafted Answers');
    const [off, on] = screen.getAllByRole('radio', { name: /Off|On/ }) as HTMLInputElement[];
    expect(off.checked).toBe(true);
    expect(on.checked).toBe(false);
  });

  it('reflects a previously-saved "on" preference on load', async () => {
    vi.mocked(getGeminiApiKey).mockResolvedValue('valid-key');
    vi.mocked(getAiAnswerDraftsEnabled).mockResolvedValue(true);
    renderSection();

    await screen.findByText('AI-Drafted Answers');
    const on = screen.getByRole('radio', { name: 'On' }) as HTMLInputElement;
    expect(on.checked).toBe(true);
  });

  it('saves the new value when switched to On', async () => {
    vi.mocked(getGeminiApiKey).mockResolvedValue('valid-key');
    renderSection();

    await screen.findByText('AI-Drafted Answers');
    fireEvent.click(screen.getByRole('radio', { name: 'On' }));

    expect(vi.mocked(saveAiAnswerDraftsEnabled)).toHaveBeenCalledWith(true);
  });

  it('saves the new value when switched back to Off', async () => {
    vi.mocked(getGeminiApiKey).mockResolvedValue('valid-key');
    vi.mocked(getAiAnswerDraftsEnabled).mockResolvedValue(true);
    renderSection();

    await screen.findByText('AI-Drafted Answers');
    fireEvent.click(screen.getByRole('radio', { name: 'Off' }));

    expect(vi.mocked(saveAiAnswerDraftsEnabled)).toHaveBeenCalledWith(false);
  });
});
