import type { MatchLayer } from './debug';

export type FillOutcome =
  | 'high_confidence'
  | 'review'
  | 'not_matched'
  | 'missing_data'
  | 'kept'
  | 'excluded'
  | 'failed'
  | 'manual';
export type RuleOutcome =
  | 'not_applicable'
  | 'filled'
  | 'not_matched'
  | 'missing_data'
  | 'kept'
  | 'failed';
export type AIOutcome =
  | 'not_sent'
  | 'sent'
  | 'filled'
  | 'refined'
  | 'not_matched'
  | 'missing_data'
  | 'failed'
  | 'fill_failed'
  | 'no_response'
  | 'skipped';

/** Metadata only: never store profile values, document bytes, or credentials. */
export interface FillLogField {
  id: string;
  label: string;
  kind: 'text' | 'select' | 'file' | 'radio' | 'checkbox';
  rule: { outcome: RuleOutcome; layer?: MatchLayer; confidence?: number; profilePath?: string };
  ai: { outcome: AIOutcome; confidence?: 'high' | 'low' | null; profilePath?: string };
  outcome: FillOutcome;
  source: 'rules' | 'ai' | 'manual' | null;
  reason?:
    | 'consent'
    | 'existing_value'
    | 'fill_failed'
    | 'manual_clear'
    | 'manual_edit'
    | 'profile_updated'
    | 'value_changed';
}

export interface FrameFillLog {
  version: 1;
  runId: string;
  startedAt: number;
  completedAt?: number;
  origin: string;
  mode?: 'merge' | 'overwrite';
  status: 'scanning' | 'completed' | 'undone';
  aiStatus?: 'not_needed' | 'succeeded' | 'unavailable';
  fields: FillLogField[];
}

export interface FillLogFrame {
  frameId: number;
  log: FrameFillLog;
}
export interface FillLogSnapshot {
  tabId: number;
  frames: FillLogFrame[];
  needsRefresh?: boolean;
  sourceClosed?: boolean;
}

export function summarizeFillFields(fields: FillLogField[]) {
  const count = (test: (field: FillLogField) => boolean) => fields.filter(test).length;
  const highConfidence = count((f) => f.outcome === 'high_confidence');
  const manual = count((f) => f.outcome === 'manual');
  const review = count((f) => f.outcome === 'review');
  const unmatched = count((f) => f.outcome === 'not_matched');
  const missing = count((f) => f.outcome === 'missing_data');
  const failed = count((f) => f.outcome === 'failed');
  return {
    detected: fields.length,
    filled: highConfidence + review + manual,
    highConfidence,
    review,
    unmatched,
    missing,
    failed,
    manual,
    notFilled: unmatched + missing + failed,
    kept: count((f) => f.outcome === 'kept'),
    excluded: count((f) => f.outcome === 'excluded'),
    ruleFilled: count((f) => f.rule.outcome === 'filled'),
    sentToAI: count((f) => f.ai.outcome !== 'not_sent'),
    aiFilled: count((f) => f.ai.outcome === 'filled'),
    aiRefined: count((f) => f.ai.outcome === 'refined'),
    aiFailed: count((f) => f.ai.outcome === 'failed'),
  };
}

/** Empty frames (for example CAPTCHA sandboxes) cannot supersede a form run. */
export function latestFillRunId(
  runs: { runId: string; startedAt: number; totalScanned: number }[],
): string | undefined {
  const forms = runs.filter((run) => run.totalScanned > 0);
  return (forms.length ? forms : runs).reduce<{ runId: string; startedAt: number } | undefined>(
    (latest, run) => (!latest || run.startedAt > latest.startedAt ? run : latest),
    undefined,
  )?.runId;
}

/** A stale frame from a previous run must not enter the current totals. */
export function latestFillLogFrames(frames: FillLogFrame[]): FillLogFrame[] {
  const runId = latestFillRunId(
    frames.map(({ log }) => ({
      runId: log.runId,
      startedAt: log.startedAt,
      totalScanned: log.fields.length,
    })),
  );
  return runId ? frames.filter((frame) => frame.log.runId === runId) : [];
}

export const FILL_OUTCOME_LABELS: Record<FillOutcome, string> = {
  high_confidence: 'High confidence',
  review: 'Review value',
  not_matched: 'Not matched',
  missing_data: 'Missing profile data',
  kept: 'Kept current',
  excluded: 'Excluded',
  failed: 'Could not fill',
  manual: 'Entered manually',
};
export const RULE_OUTCOME_LABELS: Record<RuleOutcome, string> = {
  not_applicable: 'No rule applies',
  filled: 'Matched and filled',
  not_matched: 'No confident match',
  missing_data: 'No saved value',
  kept: 'Kept your existing answer',
  failed: 'Match found, but could not fill',
};
export const AI_OUTCOME_LABELS: Record<AIOutcome, string> = {
  not_sent: 'Not sent',
  sent: 'Sent, awaiting response',
  filled: 'Matched and filled',
  refined: 'Refined a rule-filled value',
  not_matched: 'No usable match',
  missing_data: 'No saved value',
  failed: 'AI assistance unavailable',
  fill_failed: 'Match found, but could not fill',
  no_response: 'No response for this field',
  skipped: 'Your answer changed while AI was checking',
};
