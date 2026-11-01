import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerQuickFill } from './background';
import type { AutofillCoordinator } from '@/src/autofill/runCoordinator';

vi.mock('@/src/utils/sessionStorage', () => ({ sessionSet: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/src/quick-fill/preferences', () => ({
  updateQuickFillPreferences: vi.fn().mockResolvedValue(undefined),
}));
import { sessionSet } from '@/src/utils/sessionStorage';

function harness() {
  const messages: Array<(m: unknown, s: unknown, respond: (r: unknown) => void) => unknown> = [];
  const commands: Array<(command: string, tab?: unknown) => void> = [];
  const coordinator = {
    start: vi.fn().mockResolvedValue({ stage: 'completed' }),
    status: vi.fn().mockResolvedValue(null),
    confirm: vi.fn(),
    cancel: vi.fn().mockResolvedValue(undefined),
  };
  const api = {
    runtime: {
      id: 'jb',
      onMessage: { addListener: (fn: (typeof messages)[number]) => messages.push(fn) },
      openOptionsPage: vi.fn().mockResolvedValue(undefined),
    },
    tabs: {
      query: vi.fn().mockResolvedValue([{ id: 12, url: 'https://jobs.test/apply' }]),
      sendMessage: vi.fn().mockResolvedValue(true),
    },
    commands: { onCommand: { addListener: (fn: (typeof commands)[number]) => commands.push(fn) } },
    scripting: { executeScript: vi.fn().mockResolvedValue([]) },
    storage: { onChanged: { addListener: vi.fn() } },
    action: { openPopup: vi.fn().mockResolvedValue(undefined) },
  };
  vi.stubGlobal('chrome', api);
  registerQuickFill(coordinator as unknown as AutofillCoordinator);
  return { api, coordinator, message: messages[0], command: commands[0] };
}
beforeEach(() => vi.clearAllMocks());
describe('quick fill background entry points', () => {
  it('registers the keyboard command and uses the same coordinator with empty-only mode', async () => {
    const h = harness();
    h.command('quick-fill');
    await vi.waitFor(() => expect(h.coordinator.start).toHaveBeenCalledWith(12, true));
    expect(h.api.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 12 },
      files: ['content-scripts/content.js'],
    });
    expect(h.api.tabs.sendMessage).toHaveBeenCalledWith(
      12,
      { action: 'JB_QUICK_REVEAL' },
      { frameId: 0 },
    );
  });
  it('keeps restricted-page commands in the normal popup and does not try to fill', async () => {
    const h = harness();
    h.command('quick-fill', { id: 12, url: 'chrome://extensions' });
    await vi.waitFor(() => expect(h.api.action.openPopup).toHaveBeenCalledOnce());
    expect(h.coordinator.start).not.toHaveBeenCalled();
  });
  it('ignores a supplied target tab and pins the click to its sender document', async () => {
    const h = harness();
    const respond = vi.fn();
    h.message(
      { action: 'JB_QUICK_START', tabId: 999, mode: 'overwrite' },
      { id: 'jb', frameId: 0, url: 'https://jobs.test', tab: { id: 12 }, documentId: 'source' },
      respond,
    );
    await vi.waitFor(() => expect(respond).toHaveBeenCalled());
    expect(h.coordinator.start).toHaveBeenCalledWith(12, true, 'source');
  });
  it('routes missing Gemini setup to the key input', async () => {
    const h = harness();
    h.coordinator.start.mockResolvedValue({ stage: 'error', error: 'ai_setup_required' } as never);
    h.command('quick-fill');
    await vi.waitFor(() => expect(h.api.runtime.openOptionsPage).toHaveBeenCalledOnce());
    expect(sessionSet).toHaveBeenCalledWith({ 'jb:focusOnLoad': 'gemini-api-key' });
  });
});
