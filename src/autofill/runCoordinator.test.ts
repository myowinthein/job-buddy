import { describe, it, expect, vi, afterEach } from 'vitest';
import { AutofillCoordinator, type AutofillRun } from './runCoordinator';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function harness() {
  const records = new Map<number, AutofillRun>();
  const send = vi.fn(
    async (
      _run: AutofillRun,
      _frame: { frameId: number },
      message: { action: string; runId?: string },
    ) => {
      if (message.action === 'AUTOFILL_SCAN') return { preFilledCount: 0 };
      return {
        noReview: 1,
        needReview: 0,
        lowConfidence: 0,
        noData: 0,
        totalScanned: 1,
        runId: message.runId,
        apiKey: 'must-not-be-stored',
      };
    },
  );
  const deps = {
    read: async (tabId: number) => records.get(tabId) ?? null,
    write: async (tabId: number, run: AutofillRun | null) => {
      if (run) records.set(tabId, structuredClone(run));
      else records.delete(tabId);
    },
    frames: vi.fn(async (_tabId: number) => [{ frameId: 0, documentId: 'original-document' }]),
    send,
    alarm: vi.fn(async (_tabId: number, _pending: boolean) => {}),
    setup: vi.fn(async (): Promise<string | undefined> => undefined),
  };
  return { records, deps, send, coordinator: new AutofillCoordinator(deps) };
}
afterEach(() => vi.useRealTimers());

describe('background autofill coordination', () => {
  it('owns the scan-to-fill handoff without depending on its caller remaining open', async () => {
    const h = harness();
    const scan = deferred<{ preFilledCount: number }>();
    h.send.mockImplementationOnce(() => scan.promise);
    const done = h.coordinator.start(10);
    await vi.waitFor(() => expect(h.records.get(10)?.stage).toBe('scanning'));
    expect(h.send).toHaveBeenCalledTimes(1);
    scan.resolve({ preFilledCount: 0 });
    expect((await done)?.stage).toBe('completed');
    expect(h.send.mock.calls[1]).toEqual([
      expect.objectContaining({ tabId: 10 }),
      { frameId: 0, documentId: 'original-document' },
      expect.objectContaining({ action: 'AUTOFILL_FILL', mode: 'overwrite' }),
    ]);
    expect(JSON.stringify(h.records.get(10))).not.toContain('must-not-be-stored');
  });

  it('coalesces repeated starts while a run is active', async () => {
    const h = harness();
    const scan = deferred<{ preFilledCount: number }>();
    h.send.mockImplementationOnce(() => scan.promise);
    const first = h.coordinator.start(10);
    const second = h.coordinator.start(10);
    await vi.waitFor(() => expect(h.send).toHaveBeenCalledOnce());
    scan.resolve({ preFilledCount: 0 });
    const results = await Promise.all([first, second]);
    expect(results[0]?.runId).toBe(results[1]?.runId);
    expect(h.send.mock.calls.filter(([, , m]) => m.action === 'AUTOFILL_FILL')).toHaveLength(1);
  });

  it('restores an existing-answer choice after worker restart and confirms without rescanning', async () => {
    const h = harness();
    h.send.mockResolvedValueOnce({ preFilledCount: 2 });
    const waiting = await h.coordinator.start(10);
    expect(waiting?.stage).toBe('confirming');
    const restarted = new AutofillCoordinator(h.deps);
    expect((await restarted.status(10))?.stage).toBe('confirming');
    expect(h.send).toHaveBeenCalledOnce();
    const done = await restarted.confirm(10, waiting!.runId, 'merge');
    expect(done?.stage).toBe('completed');
    expect(h.send.mock.calls[1][2]).toEqual({
      action: 'AUTOFILL_FILL',
      runId: waiting!.runId,
      mode: 'merge',
    });
  });

  it('waits for a choice if any embedded frame has an existing answer', async () => {
    const h = harness();
    h.deps.frames.mockResolvedValue([
      { frameId: 0, documentId: 'original-document' },
      { frameId: 4, documentId: 'child' },
    ]);
    h.send
      .mockResolvedValueOnce({ preFilledCount: 0 })
      .mockResolvedValueOnce({ preFilledCount: 1 });
    expect((await h.coordinator.start(10))?.stage).toBe('confirming');
    expect(h.send).toHaveBeenCalledTimes(2);
  });

  it('does not execute stale confirmations or refill a completed run', async () => {
    const h = harness();
    const done = await h.coordinator.start(10);
    expect(await h.coordinator.confirm(10, 'stale', 'overwrite')).toBeNull();
    expect((await h.coordinator.confirm(10, done!.runId, 'overwrite'))?.stage).toBe('completed');
    expect(h.send).toHaveBeenCalledTimes(2);
  });

  it('cancels before a delayed scan reply and lets a new run complete independently', async () => {
    const h = harness();
    const scan = deferred<{ preFilledCount: number }>();
    h.send.mockImplementationOnce(() => scan.promise);
    const old = h.coordinator.start(10);
    await vi.waitFor(() => expect(h.send).toHaveBeenCalledOnce());
    const oldId = h.records.get(10)!.runId;
    await h.coordinator.cancel(10, oldId);
    const fresh = await h.coordinator.start(10);
    expect(fresh?.stage).toBe('completed');
    scan.resolve({ preFilledCount: 0 });
    expect(await old).toBeNull();
    expect(h.records.get(10)?.runId).toBe(fresh?.runId);
  });

  it('rejects a confirmation after the source document changed', async () => {
    const h = harness();
    h.send.mockResolvedValueOnce({ preFilledCount: 1 });
    const run = await h.coordinator.start(10);
    h.deps.frames.mockResolvedValue([{ frameId: 0, documentId: 'replacement-document' }]);
    expect((await h.coordinator.confirm(10, run!.runId, 'overwrite'))?.error).toBe('page_changed');
    expect(h.send).toHaveBeenCalledOnce();
  });

  it('keeps the source document binding when only an embedded frame can be scanned', async () => {
    const h = harness();
    h.deps.frames.mockResolvedValue([
      { frameId: 0, documentId: 'original-document' },
      { frameId: 3, documentId: 'child' },
    ]);
    h.send
      .mockRejectedValueOnce(new Error('no listener'))
      .mockResolvedValueOnce({ preFilledCount: 1 });
    const run = await h.coordinator.start(10);
    expect(run?.frames).toEqual([{ frameId: 3, documentId: 'child' }]);
    h.deps.frames.mockResolvedValue([
      { frameId: 0, documentId: 'other-document' },
      { frameId: 3, documentId: 'child' },
    ]);
    expect((await h.coordinator.confirm(10, run!.runId, 'overwrite'))?.error).toBe('page_changed');
    expect(h.send).toHaveBeenCalledTimes(2);
  });

  it('keeps the same document but removes pending work on navigation or tab close', async () => {
    const h = harness();
    h.send.mockResolvedValueOnce({ preFilledCount: 1 });
    await h.coordinator.start(10);
    await h.coordinator.navigated(10, 'original-document');
    expect(h.records.has(10)).toBe(true);
    await h.coordinator.navigated(10, 'new-document');
    expect(h.records.has(10)).toBe(false);
  });

  it('recovers a persisted pending run and re-arms its recovery alarm', async () => {
    const h = harness();
    const scan = deferred<{ preFilledCount: number }>();
    h.records.set(10, {
      tabId: 10,
      runId: 'persisted',
      stage: 'scanning',
      startedAt: Date.now(),
      frames: [{ frameId: 0, documentId: 'original-document' }],
    });
    h.send.mockImplementationOnce(() => scan.promise);
    await h.coordinator.recover(10);
    expect(h.deps.alarm).toHaveBeenCalledWith(10, true);
    scan.resolve({ preFilledCount: 0 });
    await vi.waitFor(() => expect(h.records.get(10)?.stage).toBe('completed'));
  });

  it('expires stuck runs without accepting a later successful reply', async () => {
    const h = harness();
    const scan = deferred<{ preFilledCount: number }>();
    h.send.mockImplementationOnce(() => scan.promise);
    const done = h.coordinator.start(10);
    await vi.waitFor(() => expect(h.send).toHaveBeenCalledOnce());
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 6 * 60_000);
    expect((await h.coordinator.status(10))?.stage).toBe('error');
    scan.resolve({ preFilledCount: 0 });
    await done;
    expect(h.records.get(10)?.stage).toBe('error');
    expect(h.send.mock.calls.some(([, , m]) => m.action === 'AUTOFILL_FILL')).toBe(false);
  });

  it('requires fresh AI setup before starting and before confirming', async () => {
    const h = harness();
    h.deps.setup.mockResolvedValueOnce('ai_setup_required');
    expect((await h.coordinator.start(10))?.error).toBe('ai_setup_required');
    expect(h.send).not.toHaveBeenCalled();
    h.send.mockResolvedValueOnce({ preFilledCount: 1 });
    const choice = await h.coordinator.start(10);
    h.deps.setup.mockResolvedValueOnce('ai_settings_unavailable');
    expect((await h.coordinator.confirm(10, choice!.runId, 'merge'))?.error).toBe(
      'ai_settings_unavailable',
    );
    expect(h.send).toHaveBeenCalledOnce();
  });
});

it('does not count time spent choosing how to fill against the run timeout', async () => {
  const h = harness();
  h.send.mockResolvedValueOnce({ preFilledCount: 1 });
  const choice = await h.coordinator.start(10);
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 60 * 60_000);
  expect((await h.coordinator.confirm(10, choice!.runId, 'merge'))?.stage).toBe('completed');
});

it('starts a confirmed fill even if scan coordination is still finishing', async () => {
  const h = harness();
  h.send.mockResolvedValueOnce({ preFilledCount: 1 });
  const finishingScan = deferred<void>();
  h.deps.alarm.mockImplementation(async (_tabId, isPending) => {
    if (!isPending && h.records.get(10)?.stage === 'confirming') await finishingScan.promise;
  });
  const initial = h.coordinator.start(10);
  await vi.waitFor(() => expect(h.records.get(10)?.stage).toBe('confirming'));
  const confirmation = h.coordinator.confirm(10, h.records.get(10)!.runId, 'merge');
  finishingScan.resolve();
  await initial;
  expect((await confirmation)?.stage).toBe('completed');
  expect(
    h.send.mock.calls.filter(([, , message]) => message.action === 'AUTOFILL_FILL'),
  ).toHaveLength(1);
});
