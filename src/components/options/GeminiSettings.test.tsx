// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { GeminiSettings } from './GeminiSettings';
import { ToastProvider } from '../ui/Toast';
import {
  getGeminiSettings,
  saveGeminiSettings,
  clearGeminiSettings,
  type GeminiSettings as SavedSettings,
} from '@/src/utils/storage';
import { checkApiKey, validateApiKey, KEY_ERROR_MESSAGES } from '@/src/resume-ai/gemini';
import type { KeyValidationResult } from '@/src/resume-ai/types';

vi.mock('@/src/utils/storage', () => ({
  getGeminiSettings: vi.fn(),
  saveGeminiSettings: vi.fn(),
  clearGeminiSettings: vi.fn(),
}));
vi.mock('@/src/resume-ai/gemini', async (original) => ({
  ...(await original<typeof import('@/src/resume-ai/gemini')>()),
  checkApiKey: vi.fn(),
  validateApiKey: vi.fn(),
}));
const empty: SavedSettings = {
  apiKey: null,
  model: null,
  preference: 'auto',
  revision: null,
  verifiedAt: null,
};
const existing: SavedSettings = {
  apiKey: 'saved-key',
  model: 'gemini-3.5-flash-lite',
  preference: 'auto',
  revision: 'original',
  verifiedAt: null,
};
const renderSettings = () =>
  render(
    <ToastProvider>
      <GeminiSettings />
    </ToastProvider>,
  );
async function enterKey(value = 'new-key') {
  await screen.findByRole('button', { name: 'Save Key' });
  fireEvent.change(screen.getByLabelText('Gemini API Key'), { target: { value } });
}
async function replaceKey() {
  fireEvent.click(await screen.findByText('Replace Key'));
  fireEvent.change(screen.getByLabelText('Gemini API Key'), {
    target: { value: 'replacement-key' },
  });
  fireEvent.click(screen.getByText('Save Key'));
}
function confirmRemoval() {
  fireEvent.click(
    within(screen.getByRole('dialog', { name: 'Remove API Key?' })).getByRole('button', {
      name: 'Remove Key',
    }),
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getGeminiSettings).mockResolvedValue(empty);
  vi.mocked(clearGeminiSettings).mockResolvedValue();
  vi.mocked(checkApiKey).mockResolvedValue('valid');
  vi.mocked(validateApiKey).mockResolvedValue({ valid: true, model: 'gemini-3.5-flash-lite' });
  vi.mocked(saveGeminiSettings).mockImplementation(async (apiKey, model, preference) => ({
    apiKey,
    model,
    preference,
    revision: 'updated',
    verifiedAt: 1,
  }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Gemini explicit key setup', () => {
  it('does not send any request while typing, blurring or waiting', async () => {
    renderSettings();
    await enterKey();
    fireEvent.blur(screen.getByLabelText('Gemini API Key'));
    vi.useFakeTimers();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(checkApiKey).not.toHaveBeenCalled();
    expect(saveGeminiSettings).not.toHaveBeenCalled();
  });
  it('validates empty input locally and links the error to the input', async () => {
    renderSettings();
    await screen.findByRole('button', { name: 'Save Key' });
    fireEvent.click(screen.getByText('Save Key'));
    expect(await screen.findByText('Enter your Gemini API key.')).toBeTruthy();
    expect(screen.getByLabelText('Gemini API Key').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText('Gemini API Key').getAttribute('aria-describedby')).toContain(
      'gemini-key-error',
    );
    expect(checkApiKey).not.toHaveBeenCalled();
  });
  it('rejects extra pasted text without requesting Google', async () => {
    renderSettings();
    await enterKey('key with spaces');
    fireEvent.click(screen.getByText('Save Key'));
    expect(
      await screen.findByText('Paste the API key only, without spaces or extra text.'),
    ).toBeTruthy();
    expect(checkApiKey).not.toHaveBeenCalled();
  });
  it('checks the key and model before one atomic save, trimming pasted edges', async () => {
    renderSettings();
    await enterKey('  new-key  ');
    fireEvent.click(screen.getByText('Save Key'));
    expect(await screen.findByText('Ready')).toBeTruthy();
    expect(saveGeminiSettings).toHaveBeenCalledWith(
      'new-key',
      'gemini-3.5-flash-lite',
      'auto',
      null,
      expect.any(Function),
    );
    expect(screen.queryByLabelText('Gemini API Key')).toBeNull();
    expect(screen.getByRole('button', { name: 'Replace Key' }).id).toBe('gemini-api-key');
  });
  it.each([
    'invalid',
    'network_error',
    'timeout',
    'rate_limit',
    'permission_denied',
    'service_error',
  ] as const)('shows an actionable %s error without saving', async (failure) => {
    vi.mocked(checkApiKey).mockResolvedValue(failure);
    renderSettings();
    await enterKey();
    fireEvent.click(screen.getByText('Save Key'));
    expect((await screen.findByRole('alert')).textContent).toBe(KEY_ERROR_MESSAGES[failure]);
    expect(saveGeminiSettings).not.toHaveBeenCalled();
  });
  it('links the no-model error to Google AI Studio without changing its explanation', async () => {
    vi.mocked(validateApiKey).mockResolvedValue({
      valid: false,
      error: KEY_ERROR_MESSAGES.no_model,
      keyValidNoModel: true,
    });
    renderSettings();
    await enterKey();
    fireEvent.click(screen.getByText('Save Key'));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(KEY_ERROR_MESSAGES.no_model);
    const link = within(alert).getByRole('link', { name: 'Google AI Studio' });
    expect(link.getAttribute('href')).toBe('https://aistudio.google.com/api-keys');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(saveGeminiSettings).not.toHaveBeenCalled();
  });
  it('preserves the draft for retry after a network failure', async () => {
    vi.mocked(checkApiKey).mockResolvedValueOnce('network_error').mockResolvedValue('valid');
    renderSettings();
    await enterKey();
    fireEvent.click(screen.getByText('Save Key'));
    await screen.findByText(KEY_ERROR_MESSAGES.network_error);
    expect((screen.getByLabelText('Gemini API Key') as HTMLInputElement).value).toBe('new-key');
    fireEvent.click(screen.getByText('Save Key'));
    expect(await screen.findByText('Ready')).toBeTruthy();
  });
  it('does not report a save or lose the draft when storage fails', async () => {
    vi.mocked(saveGeminiSettings).mockRejectedValue(new Error('Quota exceeded'));
    renderSettings();
    await enterKey();
    fireEvent.click(screen.getByText('Save Key'));
    expect(await screen.findByText('Could not save AI settings. Please try again.')).toBeTruthy();
    expect(screen.queryByText('Ready')).toBeNull();
    expect((screen.getByLabelText('Gemini API Key') as HTMLInputElement).value).toBe('new-key');
  });
  it('does not label a stored unverified key Ready or probe it without user action', async () => {
    vi.mocked(getGeminiSettings).mockResolvedValue(existing);
    renderSettings();
    expect(await screen.findByText('Key saved')).toBeTruthy();
    expect(screen.queryByText('Ready')).toBeNull();
    expect(checkApiKey).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Check Key' }));
    expect(await screen.findByText('Ready')).toBeTruthy();
    expect(validateApiKey).toHaveBeenCalledWith(
      'saved-key',
      expect.any(AbortSignal),
      'gemini-3.5-flash-lite',
    );
    expect(saveGeminiSettings).toHaveBeenCalledWith(
      'saved-key',
      'gemini-3.5-flash-lite',
      'auto',
      'original',
      expect.any(Function),
    );
    expect(screen.getByText(/^Last checked:/)).toBeTruthy();
  });
  it('restores Ready and the last check after refresh without calling Gemini', async () => {
    vi.mocked(getGeminiSettings).mockResolvedValue({ ...existing, verifiedAt: Date.now() });
    const first = renderSettings();
    await screen.findByText('Ready');
    first.unmount();
    renderSettings();
    expect(await screen.findByText('Ready')).toBeTruthy();
    expect(screen.getByText(/^Last checked: Today at/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeTruthy();
    expect(checkApiKey).not.toHaveBeenCalled();
    expect(validateApiKey).not.toHaveBeenCalled();
    expect(saveGeminiSettings).not.toHaveBeenCalled();
  });
  it('does not mark a recheck Ready if another tab removes the settings before it saves', async () => {
    vi.mocked(getGeminiSettings).mockResolvedValueOnce(existing).mockResolvedValue(empty);
    vi.mocked(saveGeminiSettings).mockResolvedValue(null);
    renderSettings();
    fireEvent.click(await screen.findByRole('button', { name: 'Check Key' }));
    expect(
      await screen.findByText('AI settings changed in another tab. Review them and try again.'),
    ).toBeTruthy();
    expect(screen.queryByText('Ready')).toBeNull();
    expect(screen.queryByText(/^Last checked:/)).toBeNull();
  });
  it('shows attention after a failed recheck and can retry without replacing the key', async () => {
    vi.mocked(getGeminiSettings).mockResolvedValue({ ...existing, verifiedAt: Date.now() });
    vi.mocked(checkApiKey).mockResolvedValueOnce('network_error').mockResolvedValue('valid');
    renderSettings();
    fireEvent.click(await screen.findByRole('button', { name: 'Check again' }));
    expect(await screen.findByText('Needs attention')).toBeTruthy();
    expect(screen.getByText(KEY_ERROR_MESSAGES.network_error)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(await screen.findByText('Ready')).toBeTruthy();
    expect(saveGeminiSettings).toHaveBeenCalledTimes(1);
  });
  it('keeps the old key active and explains it after a rejected replacement', async () => {
    vi.mocked(getGeminiSettings).mockResolvedValue(existing);
    vi.mocked(checkApiKey).mockResolvedValue('invalid');
    renderSettings();
    await replaceKey();
    expect(await screen.findByText('Saved key active')).toBeTruthy();
    expect(screen.getByRole('status').className).not.toContain('amber');
    expect(screen.queryByText('Your saved key is still active.')).toBeNull();
    expect(screen.getByRole('alert').textContent).toBe(KEY_ERROR_MESSAGES.invalid);
    expect(clearGeminiSettings).not.toHaveBeenCalled();
    expect(saveGeminiSettings).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByLabelText('Gemini API Key')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Replace Key' }));
  });
  it('opens confirmation without removing the key and supports cancelling', async () => {
    vi.mocked(getGeminiSettings).mockResolvedValue(existing);
    renderSettings();
    const removeButton = await screen.findByRole('button', { name: 'Remove Key' });
    removeButton.focus();
    fireEvent.click(removeButton);
    expect(screen.getByRole('dialog', { name: 'Remove API Key?' })).toBeTruthy();
    expect(screen.getByText('AI features will be turned off.')).toBeTruthy();
    expect(clearGeminiSettings).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(clearGeminiSettings).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Remove Key' }));
  });
  it('reports removal failure inside the confirmation and retains the key', async () => {
    vi.mocked(getGeminiSettings).mockResolvedValue(existing);
    vi.mocked(clearGeminiSettings).mockRejectedValue(new Error('Removal failed'));
    renderSettings();
    fireEvent.click(await screen.findByText('Remove Key'));
    confirmRemoval();
    expect(await screen.findByText('Could not remove the API key. Please try again.')).toBeTruthy();
    expect(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove Key' }),
    ).toBeTruthy();
  });
  it('returns to the empty key input after successful removal', async () => {
    vi.mocked(getGeminiSettings).mockResolvedValueOnce(existing).mockResolvedValue(empty);
    renderSettings();
    fireEvent.click(await screen.findByText('Remove Key'));
    confirmRemoval();
    expect(await screen.findByRole('button', { name: 'Save Key' })).toBeTruthy();
    expect(screen.queryByText('Not configured')).toBeNull();
    expect((screen.getByLabelText('Gemini API Key') as HTMLInputElement).value).toBe('');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByLabelText('Gemini API Key'));
  });
  it('does not save a pending model result after the edit is cancelled', async () => {
    vi.mocked(getGeminiSettings).mockResolvedValue(existing);
    let finish!: (v: KeyValidationResult) => void;
    vi.mocked(validateApiKey).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    renderSettings();
    await replaceKey();
    await waitFor(() => expect(validateApiKey).toHaveBeenCalled());
    fireEvent.click(screen.getByText('Cancel'));
    await act(async () => {
      finish({ valid: true, model: 'gemini-3.8-flash' });
    });
    expect(saveGeminiSettings).not.toHaveBeenCalled();
  });
  it('cancels an in-flight check when Settings unmounts', async () => {
    let finish!: (v: 'valid') => void;
    vi.mocked(checkApiKey).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = renderSettings();
    await enterKey();
    fireEvent.click(screen.getByText('Save Key'));
    await waitFor(() => expect(checkApiKey).toHaveBeenCalled());
    view.unmount();
    await act(async () => {
      finish('valid');
    });
    expect(vi.mocked(checkApiKey).mock.calls[0][1]?.aborted).toBe(true);
    expect(saveGeminiSettings).not.toHaveBeenCalled();
    expect(validateApiKey).not.toHaveBeenCalled();
  });
  it('checks and saves a manual model choice with the existing key', async () => {
    vi.mocked(getGeminiSettings).mockResolvedValue(existing);
    vi.mocked(validateApiKey).mockResolvedValue({ valid: true, model: 'gemini-3.8-flash' });
    renderSettings();
    await screen.findByText('Replace Key');
    fireEvent.click(screen.getByText('Model options'));
    fireEvent.change(screen.getByLabelText('AI Model'), { target: { value: 'gemini-3.8-flash' } });
    expect(await screen.findByText('Ready')).toBeTruthy();
    expect(saveGeminiSettings).toHaveBeenCalledWith(
      'saved-key',
      'gemini-3.8-flash',
      'gemini-3.8-flash',
      'original',
      expect.any(Function),
    );
  });
  it('does not overwrite settings after another tab removes the key', async () => {
    vi.mocked(saveGeminiSettings).mockResolvedValue(null);
    renderSettings();
    await enterKey();
    fireEvent.click(screen.getByText('Save Key'));
    expect(
      await screen.findByText('AI settings changed in another tab. Review them and try again.'),
    ).toBeTruthy();
    expect(screen.queryByText('Ready')).toBeNull();
  });
});

it('shows Unavailable and allows retry when local settings cannot be loaded', async () => {
  vi.mocked(getGeminiSettings)
    .mockRejectedValueOnce(new Error('Storage unavailable'))
    .mockResolvedValue(empty);
  renderSettings();
  expect(await screen.findByText('Unavailable')).toBeTruthy();
  expect((screen.getByLabelText('Gemini API Key') as HTMLInputElement).disabled).toBe(true);
  fireEvent.click(screen.getByText('Try Again'));
  expect(await screen.findByRole('button', { name: 'Save Key' })).toBeTruthy();
  expect(checkApiKey).not.toHaveBeenCalled();
});
