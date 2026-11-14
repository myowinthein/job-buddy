import { expect, it, vi } from 'vitest';
import { runAutofillBatches } from './autofillBatches';
import type { AIFieldPayload, AIFieldResponse } from './types';

const batches: AIFieldPayload[][] = [0, 1, 2].map((i) => [
  { fieldId: String(i), type: 'text', label: 'Applicant detail' },
]);
const answer = (i: number): AIFieldResponse[] => [{ fieldId: String(i), confidence: null }];
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

it('starts at most two requests and delivers a fast batch before a slow batch finishes', async () => {
  const requests = batches.map(() => deferred<AIFieldResponse[]>());
  const request = vi.fn((fields: AIFieldPayload[]) => requests[Number(fields[0].fieldId)].promise);
  const delivered: string[] = [];
  const pending = runAutofillBatches(batches, request, {
    onBatch: async (items) => {
      delivered.push(items[0].fieldId);
    },
  });
  expect(request).toHaveBeenCalledTimes(2);
  requests[0].resolve(answer(0));
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(3));
  expect(delivered).toEqual(['0']);
  requests[2].resolve(answer(2));
  await vi.waitFor(() => expect(delivered).toEqual(['0', '2']));
  requests[1].resolve(answer(1));
  expect(await pending).toEqual([...answer(0), ...answer(1), ...answer(2)]);
});

it('never writes two completed batches into the DOM at the same time', async () => {
  const release = deferred<void>();
  const entered: string[] = [];
  const pending = runAutofillBatches(
    batches.slice(0, 2),
    async (fields) => answer(Number(fields[0].fieldId)),
    {
      onBatch: async (items) => {
        entered.push(items[0].fieldId);
        if (items[0].fieldId === '0') await release.promise;
      },
    },
  );
  await vi.waitFor(() => expect(entered).toEqual(['0']));
  release.resolve();
  await pending;
  expect(entered).toEqual(['0', '1']);
});

it('retains an in-flight success when another request fails, without dispatching more batches', async () => {
  const first = deferred<AIFieldResponse[]>();
  const second = deferred<AIFieldResponse[]>();
  const request = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const onUnavailable = vi.fn();
  const delivered = vi.fn(async () => {});
  const pending = runAutofillBatches(batches, request, { onBatch: delivered, onUnavailable });
  second.reject(new Error('Provider unavailable'));
  await Promise.resolve();
  first.resolve(answer(0));
  expect(await pending).toEqual(answer(0));
  expect(delivered).toHaveBeenCalledOnce();
  expect(onUnavailable).toHaveBeenCalledOnce();
  expect(request).toHaveBeenCalledTimes(2);
});

it('rejects cancellation and never delivers a later response', async () => {
  const later = deferred<AIFieldResponse[]>();
  let active = true;
  const delivered: string[] = [];
  const pending = runAutofillBatches(
    batches.slice(0, 2),
    async (fields) => (fields[0].fieldId === '0' ? answer(0) : later.promise),
    {
      isActive: () => active,
      onBatch: async (items) => {
        delivered.push(items[0].fieldId);
      },
    },
  );
  const outcome = pending.catch((error: Error) => error.name);
  await vi.waitFor(() => expect(delivered).toEqual(['0']));
  active = false;
  later.resolve(answer(1));
  expect(await outcome).toBe('AbortError');
  expect(delivered).toEqual(['0']);
});

it('reports a provider error when no batch produced answers', async () => {
  await expect(
    runAutofillBatches(
      batches,
      async () => {
        throw new Error('Provider failed');
      },
      {},
    ),
  ).rejects.toThrow('Provider failed');
});

it('stops later DOM consumers after a write consumer fails', async () => {
  const later = deferred<AIFieldResponse[]>();
  const onUnavailable = vi.fn();
  const delivered = vi.fn(async () => {
    throw new Error('Profile read failed');
  });
  const pending = runAutofillBatches(
    batches.slice(0, 2),
    async (fields) => (fields[0].fieldId === '0' ? answer(0) : later.promise),
    { onBatch: delivered, onUnavailable },
  );
  await vi.waitFor(() => expect(delivered).toHaveBeenCalledOnce());
  later.resolve(answer(1));
  await pending;
  expect(delivered).toHaveBeenCalledOnce();
  expect(onUnavailable).toHaveBeenCalledOnce();
});
