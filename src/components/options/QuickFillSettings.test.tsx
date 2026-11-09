// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QuickFillSettings } from './QuickFillSettings';
import {
  getQuickFillPreferences,
  updateQuickFillPreferences,
  type QuickFillPreferences,
} from '@/src/quick-fill/preferences';
const toast = vi.hoisted(() => vi.fn());
vi.mock('@/src/components/ui/useToast', () => ({ useToast: () => ({ showToast: toast }) }));
vi.mock('@/src/quick-fill/preferences', () => ({
  QUICK_FILL_KEY: 'quickFillPreferences',
  getQuickFillPreferences: vi.fn(),
  updateQuickFillPreferences: vi.fn(),
  normalizePreferences: (value: unknown) => value,
}));
let preferences: QuickFillPreferences;
beforeEach(() => {
  vi.clearAllMocks();
  preferences = { enabled: true, fillMode: 'merge', disabledSites: [] };
  vi.stubGlobal('chrome', {
    storage: { onChanged: { addListener: vi.fn(), removeListener: vi.fn() } },
  });
  vi.mocked(getQuickFillPreferences).mockImplementation(async () => structuredClone(preferences));
  vi.mocked(updateQuickFillPreferences).mockImplementation(async (change) => {
    preferences = {
      ...preferences,
      ...(typeof change === 'function' ? change(preferences) : change),
    };
  });
});
afterEach(cleanup);
it('keeps load failures inside Quick Fill and lets the user retry', async () => {
  vi.mocked(getQuickFillPreferences).mockRejectedValueOnce(new Error('read failed'));
  render(<QuickFillSettings />);
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent', 'Could not load quick fill settings.Retry',
  );
  expect(toast).not.toHaveBeenCalled();
  expect((screen.getByRole('button', { name: 'On' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  await waitFor(() => expect((screen.getByRole('button', { name: 'On' }) as HTMLButtonElement).disabled).toBe(false));
});

it('reports each failed explicit change even when its message repeats', async () => {
  vi.mocked(updateQuickFillPreferences).mockRejectedValue(new Error('write failed'));
  render(<QuickFillSettings />);
  const off = await screen.findByRole('button', { name: 'Off' });
  await waitFor(() => expect((off as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(off);
  await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
  await waitFor(() => expect((off as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(off);
  await waitFor(() => expect(toast).toHaveBeenCalledTimes(2));
});

it('saves On/Off immediately and restores the saved state after a failed write', async () => {
  render(<QuickFillSettings />);
  const on = await screen.findByRole('button', { name: 'On' });
  await waitFor(() => expect(on.getAttribute('aria-pressed')).toBe('true'));
  const off = screen.getByRole('button', { name: 'Off' });
  fireEvent.click(off);
  expect(off.getAttribute('aria-pressed')).toBe('true');
  await waitFor(() => expect(preferences.enabled).toBe(false));
  await waitFor(() => expect((on as HTMLButtonElement).disabled).toBe(false));
  vi.mocked(updateQuickFillPreferences).mockRejectedValueOnce(new Error('write failed'));
  fireEvent.click(on);
  await waitFor(() =>
    expect(toast).toHaveBeenCalledWith('error', 'Could not save quick fill settings. Try again.'),
  );
  expect(off.getAttribute('aria-pressed')).toBe('true');
});
it('saves fill behavior, restores it on remount, and keeps it when turning the button off', async () => {
  const view = render(<QuickFillSettings />);
  const select = await screen.findByRole('combobox', { name: 'Fields to fill' });
  await waitFor(() => expect((select as HTMLSelectElement).disabled).toBe(false));
  expect((select as HTMLSelectElement).value).toBe('merge');
  fireEvent.change(select, { target: { value: 'overwrite' } });
  await waitFor(() => expect(preferences.fillMode).toBe('overwrite'));
  await waitFor(() => expect((select as HTMLSelectElement).disabled).toBe(false));
  view.unmount();
  render(<QuickFillSettings />);
  await waitFor(() =>
    expect(
      (screen.getByRole('combobox', { name: 'Fields to fill' }) as HTMLSelectElement).value,
    ).toBe('overwrite'),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Off' }));
  await waitFor(() => expect(preferences.enabled).toBe(false));
  expect(preferences.fillMode).toBe('overwrite');
  expect(
    (screen.getByRole('combobox', { name: 'Fields to fill' }) as HTMLSelectElement).disabled,
  ).toBe(true);
});
it('shows five hidden sites per page, searches all sites, and restores only the chosen site', async () => {
  preferences.disabledSites = Array.from(
    { length: 13 },
    (_, index) => `site${String(index).padStart(2, '0')}.example`,
  );
  render(<QuickFillSettings />);
  fireEvent.click(await screen.findByText('Hidden sites (13)'));
  expect(screen.getAllByRole('listitem')).toHaveLength(5);
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  expect(screen.getByText('6–10 of 13 sites')).toBeTruthy();
  const search = screen.getByRole('searchbox', { name: 'Search hidden sites' });
  fireEvent.change(search, { target: { value: 'SITE12' } });
  expect(screen.getAllByRole('listitem')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Show button on site12.example' }));
  await screen.findByText('No sites match your search.');
  await waitFor(() => expect(preferences.disabledSites).toHaveLength(12));
  expect(preferences.disabledSites).not.toContain('site12.example');
  expect(preferences.disabledSites).toContain('site11.example');
  fireEvent.change(search, { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  expect(screen.getByText('11–12 of 12 sites')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Show button on site11.example' }));
  await waitFor(() => expect(preferences.disabledSites).toHaveLength(11));
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Show button on site10.example' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Show button on site10.example' }));
  await screen.findByText('6–10 of 10 sites');
  expect(screen.getAllByRole('listitem')).toHaveLength(5);
});
