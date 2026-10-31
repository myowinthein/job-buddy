import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadFillLog, openFillLog, returnToForm } from './client';

const tabs = { get: vi.fn(), sendMessage: vi.fn(), create: vi.fn(), update: vi.fn() };
const getAllFrames = vi.fn();
const log = (runId: string, startedAt: number) => ({
  version: 1,
  runId,
  startedAt,
  status: 'completed',
  origin: 'https://example.test',
  fields: [],
});
beforeEach(() => {
  vi.clearAllMocks();
  tabs.get.mockResolvedValue({ id: 10 });
  tabs.create.mockResolvedValue({});
  tabs.update.mockResolvedValue({});
  getAllFrames.mockResolvedValue([{ frameId: 0 }, { frameId: 3 }, { frameId: 9 }]);
  vi.stubGlobal('chrome', {
    tabs,
    webNavigation: { getAllFrames },
    runtime: { getURL: (path: string) => `chrome-extension://test/${path}` },
  });
});

describe('reading a source form log', () => {
  it('uses the explicit source tab and all current-run frames without scanning or filling', async () => {
    tabs.sendMessage.mockImplementation((_tabId, _message, { frameId }) =>
      Promise.resolve(log(frameId === 9 ? 'old' : 'new', frameId === 9 ? 1 : 2)),
    );
    const snapshot = await loadFillLog(10);
    expect(snapshot.frames.map((item) => item.frameId)).toEqual([0, 3]);
    expect(tabs.sendMessage).toHaveBeenCalledTimes(3);
    for (const call of tabs.sendMessage.mock.calls) {
      expect(call[0]).toBe(10);
      expect(call[1]).toEqual({ action: 'GET_FILL_LOG' });
    }
  });

  it('preserves readable frames when another frame rejects or returns legacy data', async () => {
    tabs.sendMessage.mockImplementation((_tabId, _message, { frameId }) =>
      frameId === 9
        ? Promise.reject(new Error('detached'))
        : Promise.resolve(frameId === 3 ? { scanner: [] } : log('new', 2)),
    );
    expect((await loadFillLog(10)).frames.map((item) => item.frameId)).toEqual([0]);
  });

  it('falls back to the main frame if enumeration fails', async () => {
    getAllFrames.mockRejectedValueOnce(new Error('unavailable'));
    tabs.sendMessage.mockResolvedValue(log('new', 2));
    expect((await loadFillLog(10)).frames).toHaveLength(1);
    expect(tabs.sendMessage).toHaveBeenCalledWith(10, { action: 'GET_FILL_LOG' }, { frameId: 0 });
  });

  it('reports a closed source rather than silently switching to another tab', async () => {
    tabs.get.mockRejectedValueOnce(new Error('closed'));
    await expect(loadFillLog(10)).rejects.toThrow('closed');
    expect(tabs.sendMessage).not.toHaveBeenCalled();
  });

  it('requests a form refresh when an earlier script has fill results but no detailed log', async () => {
    tabs.sendMessage.mockImplementation((_id, message, { frameId }) =>
      Promise.resolve(
        frameId === 0
          ? message.action === 'GET_STATUS'
            ? { totalScanned: 12, noReview: 7 }
            : undefined
          : log('empty-sandbox', 20),
      ),
    );
    const snapshot = await loadFillLog(10);
    expect(snapshot.needsRefresh).toBe(true);
    expect(tabs.sendMessage).toHaveBeenCalledWith(10, { action: 'GET_STATUS' }, { frameId: 0 });
    expect(
      tabs.sendMessage.mock.calls.every(([, message]) =>
        ['GET_FILL_LOG', 'GET_STATUS'].includes(message.action),
      ),
    ).toBe(true);
  });

  it('opens the dedicated page and returns to the same source tab', async () => {
    await openFillLog(10);
    expect(tabs.create).toHaveBeenCalledWith({
      url: 'chrome-extension://test/fill-log.html?tabId=10',
    });
    await returnToForm(10);
    expect(tabs.update).toHaveBeenCalledWith(10, { active: true });
  });
});
