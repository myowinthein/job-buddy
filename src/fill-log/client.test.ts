import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadFillLog, openFillLog, returnToForm } from './client';
import { createPreviewChrome } from '@/src/preview/chrome';
import {
  FILL_DETAILS_REQUEST,
  takeFillDetailsRequest,
  sourceFromQuery,
  lastFillDetailsSource,
} from './navigation';

const tabs = { get: vi.fn(), sendMessage: vi.fn(), create: vi.fn(), update: vi.fn() };
const getAllFrames = vi.fn();
const openOptionsPage = vi.fn();
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
    storage: createPreviewChrome({}).storage,
    tabs,
    webNavigation: { getAllFrames },
    runtime: { getURL: (path: string) => `chrome-extension://test/${path}`, openOptionsPage },
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

  it('routes into the reusable options page and returns to the same source tab', async () => {
    await openFillLog(10);
    expect(openOptionsPage).toHaveBeenCalledOnce();
    expect(tabs.create).not.toHaveBeenCalled();
    expect(await takeFillDetailsRequest()).toEqual({ tabId: 10 });
    expect(await takeFillDetailsRequest()).toBeNull();
    await returnToForm(10);
    expect(tabs.update).toHaveBeenCalledWith(10, { active: true });
  });
  it('focuses the source window as well as its tab when returning', async () => {
    const focus = vi.fn().mockResolvedValue({});
    Object.assign(chrome, { windows: { update: focus } });
    tabs.update.mockResolvedValueOnce({ id: 10, windowId: 3 });
    await returnToForm(10);
    expect(focus).toHaveBeenCalledWith(3, { focused: true });
  });
  it('uses existing completed run metadata when details have not been requested before', async () => {
    await new Promise<void>((resolve) =>
      chrome.storage.session.set(
        {
          'jb:autofill-run:10': {
            tabId: 10,
            startedAt: 1,
            stage: 'completed',
            results: [{ totalScanned: 4 }],
          },
          'jb:autofill-run:20': {
            tabId: 20,
            startedAt: 2,
            stage: 'completed',
            results: [{ totalScanned: 0 }],
          },
          'jb:autofill-run:30': { tabId: 30, startedAt: 3, stage: 'filling' },
          'jb:autofill-run:40': { tabId: 40, startedAt: 4, stage: 'completed', results: {} },
        },
        resolve,
      ),
    );
    expect(await lastFillDetailsSource()).toBe(10);
    expect(tabs.sendMessage).not.toHaveBeenCalled();
  });
  it('keeps the latest concurrent navigation request and never scans a form', async () => {
    await Promise.all([openFillLog(10), openFillLog(20)]);
    expect(await takeFillDetailsRequest()).toEqual({ tabId: 20 });
    expect(tabs.sendMessage).not.toHaveBeenCalled();
  });
  it('does not open an options page without a valid source or a saved request', async () => {
    await expect(openFillLog(-1)).rejects.toThrow('Invalid source form');
    vi.spyOn(chrome.storage.session, 'set').mockImplementationOnce(() => {
      throw new Error('Unavailable');
    });
    await expect(openFillLog(10)).rejects.toThrow('Unavailable');
    expect(openOptionsPage).not.toHaveBeenCalled();
  });
  it('gives repeated requests a new identifier so an already-visible options page is notified', async () => {
    const read = () =>
      new Promise<Record<string, unknown>>((resolve) =>
        chrome.storage.session.get(FILL_DETAILS_REQUEST, (result) => resolve(result)),
      );
    await openFillLog(10);
    const first = await read();
    await openFillLog(10);
    expect(await read()).not.toEqual(first);
  });
  it.each(['', '?tabId=-1', '?tabId=no', '?tabId=9007199254740992'])(
    'never replaces an invalid query source with another tab: %s',
    (search) => expect(sourceFromQuery(search)).toBeNull(),
  );
});
