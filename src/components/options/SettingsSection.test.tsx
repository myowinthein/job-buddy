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
import { getProfile, getGeminiApiKey, clearAllStorage, saveLearnedMappings, getLearnedMappings, saveGeminiModel, clearGeminiSettings, saveThemePreference } from '@/src/utils/storage';
import { checkApiKey, validateApiKey } from '@/src/resume-ai/gemini';
import { getFullDriveState, disconnectDrive } from '@/src/utils/driveSync';
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
