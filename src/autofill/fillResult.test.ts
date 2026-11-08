import { describe, expect, it } from 'vitest';
import { PERSISTED_RESULT_KEYS, mergeAutofillResults } from './fillResult';

const frame = (overrides: Record<string, unknown> = {}) => ({
  noReview: 1,
  needReview: 1,
  lowConfidence: 1,
  noData: 1,
  totalScanned: 4,
  aiStatus: 'succeeded',
  runId: 'run-a',
  startedAt: 100,
  ...overrides,
});

describe('mergeAutofillResults', () => {
  it.each([[[]], [[null, undefined, 'text', { totalScanned: 'x' }]]])(
    'returns null when no frame reports a scanned count (%j)',
    (results) => {
      expect(mergeAutofillResults(results)).toBeNull();
    },
  );

  it('sums every frame of the run', () => {
    expect(
      mergeAutofillResults([frame(), frame({ kept: 2, excluded: 1, failed: 3 })]),
    ).toMatchObject({
      noReview: 2,
      needReview: 2,
      lowConfidence: 2,
      noData: 2,
      totalScanned: 8,
      kept: 2,
      excluded: 1,
      failed: 3,
    });
  });

  it('keeps only the latest run that scanned fields', () => {
    const older = frame({ runId: 'run-old', startedAt: 50, totalScanned: 9 });
    expect(mergeAutofillResults([older, frame()])?.totalScanned).toBe(4);
  });

  it('does not let an empty frame from a later run replace the form run', () => {
    const sandbox = frame({ runId: 'run-b', startedAt: 500, totalScanned: 0 });
    expect(mergeAutofillResults([frame(), sandbox])?.totalScanned).toBe(4);
  });

  it('uses the requested run when one is given', () => {
    const older = frame({ runId: 'run-old', startedAt: 50, totalScanned: 9 });
    expect(mergeAutofillResults([older, frame()], 'run-old')?.totalScanned).toBe(9);
  });

  it('keeps replies from older content scripts that report no run ID', () => {
    const legacy = { noReview: 2, needReview: 0, lowConfidence: 0, noData: 0, totalScanned: 2 };
    expect(mergeAutofillResults([legacy])?.totalScanned).toBe(2);
  });

  it('leaves out replies without a run ID once a run scanned fields', () => {
    const legacy = { noReview: 5, needReview: 0, lowConfidence: 0, noData: 0, totalScanned: 5 };
    expect(mergeAutofillResults([legacy, frame()])?.totalScanned).toBe(4);
  });

  it('includes replies without a run ID when a run is requested', () => {
    const legacy = { noReview: 5, needReview: 0, lowConfidence: 0, noData: 0, totalScanned: 5 };
    expect(mergeAutofillResults([legacy, frame()], 'run-a')?.totalScanned).toBe(9);
  });

  it.each([
    [['unavailable', 'succeeded'], 'unavailable'],
    [['succeeded', undefined], 'unknown'],
    [['succeeded', 'not_needed'], 'succeeded'],
    [['not_needed', 'not_needed'], 'not_needed'],
  ])('combines AI statuses %j into %s', (statuses, expected) => {
    const results = statuses.map((aiStatus) => frame({ aiStatus }));
    expect(mergeAutofillResults(results)?.aiStatus).toBe(expected);
  });

  it('ignores the AI status of frames that scanned nothing', () => {
    const empty = frame({ totalScanned: 0, aiStatus: 'unavailable' });
    expect(mergeAutofillResults([frame(), empty])?.aiStatus).toBe('succeeded');
  });
});

describe('PERSISTED_RESULT_KEYS', () => {
  it('lists the counts and run metadata the coordinator keeps, without manual', () => {
    expect([...PERSISTED_RESULT_KEYS].sort()).toEqual(
      [
        'aiStatus',
        'excluded',
        'failed',
        'kept',
        'lowConfidence',
        'needReview',
        'noData',
        'noReview',
        'runId',
        'startedAt',
        'totalScanned',
      ].sort(),
    );
  });
});
