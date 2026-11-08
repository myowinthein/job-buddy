import type { AIAutofillStatus } from './ai';
import { latestFillRunId } from './fillLog';

export interface AutofillResult {
  noReview:      number;  // filled, confidence >= 0.85 (green)
  needReview:    number;  // filled, 0.60 <= confidence < 0.85 (yellow)
  lowConfidence: number;  // not filled, confidence < 0.60 — red highlight
  noData:        number;  // not filled, confidence >= 0.60 but profile value is empty
  totalScanned:  number;  // every field found by the scanner, regardless of outcome
  aiStatus?: AIAutofillStatus;
  kept?: number;
  excluded?: number;
  failed?: number;
  manual?: number;
  runId?: string;
  startedAt?: number;
}

// Zero-valued result used as a safe fallback when a fill cycle throws before
// producing a real count. Kept here beside AutofillResult so new fields on the
// interface stay reflected in the fallback shape.
export const EMPTY_AUTOFILL_RESULT: AutofillResult = {
  noReview:      0,
  needReview:    0,
  lowConfidence: 0,
  noData:        0,
  totalScanned:  0,
};

/** Counts the run coordinator keeps from each frame's reply (manual is not persisted). */
export const PERSISTED_RESULT_KEYS = [
  'noReview',
  'needReview',
  'lowConfidence',
  'noData',
  'totalScanned',
  'kept',
  'excluded',
  'failed',
  'aiStatus',
  'runId',
  'startedAt',
] as const satisfies readonly (keyof AutofillResult)[];
export type PersistedResultKey = (typeof PERSISTED_RESULT_KEYS)[number];

/** One result for the latest run, summed across frames. */
export interface MergedAutofillResult {
  noReview: number;
  needReview: number;
  lowConfidence: number;
  noData: number;
  totalScanned: number;
  aiStatus?: AIAutofillStatus | 'unknown';
  kept?: number;
  excluded?: number;
  failed?: number;
  runId?: string;
  startedAt?: number;
}

// Aggregate every frame; one failed AI pass must remain visible even when
// another frame completed successfully. Legacy results cannot prove AI success.
export function mergeAutofillResults(
  results: unknown[],
  requestedRunId?: string,
): MergedAutofillResult | null {
  const available = results.filter(
    (r): r is MergedAutofillResult =>
      !!r && typeof (r as MergedAutofillResult).totalScanned === 'number',
  );
  if (!available.length) return null;
  const runs = available.flatMap((r) =>
    r.runId && typeof r.startedAt === 'number'
      ? [{ ...r, runId: r.runId, startedAt: r.startedAt }]
      : [],
  );
  const runId = requestedRunId ?? latestFillRunId(runs);
  // Older content scripts cannot report run IDs. Preserve their actual fill
  // replies, and do not let an empty upgraded iframe hide their saved result.
  const includeLegacy = !!requestedRunId || !runs.some((r) => r.totalScanned > 0);
  const valid = runId
    ? available.filter((r) => r.runId === runId || (includeLegacy && !r.runId))
    : available;
  if (!valid.length) return null;
  const statuses = valid
    .filter((r) => r.totalScanned > 0)
    .map((r) =>
      ['unavailable', 'succeeded', 'not_needed'].includes(r.aiStatus ?? '')
        ? r.aiStatus!
        : 'unknown',
    );
  const aiStatus = statuses.includes('unavailable')
    ? 'unavailable'
    : statuses.includes('unknown')
      ? 'unknown'
      : statuses.includes('succeeded')
        ? 'succeeded'
        : 'not_needed';
  return valid.reduce(
    (acc, r) => ({
      noReview: acc.noReview + r.noReview,
      needReview: acc.needReview + r.needReview,
      lowConfidence: acc.lowConfidence + r.lowConfidence,
      noData: acc.noData + r.noData,
      totalScanned: acc.totalScanned + r.totalScanned,
      kept: (acc.kept ?? 0) + (r.kept ?? 0),
      excluded: (acc.excluded ?? 0) + (r.excluded ?? 0),
      failed: (acc.failed ?? 0) + (r.failed ?? 0),
      aiStatus,
    }),
    {
      noReview: 0,
      needReview: 0,
      lowConfidence: 0,
      noData: 0,
      totalScanned: 0,
      aiStatus,
      kept: 0,
      excluded: 0,
      failed: 0,
    },
  );
}
