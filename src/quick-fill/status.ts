import type { AutofillRun } from '@/src/autofill/runCoordinator';

export function quickFillSummary(run: AutofillRun): {
  text: string;
  review: boolean;
  filled: number;
  attentionText?: string;
} {
  let filled = 0,
    attention = 0,
    kept = 0,
    scanned = 0,
    aiUnavailable = false;
  for (const result of run.results ?? []) {
    const r = result as Record<string, number | string>;
    const count = (key: string) => (typeof r[key] === 'number' ? (r[key] as number) : 0);
    filled += count('noReview') + count('needReview');
    attention += count('needReview') + count('lowConfidence') + count('noData') + count('failed');
    scanned += count('totalScanned');
    kept += count('kept');
    aiUnavailable ||= count('totalScanned') > 0 && r.aiStatus === 'unavailable';
  }
  const attentionText = `${attention} ${attention === 1 ? 'needs' : 'need'} attention`;
  const hasCounts = !aiUnavailable && scanned > 0 && attention > 0;
  return {
    filled,
    review: attention > 0 || aiUnavailable || !!run.error,
    ...(hasCounts ? { attentionText } : {}),
    text: aiUnavailable
      ? 'AI was unavailable. Basic autofill ran.'
      : !scanned
        ? 'No fillable fields found.'
        : attention
          ? `${filled} filled, ${attentionText}`
          : filled
            ? `${filled} ${filled === 1 ? 'field' : 'fields'} filled`
            : kept
              ? 'Existing answers kept.'
              : 'No fields filled.',
  };
}
