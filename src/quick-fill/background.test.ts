import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerQuickFill } from './background';
import type { AutofillCoordinator } from '@/src/autofill/runCoordinator';

vi.mock('@/src/utils/sessionStorage', () => ({ sessionSet: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/src/quick-fill/preferences', () => ({
  getQuickFillPreferences: vi.fn().mockResolvedValue({ fillMode: 'merge' }),
  updateQuickFillPreferences: vi.fn().mockResolvedValue(undefined),
}));
import { getQuickFillPreferences } from './preferences';
import { sessionSet } from '@/src/utils/sessionStorage';

function harness() {
  const messages: Array<(m: unknown, s: unknown, respond: (r: unknown) => void) => unknown> = [];
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
      sendMessage: vi.fn().mockResolvedValue(true),
    },
    storage: { onChanged: { addListener: vi.fn() } },
  };
  vi.stubGlobal('chrome', api);
  registerQuickFill(coordinator as unknown as AutofillCoordinator);
  return { api, coordinator, message: messages[0] };
}
beforeEach(() => vi.clearAllMocks());
describe('quick fill background entry points', () => {
  it('ignores a supplied target tab and pins the click to its sender document', async () => {
    const h = harness();
    const respond = vi.fn();
    h.message(
      { action: 'JB_QUICK_START', tabId: 999, mode: 'overwrite' },
      { id: 'jb', frameId: 0, url: 'https://jobs.test', tab: { id: 12 }, documentId: 'source' },
      respond,
    );
    await vi.waitFor(() => expect(respond).toHaveBeenCalled());
    expect(h.coordinator.start).toHaveBeenCalledWith(12, 'merge', 'source');
  });
  it.each(['merge', 'overwrite'] as const)(
    'uses saved %s mode for a new fill and a pending popup choice',
    async (mode) => {
      vi.mocked(getQuickFillPreferences).mockResolvedValueOnce({
        enabled: true,
        disabledSites: [],
        fillMode: mode,
      });
      const h = harness();
      const sender = {
        id: 'jb',
        frameId: 0,
        url: 'https://jobs.test',
        tab: { id: 12 },
        documentId: 'source',
      };
      const respond = vi.fn();
      h.message(
        { action: 'JB_QUICK_START', mode: mode === 'merge' ? 'overwrite' : 'merge' },
        sender,
        respond,
      );
      await vi.waitFor(() => expect(respond).toHaveBeenCalled());
      expect(h.coordinator.start).toHaveBeenCalledWith(12, mode, 'source');
      h.coordinator.status.mockResolvedValueOnce({
        stage: 'confirming',
        runId: 'pending',
      } as never);
      vi.mocked(getQuickFillPreferences).mockResolvedValueOnce({
        enabled: true,
        disabledSites: [],
        fillMode: mode,
      });
      respond.mockClear();
      h.message({ action: 'JB_QUICK_START' }, sender, respond);
      await vi.waitFor(() => expect(respond).toHaveBeenCalled());
      expect(h.coordinator.confirm).toHaveBeenCalledWith(12, 'pending', mode);
      expect(h.coordinator.start).toHaveBeenCalledTimes(1);
    },
  );
  it('does not start a fill when its saved mode cannot be read', async () => {
    const h = harness();
    vi.mocked(getQuickFillPreferences).mockRejectedValueOnce(new Error('storage unavailable'));
    const respond = vi.fn();
    h.message(
      { action: 'JB_QUICK_START' },
      { id: 'jb', frameId: 0, url: 'https://jobs.test', tab: { id: 12 } },
      respond,
    );
    await vi.waitFor(() => expect(respond).toHaveBeenCalledWith({ quickFillError: true }));
    expect(h.coordinator.start).not.toHaveBeenCalled();
  });
  it('routes missing Gemini setup to the key input', async () => {
    const h = harness();
    h.coordinator.start.mockResolvedValue({ stage: 'error', error: 'ai_setup_required' } as never);
    h.message(
      { action: 'JB_QUICK_START' },
      { id: 'jb', frameId: 0, url: 'https://jobs.test', tab: { id: 12 } },
      vi.fn(),
    );
    await vi.waitFor(() => expect(h.api.runtime.openOptionsPage).toHaveBeenCalledOnce());
    expect(sessionSet).toHaveBeenCalledWith({ 'jb:focusOnLoad': 'gemini-api-key' });
  });
});
