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
  await screen.findByRole('button', { name: 'Check Key' });
  fireEvent.change(screen.getByLabelText('Gemini API Key'), { target: { value } });
}
async function checkDraft() {
  fireEvent.click(screen.getByRole('button', { name: 'Check Key' }));
  await screen.findByRole('button', { name: 'Save Key' });
}
async function replaceKey() {
  fireEvent.click(await screen.findByText('Replace Key'));
  fireEvent.change(screen.getByLabelText('Gemini API Key'), {
    target: { value: 'replacement-key' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Check Key' }));
}
function confirmRemoval() {
  fireEvent.click(
    within(screen.getByRole('dialog', { name: 'Remove API Key' })).getByRole('button', {
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

describe('Gemini Check Key → Save Key', () => {
  it('shows no empty-state indicator and sends no request while typing, blurring or waiting', async () => {
    renderSettings();
    await enterKey();
    expect(screen.queryByText('Not configured')).toBeNull();
    fireEvent.blur(screen.getByLabelText('Gemini API Key'));
    vi.useFakeTimers();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(checkApiKey).not.toHaveBeenCalled();
    expect(saveGeminiSettings).not.toHaveBeenCalled();
  });
  it('validates empty input locally and associates the error with the field', async () => {
    renderSettings();
    fireEvent.click(await screen.findByRole('button', { name: 'Check Key' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Check Key' }));
    expect(
      await screen.findByText('Paste the API key only, without spaces or extra text.'),
    ).toBeTruthy();
    expect(checkApiKey).not.toHaveBeenCalled();
  });
  it('checks without saving, then saves the checked snapshot without another API call', async () => {
    renderSettings();
    await enterKey('  new-key  ');
    await checkDraft();
    expect(screen.getByText('Ready')).toBeTruthy();
    expect(saveGeminiSettings).not.toHaveBeenCalled();
    const keyChecks = vi.mocked(checkApiKey).mock.calls.length;
    const modelChecks = vi.mocked(validateApiKey).mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Save Key' }));
    await screen.findByText('Replace Key');
    expect(saveGeminiSettings).toHaveBeenCalledWith(
      'new-key',
      'gemini-3.5-flash-lite',
      'auto',
      null,
      expect.any(Function),
    );
    expect(checkApiKey).toHaveBeenCalledTimes(keyChecks);
    expect(validateApiKey).toHaveBeenCalledTimes(modelChecks);
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
  ] as const)('reports %s without offering to save an unchecked key', async (failure) => {
    vi.mocked(checkApiKey).mockResolvedValue(failure);
    renderSettings();
    await enterKey();
    fireEvent.click(screen.getByRole('button', { name: 'Check Key' }));
    expect(await screen.findByText(KEY_ERROR_MESSAGES[failure])).toBeTruthy();
    expect(saveGeminiSettings).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Save Key' })).toBeNull();
  });
  it('preserves the draft for retry after a network failure', async () => {
    vi.mocked(checkApiKey).mockResolvedValueOnce('network_error').mockResolvedValue('valid');
    renderSettings();
    await enterKey();
    fireEvent.click(screen.getByRole('button', { name: 'Check Key' }));
    await screen.findByText(KEY_ERROR_MESSAGES.network_error);
    expect((screen.getByLabelText('Gemini API Key') as HTMLInputElement).value).toBe('new-key');
    await checkDraft();
    expect(screen.getByText('Ready')).toBeTruthy();
    expect(saveGeminiSettings).not.toHaveBeenCalled();
  });
  it('keeps a checked draft for a storage retry without running validation again', async () => {
    vi.mocked(saveGeminiSettings)
      .mockRejectedValueOnce(new Error('Quota exceeded'))
      .mockResolvedValueOnce({ ...existing, verifiedAt: 1 });
    renderSettings();
    await enterKey();
    await checkDraft();
    fireEvent.click(screen.getByRole('button', { name: 'Save Key' }));
    expect(await screen.findByText('Could not save AI settings. Please try again.')).toBeTruthy();
    expect((screen.getByLabelText('Gemini API Key') as HTMLInputElement).value).toBe('new-key');
    fireEvent.click(screen.getByRole('button', { name: 'Save Key' }));
    await screen.findByText('Replace Key');
    expect(checkApiKey).toHaveBeenCalledTimes(1);
    expect(validateApiKey).toHaveBeenCalledTimes(1);
  });
  it('invalidates a checked key immediately when its contents change', async () => {
    renderSettings();
    await enterKey();
    await checkDraft();
    fireEvent.change(screen.getByLabelText('Gemini API Key'), {
      target: { value: 'different-key' },
    });
    expect(screen.queryByText('Ready')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save Key' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Check Key' })).toBeTruthy();
    expect(saveGeminiSettings).not.toHaveBeenCalled();
  });
  it('does not call an unverified legacy key Ready and persists its successful check', async () => {
    vi.mocked(getGeminiSettings).mockResolvedValue(existing);
    renderSettings();
    await screen.findByText('Not checked');
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
  });
  it('restores Ready from saved verification after a fresh mount without background API calls', async () => {
    vi.mocked(getGeminiSettings).mockResolvedValue({ ...existing, verifiedAt: 1 });
    const first = renderSettings();
    await screen.findByText('Ready');
    first.unmount();
    renderSettings();
    expect(await screen.findByText('Ready')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Check Key' })).toBeNull();
    expect(checkApiKey).not.toHaveBeenCalled();
    expect(validateApiKey).not.toHaveBeenCalled();
    expect(screen.getByRole('status').getAttribute('title')).toContain('Last checked');
  });
  it('preserves the old credential after a rejected replacement without redundant warning copy', async () => {
    vi.mocked(getGeminiSettings).mockResolvedValue(existing);
    vi.mocked(checkApiKey).mockResolvedValue('invalid');
    renderSettings();
    await replaceKey();
    expect(await screen.findByText(KEY_ERROR_MESSAGES.invalid)).toBeTruthy();
    expect(screen.queryByText('Your saved key is still active.')).toBeNull();
    expect(clearGeminiSettings).not.toHaveBeenCalled();
    expect(saveGeminiSettings).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByLabelText('Gemini API Key')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Replace Key' }));
  });
  it('requires confirmation and supports cancelling removal without deleting anything', async () => {
    vi.mocked(getGeminiSettings).mockResolvedValue(existing);
    renderSettings();
    fireEvent.click(await screen.findByText('Remove Key'));
    expect(await screen.findByRole('dialog', { name: 'Remove API Key' })).toBeTruthy();
    expect(clearGeminiSettings).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog')).getByText('Cancel'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(clearGeminiSettings).not.toHaveBeenCalled();
  });
  it('reports removal failure inside the confirmation dialog and retains the key', async () => {
    vi.mocked(getGeminiSettings).mockResolvedValue(existing);
    vi.mocked(clearGeminiSettings).mockRejectedValue(new Error('Removal failed'));
    renderSettings();
    fireEvent.click(await screen.findByText('Remove Key'));
    confirmRemoval();
    expect(await screen.findByText('Could not remove the API key. Please try again.')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Remove API Key' })).toBeTruthy();
  });
  it('returns to the empty input without an empty-state label after confirmed removal', async () => {
    vi.mocked(getGeminiSettings).mockResolvedValueOnce(existing).mockResolvedValue(empty);
    renderSettings();
    fireEvent.click(await screen.findByText('Remove Key'));
    confirmRemoval();
    await screen.findByRole('button', { name: 'Check Key' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((screen.getByLabelText('Gemini API Key') as HTMLInputElement).value).toBe('');
    expect(screen.queryByText('Not configured')).toBeNull();
    expect(document.activeElement).toBe(screen.getByLabelText('Gemini API Key'));
  });
  it('discards a pending check when replacement is cancelled', async () => {
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
    expect(screen.queryByRole('button', { name: 'Save Key' })).toBeNull();
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
    fireEvent.click(screen.getByRole('button', { name: 'Check Key' }));
    await waitFor(() => expect(checkApiKey).toHaveBeenCalled());
    view.unmount();
    await act(async () => {
      finish('valid');
    });
    expect(vi.mocked(checkApiKey).mock.calls[0][1]?.aborted).toBe(true);
    expect(saveGeminiSettings).not.toHaveBeenCalled();
    expect(validateApiKey).not.toHaveBeenCalled();
  });
  it('does not show the saved key status beside a replacement check interrupted by reset', async () => {
    vi.mocked(getGeminiSettings).mockResolvedValue({ ...existing, verifiedAt: 1 });
    let finish!: (v: KeyValidationResult) => void;
    vi.mocked(validateApiKey).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = renderSettings();
    await replaceKey();
    await waitFor(() => expect(validateApiKey).toHaveBeenCalled());
    view.rerender(
      <ToastProvider>
        <GeminiSettings resetInProgress />
      </ToastProvider>,
    );
    await act(async () => {
      finish({ valid: true, model: 'gemini-3.8-flash' });
    });
    view.rerender(
      <ToastProvider>
        <GeminiSettings />
      </ToastProvider>,
    );
    expect(screen.queryByText('Ready')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save Key' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Check Key' })).toBeTruthy();
    expect(saveGeminiSettings).not.toHaveBeenCalled();
  });
  it('checks and saves a model switch from the visible selector', async () => {
    vi.mocked(getGeminiSettings).mockResolvedValue(existing);
    vi.mocked(validateApiKey).mockResolvedValue({ valid: true, model: 'gemini-3.8-flash' });
    renderSettings();
    await screen.findByText('Replace Key');
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
  it('requires a fresh check if the model changes for a checked replacement', async () => {
    vi.mocked(getGeminiSettings).mockResolvedValue(existing);
    renderSettings();
    await replaceKey();
    await screen.findByRole('button', { name: 'Save Key' });
    fireEvent.change(screen.getByLabelText('AI Model'), { target: { value: 'gemini-3.8-flash' } });
    expect(screen.queryByRole('button', { name: 'Save Key' })).toBeNull();
    expect(screen.queryByText('Ready')).toBeNull();
    expect(saveGeminiSettings).not.toHaveBeenCalled();
  });
  it('does not overwrite settings after another tab removes the key between check and save', async () => {
    vi.mocked(saveGeminiSettings).mockResolvedValue(null);
    renderSettings();
    await enterKey();
    await checkDraft();
    fireEvent.click(screen.getByRole('button', { name: 'Save Key' }));
    expect(
      await screen.findByText('AI settings changed in another tab. Review them and try again.'),
    ).toBeTruthy();
    expect(screen.queryByText('Ready')).toBeNull();
  });
});

it('shows Unavailable and allows retry after local settings cannot be loaded', async () => {
  vi.mocked(getGeminiSettings)
    .mockRejectedValueOnce(new Error('Storage unavailable'))
    .mockResolvedValue(empty);
  renderSettings();
  expect(await screen.findByText('Unavailable')).toBeTruthy();
  expect((screen.getByLabelText('Gemini API Key') as HTMLInputElement).disabled).toBe(true);
  fireEvent.click(screen.getByText('Try Again'));
  expect(await screen.findByRole('button', { name: 'Check Key' })).toBeTruthy();
  expect(checkApiKey).not.toHaveBeenCalled();
});
