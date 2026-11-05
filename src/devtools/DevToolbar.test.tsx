// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import DevToolbar from './DevToolbar';
import SimulationShell from './SimulationShell';
import { DevSimulation } from './simulation';
import { scenarioById } from './scenarios';
import { getSimulation } from './bootstrap';
import { createDevSurface } from './surface';
import { getGeminiSettings, getProfile } from '@/src/utils/storage';
import { createPreviewChrome } from '@/src/preview/chrome';

vi.mock('./bootstrap', () => ({ getSimulation: vi.fn() }));
const onNavigate = vi.fn<(url: string) => Promise<void>>().mockResolvedValue();
const renderToolbar = () =>
  render(<DevToolbar surface={createDevSurface()} onNavigate={onNavigate} />);
let simulation: DevSimulation | undefined;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('DEV', true);
  vi.stubGlobal('__JB_DEV_CONTEXT__', undefined);
  vi.stubGlobal('chrome', createPreviewChrome({ id: 'original-profile' }));
  vi.mocked(getSimulation).mockReturnValue(undefined);
  sessionStorage.clear();
  history.replaceState(null, '', '/options.html');
});
afterEach(() => {
  cleanup();
  simulation?.dispose();
  simulation = undefined;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it('enters an isolated missing-key preview without touching saved profile data', async () => {
  renderToolbar();
  await waitFor(() =>
    expect(screen.getByRole('switch', { name: 'Missing API key' }).hasAttribute('disabled')).toBe(
      false,
    ),
  );
  fireEvent.click(screen.getByRole('switch', { name: 'Missing API key' }));
  await waitFor(() => expect(onNavigate).toHaveBeenCalledOnce());
  const url = new URL(vi.mocked(onNavigate).mock.calls[0][0]);
  expect(url.searchParams.get('devPreview')).toBe('saved');
  expect(url.searchParams.get('devNoKey')).toBe('1');
  expect((await getProfile())?.id).toBe('original-profile');
});

it('rejects direct credential changes on the saved-data surface', async () => {
  await expect(createDevSurface().toggleKey()).rejects.toThrow('Temporary data is required');
  expect((await getProfile())?.id).toBe('original-profile');
});

it('toggles the simulated key while keeping profile edits and the selected model', async () => {
  simulation = new DevSimulation(scenarioById('profile-complete')!, 'extension', '1.0');
  vi.stubGlobal('chrome', simulation.chrome);
  vi.stubGlobal('__JB_DEV_CONTEXT__', {
    scenario: 'profile-complete',
    quickPreview: 'complete',
    id: 'preview',
    extensionId: 'extension',
    version: '1.0',
  });
  vi.mocked(getSimulation).mockReturnValue(simulation);
  history.replaceState(null, '', '?devPreview=complete');
  const profile = (await getProfile())!;
  const edited = { ...profile, personal: { ...profile.personal, firstName: 'Preview edit' } };
  await new Promise<void>((resolve) => chrome.storage.local.set({ profile: edited }, resolve));
  const before = await getGeminiSettings();
  renderToolbar();
  const toggle = screen.getByRole('switch', { name: 'Missing API key' });
  await waitFor(() => expect(toggle.hasAttribute('disabled')).toBe(false));
  fireEvent.click(toggle);
  await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('true'));
  expect((await getGeminiSettings()).apiKey).toBeNull();
  expect(location.search).toContain('devNoKey=1');
  await act(async () => {
    fireEvent.click(toggle);
  });
  await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('false'));
  expect(await getGeminiSettings()).toMatchObject({ apiKey: before.apiKey, model: before.model });
  expect((await getProfile())?.personal.firstName).toBe('Preview edit');
  expect(location.search).not.toContain('devNoKey');
  expect(onNavigate).not.toHaveBeenCalled();
});

it('keeps the current page and reports snapshot failures without navigating', async () => {
  sessionStorage.setItem('jb:ui:section', 'education');
  renderToolbar();
  const store = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
    throw new Error('quota');
  });
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Required only' }).hasAttribute('disabled')).toBe(
      false,
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Required only' }));
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'Could not switch test data. Try again.',
  );
  expect(onNavigate).not.toHaveBeenCalled();
  expect(sessionStorage.getItem('jb:ui:section')).toBe('education');
  store.mockRestore();
});

it('never renders the development bar in production', () => {
  vi.stubEnv('DEV', false);
  render(
    <SimulationShell>
      <p>Production page</p>
    </SimulationShell>,
  );
  expect(screen.getByText('Production page')).toBeTruthy();
  expect(screen.queryByRole('complementary', { name: 'Development controls' })).toBeNull();
});
