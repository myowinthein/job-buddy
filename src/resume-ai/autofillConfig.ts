import type { GeminiModel } from './types';

/** Field matching is latency-sensitive; keep extraction/review configuration separate. */
export function autofillThinkingConfig(model: GeminiModel): {
  thinkingConfig?: { thinkingLevel: 'low' };
} {
  // Flash-Lite already defaults to minimal. Requesting "low" would slow it down.
  return model === 'gemini-3.8-flash' ? { thinkingConfig: { thinkingLevel: 'low' } } : {};
}
