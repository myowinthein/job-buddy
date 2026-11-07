import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendToAllFrames } from './frameMessaging';

const TAB = 7;
let calls: string[];
let getAllFrames: ReturnType<typeof vi.fn>;
let executeScript: ReturnType<typeof vi.fn>;
let sendMessage: ReturnType<typeof vi.fn>;

beforeEach(() => {
  calls = [];
  getAllFrames = vi.fn(async () => [{ frameId: 0 }, { frameId: 3 }]);
  executeScript = vi.fn(async ({ target }: { target: { frameIds: number[] } }) => {
    calls.push(`inject:${target.frameIds[0]}`);
  });
  sendMessage = vi.fn(async (_tab: number, _message: object, { frameId }: { frameId: number }) => {
    calls.push(`send:${frameId}`);
    return { frameId };
  });
  vi.stubGlobal('chrome', {
    webNavigation: { getAllFrames },
    scripting: { executeScript },
    tabs: { sendMessage },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('sendToAllFrames', () => {
  it('sends the message to every enumerated frame with an explicit frame ID', async () => {
    await sendToAllFrames(TAB, { action: 'GET_STATUS' });
    expect(sendMessage.mock.calls.map(([, , options]) => options)).toEqual([
      { frameId: 0 },
      { frameId: 3 },
    ]);
  });

  it('adds the top frame once even when enumeration omits it or repeats it', async () => {
    getAllFrames.mockResolvedValue([{ frameId: 5 }, { frameId: 5 }]);
    await sendToAllFrames(TAB, {});
    expect(sendMessage.mock.calls.map(([, , options]) => options.frameId)).toEqual([0, 5]);
  });

  it.each([
    ['rejects', () => getAllFrames.mockRejectedValue(new Error('unavailable'))],
    ['returns nothing', () => getAllFrames.mockResolvedValue(null)],
  ])('falls back to the top frame when frame enumeration %s', async (_label, arrange) => {
    arrange();
    await sendToAllFrames(TAB, {});
    expect(sendMessage.mock.calls.map(([, , options]) => options.frameId)).toEqual([0]);
  });

  it('re-injects the content script into each frame before any message is sent', async () => {
    await sendToAllFrames(TAB, {});
    expect(calls.slice(0, 2).sort()).toEqual(['inject:0', 'inject:3']);
  });

  it('targets the packaged content script in each frame of the tab', async () => {
    await sendToAllFrames(TAB, {});
    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: TAB, frameIds: [3] },
      files: ['content-scripts/content.js'],
    });
  });

  it('still messages a frame whose injection was rejected', async () => {
    executeScript.mockRejectedValue(new Error('frame detached'));
    const replies = await sendToAllFrames(TAB, {});
    expect(replies).toEqual([{ frameId: 0 }, { frameId: 3 }]);
  });

  it('returns only replies from frames that answered', async () => {
    getAllFrames.mockResolvedValue([{ frameId: 0 }, { frameId: 3 }, { frameId: 9 }]);
    sendMessage.mockImplementation(async (_tab, _message, { frameId }) => {
      if (frameId === 0) throw new Error('no receiver');
      return frameId === 9 ? { ok: true } : undefined;
    });
    expect(await sendToAllFrames(TAB, {})).toEqual([{ ok: true }]);
  });
});
