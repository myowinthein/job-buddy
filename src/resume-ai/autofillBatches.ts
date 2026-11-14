import type { AIFieldPayload, AIFieldResponse } from './types';

const CONCURRENT_BATCHES = 2;

/** Overlap independent requests, but serialize their DOM-writing consumers. */
export async function runAutofillBatches(
  batches: AIFieldPayload[][],
  request: (fields: AIFieldPayload[]) => Promise<AIFieldResponse[]>,
  options: {
    isActive?: () => boolean;
    onBatch?: (responses: AIFieldResponse[]) => Promise<void>;
    onUnavailable?: () => void;
  },
): Promise<AIFieldResponse[]> {
  const results: AIFieldResponse[][] = [];
  let next = 0;
  let stopped = false;
  let error: unknown;
  let deliveryError: unknown;
  let delivery = Promise.resolve();
  const active = () => {
    if (options.isActive && !options.isActive())
      throw new DOMException('Autofill cancelled', 'AbortError');
  };
  const worker = async () => {
    while (!stopped && next < batches.length) {
      const index = next++;
      try {
        active();
        const responses = await request(batches[index]);
        active();
        results[index] = responses;
        if (options.onBatch) {
          const consumed = delivery.then(async () => {
            active();
            if (deliveryError) throw deliveryError;
            await options.onBatch!(responses);
          });
          // Observe a rejection immediately, including while another request
          // is pending. Its worker still receives and reports the same error.
          delivery = consumed.catch((failure) => {
            deliveryError = failure;
          });
          await consumed;
        }
      } catch (failure) {
        stopped = true;
        // Cancellation takes precedence over a concurrent provider failure.
        if (!error || (failure as Error)?.name === 'AbortError') error = failure;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENT_BATCHES, batches.length) }, worker));
  active();
  const responses = results.flat();
  if (error) {
    if ((error as Error)?.name === 'AbortError' || !responses.length) throw error;
    options.onUnavailable?.();
  }
  return responses;
}
