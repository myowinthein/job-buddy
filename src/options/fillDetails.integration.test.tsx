// @vitest-environment jsdom
import { StrictMode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '@/entrypoints/options/App';
import { ToastProvider } from '@/src/components/ui/Toast';
import { createPreviewChrome } from '@/src/preview/chrome';
import { DEV_PROFILE } from '@/src/utils/devProfile';
import { openFillLog } from '@/src/fill-log/client';
import { requestFillDetails } from '@/src/fill-log/navigation';
import { retainFrameFillLog } from '@/src/fill-log/retention';

vi.mock('@/src/resume-ai/extractLinks', () => ({ extractLinks: vi.fn().mockResolvedValue([]) }));
vi.mock('@/src/resume-ai/gemini', () => ({
  extractFromResume: vi.fn(),
  validateApiKey: vi.fn(),
  checkApiKey: vi.fn(),
}));
const tabs = { get: vi.fn(), sendMessage: vi.fn(), update: vi.fn(), create: vi.fn() };
const mount = () =>
  render(
    <StrictMode>
      <ToastProvider>
        <App />
      </ToastProvider>
    </StrictMode>,
  );
beforeEach(() => {
  sessionStorage.clear();
  history.replaceState(null, '', '/');
  document.title = 'Job Buddy: Profile';
  vi.stubEnv('DEV', false);
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => setTimeout(() => fn(0), 0));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
  tabs.get.mockResolvedValue({});
  tabs.sendMessage.mockImplementation(async (tabId: number) => ({
    version: 1,
    runId: `run-${tabId}`,
    startedAt: 1,
    completedAt: 2,
    origin: `https://form${tabId}.test`,
    status: 'completed',
    aiStatus: 'not_needed',
    fields: [
      {
        id: 'first',
        label: 'First name',
        kind: 'text',
        outcome: 'high_confidence',
        source: 'rules',
        rule: { outcome: 'filled' },
        ai: { outcome: 'not_sent' },
      },
    ],
  }));
  const preview = createPreviewChrome(DEV_PROFILE);
  Object.assign(preview.runtime, {
    openOptionsPage: vi.fn().mockResolvedValue(undefined),
    id: 'jb',
  });
  vi.stubGlobal('chrome', {
    ...preview,
    tabs,
    webNavigation: { getAllFrames: vi.fn().mockResolvedValue([{ frameId: 0 }]) },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  history.replaceState(null, '', '/');
});

it('embeds a wide, empty details section in Tools with the shared profile progress bar', async () => {
  mount();
  await screen.findByLabelText('First Name*');
  expect(screen.getByRole('progressbar', { name: 'Saved required profile details' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Fill Details' }));
  expect(await screen.findByRole('heading', { name: 'Fill Details' })).toBeTruthy();
  expect(await screen.findByText('No fill details yet')).toBeTruthy();
  expect(
    screen.getAllByRole('progressbar', { name: 'Saved required profile details' }),
  ).toHaveLength(1);
  expect(document.querySelector('[data-profile-section="fillDetails"]')?.className).toContain(
    'max-w-6xl',
  );
  expect(document.querySelectorAll('main')).toHaveLength(1);
  expect(document.querySelector('[aria-label="Fill Details"] img')).toBeNull();
  expect(tabs.get).not.toHaveBeenCalled();
});
it('routes repeated requests to the exact source, resets old results and remembers the source across reload', async () => {
  mount();
  await screen.findByLabelText('First Name*');
  await act(async () => openFillLog(10));
  await screen.findByRole('link', { name: /form10\.test/ });
  await act(async () => openFillLog(20));
  await screen.findByRole('link', { name: /form20\.test/ });
  expect(screen.queryByRole('link', { name: /form10\.test/ })).toBeNull();
  await act(async () => {
    await Promise.all([openFillLog(25), openFillLog(30)]);
  });
  await screen.findByRole('link', { name: /form30\.test/ });
  cleanup();
  mount();
  await screen.findByRole('link', { name: /form30\.test/ });
  expect(document.title).toBe('Job Buddy: Fill Details');
  expect(tabs.create).not.toHaveBeenCalled();
  expect(
    tabs.sendMessage.mock.calls.every(([, message]) => message.action === 'GET_FILL_LOG'),
  ).toBe(true);
});
it('preserves a dirty profile when navigation is declined and asks once per request', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  mount();
  const first = await screen.findByLabelText('First Name*');
  fireEvent.change(first, { target: { value: 'Unsaved draft' } });
  await act(async () => openFillLog(10));
  await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
  expect((screen.getByLabelText('First Name*') as HTMLInputElement).value).toBe('Unsaved draft');
  expect(screen.queryByRole('heading', { name: 'Fill Details' })).toBeNull();
  expect(
    tabs.sendMessage.mock.calls.every(([, message]) => message.action === 'GET_FILL_LOG'),
  ).toBe(true);
  confirm.mockReturnValue(true);
  await act(async () => openFillLog(20));
  await screen.findByRole('link', { name: /form20\.test/ });
  expect(confirm).toHaveBeenCalledTimes(2);
});
it('honors a deep link once, then keeps later navigation and sources on reload', async () => {
  history.replaceState(null, '', '?section=fillDetails&tabId=10');
  mount();
  await screen.findByRole('link', { name: /form10\.test/ });
  expect(location.search).toBe('');
  await act(async () => openFillLog(20));
  await screen.findByRole('link', { name: /form20\.test/ });
  fireEvent.click(screen.getByRole('button', { name: 'Personal' }));
  await screen.findByLabelText('First Name*');
  cleanup();
  mount();
  await screen.findByLabelText('First Name*');
  fireEvent.click(screen.getByRole('button', { name: 'Fill Details' }));
  await screen.findByRole('link', { name: /form20\.test/ });
});
it('shows a closed source without silently loading another tab', async () => {
  tabs.get.mockRejectedValue(new Error('Closed source'));
  mount();
  await screen.findByLabelText('First Name*');
  await act(async () => requestFillDetails(10));
  await screen.findByText('The source form is unavailable. Its tab may have closed.');
  expect(tabs.get).toHaveBeenCalledWith(10);
  expect(tabs.sendMessage).not.toHaveBeenCalled();
});

it('populates the open empty Tools section from a completed fill without a View details request', async () => {
  mount();
  await screen.findByLabelText('First Name*');
  fireEvent.click(screen.getByRole('button', { name: 'Fill Details' }));
  await screen.findByText('No fill details yet');
  const log = await tabs.sendMessage(10);
  await act(async () =>
    retainFrameFillLog(
      { id: 'jb', tab: { id: 10 } as chrome.tabs.Tab, frameId: 0 },
      log,
      DEV_PROFILE.id,
    ),
  );
  await screen.findByRole('button', { name: 'Detected (1)' });
  expect(chrome.runtime.openOptionsPage).not.toHaveBeenCalled();
});
