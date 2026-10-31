import { describe, expect, it } from 'vitest';
import { latestFillLogFrames, summarizeFillFields } from './fillLog';
import type { FillLogField, FillLogFrame } from './fillLog';

const field = (overrides: Partial<FillLogField> = {}): FillLogField => ({
  id: 'field_001',
  label: 'Name',
  kind: 'text',
  rule: { outcome: 'filled' },
  ai: { outcome: 'not_sent' },
  outcome: 'high_confidence',
  source: 'rules',
  ...overrides,
});

describe('fill log summaries', () => {
  it('counts a refinement in both processing stages, but once in final outcomes', () => {
    const result = summarizeFillFields([
      field({ ai: { outcome: 'refined' }, source: 'ai' }),
      field({
        id: 'field_002',
        rule: { outcome: 'not_matched' },
        ai: { outcome: 'filled' },
        source: 'ai',
        outcome: 'review',
      }),
    ]);
    expect(result).toMatchObject({
      detected: 2,
      filled: 2,
      highConfidence: 1,
      review: 1,
      ruleFilled: 1,
      sentToAI: 2,
      aiFilled: 1,
      aiRefined: 1,
    });
  });

  it('accounts for kept answers, consent exclusions, failures, and manually cleared fields', () => {
    const result = summarizeFillFields([
      field({ outcome: 'kept' }),
      field({ outcome: 'excluded' }),
      field({ outcome: 'failed' }),
      field({ outcome: 'manual' }),
      field({ outcome: 'not_matched', reason: 'manual_clear' }),
      field({ outcome: 'missing_data' }),
    ]);
    expect(result.detected).toBe(result.filled + result.kept + result.excluded + result.notFilled);
    expect(result).toMatchObject({
      detected: 6,
      filled: 1,
      kept: 1,
      excluded: 1,
      failed: 1,
      notFilled: 3,
      manual: 1,
    });
  });

  it('includes failed requests and omitted responses in the handoff count', () => {
    expect(
      summarizeFillFields([
        field({ ai: { outcome: 'failed' } }),
        field({ ai: { outcome: 'no_response' } }),
        field({ ai: { outcome: 'not_sent' } }),
      ]),
    ).toMatchObject({ sentToAI: 2, aiFilled: 0, aiFailed: 1 });
  });

  it('combines every frame in the latest run and drops older runs', () => {
    const frame = (frameId: number, runId: string, startedAt: number): FillLogFrame => ({
      frameId,
      log: {
        version: 1,
        runId,
        startedAt,
        origin: 'https://example.test',
        status: 'completed',
        fields: [field()],
      },
    });
    const frames = latestFillLogFrames([
      frame(0, 'current', 20),
      frame(5, 'current', 21),
      frame(9, 'old', 10),
    ]);
    expect(frames.map((item) => item.frameId)).toEqual([0, 5]);
    expect(summarizeFillFields(frames.flatMap((item) => item.log.fields)).detected).toBe(2);
    expect(latestFillLogFrames([])).toEqual([]);
  });
});
