import {
  AI_OUTCOME_LABELS,
  LEARNED_CHECK_LABELS,
  RULE_OUTCOME_LABELS,
  finalFillSource,
  type FillLogField,
} from '@/src/autofill/fillLog';
import { ruleMethods } from './presentation';

export type StageId = 'learned' | 'rules' | 'ai';
export interface StageDetail {
  label: string;
  value: string;
  mono?: boolean;
}
export interface FillStage {
  id: StageId;
  label: string;
  enabled: boolean;
  result: string;
  summary: string;
  details: StageDetail[];
}

/** Read recorded decisions only. Never rerun a mapper or manufacture missing stage data. */
export function fillStages(field: FillLogField): FillStage[] {
  const learnedMatch = field.rule.layer === 'learned';
  const check = field.learned;
  const trusted = check?.status === 'trusted' || (!check && learnedMatch);
  const learnedResult = trusted
    ? RULE_OUTCOME_LABELS[field.rule.outcome]
    : check
      ? LEARNED_CHECK_LABELS[check.status]
      : 'Not recorded';
  const ruleSummary = {
    not_applicable: 'Not run',
    filled: 'Filled',
    not_matched: 'No match',
    missing_data: 'Missing data',
    kept: 'Kept current',
    failed: 'Could not fill',
  }[field.rule.outcome];
  const aiSummary = {
    not_sent: 'Not sent',
    sent: 'Checking',
    filled: 'Filled',
    refined: 'Refined',
    not_matched: 'No match',
    missing_data: 'Missing data',
    failed: 'Unavailable',
    fill_failed: 'Could not fill',
    no_response: 'No response',
    skipped:
      field.ai.skipReason === 'cancelled'
        ? 'Cancelled'
        : field.ai.skipReason === 'profile_changed'
          ? 'Profile changed'
          : field.ai.skipReason === 'answer_changed'
            ? 'Answer changed'
            : 'Not applied',
  }[field.ai.outcome];
  const learnedSummary = trusted
    ? ruleSummary
    : !check
      ? 'Not recorded'
      : {
          not_checked: 'Not run',
          no_match: 'No match',
          unconfirmed: 'Unconfirmed',
          inactive: 'Inactive',
          incompatible: 'Not applicable',
          trusted: 'Trusted',
        }[check.status];
  const learnedDetails: StageDetail[] = [];
  if (trusted) learnedDetails.push({ label: 'Trust', value: 'Trusted mapping' });
  if (check?.confirmations !== undefined)
    learnedDetails.push({ label: 'Confirmations', value: String(check.confirmations) });
  if (check?.legacy) learnedDetails.push({ label: 'Origin', value: 'Legacy trusted mapping' });
  const learnedPath = trusted ? (field.rule.profilePath ?? check?.profilePath) : check?.profilePath;
  if (learnedPath) learnedDetails.push({ label: 'Profile field', value: learnedPath, mono: true });
  if (
    trusted &&
    field.rule.outcome === 'filled' &&
    field.rule.confidence !== undefined &&
    field.rule.matchConfidence !== undefined &&
    field.rule.confidence < field.rule.matchConfidence
  )
    learnedDetails.push({ label: 'Option matching', value: 'Needs review' });

  const ranRules = !learnedMatch && (field.rule.ran ?? field.rule.outcome !== 'not_applicable');
  const ruleDetails: StageDetail[] = [];
  if (ranRules) {
    if (field.rule.layer)
      ruleDetails.push({ label: 'Method', value: ruleMethods[field.rule.layer] });
    const score = field.rule.matchConfidence ?? field.rule.confidence;
    if (score !== undefined)
      ruleDetails.push({ label: 'Match score', value: Math.round(score * 100) + '%' });
    if (field.rule.profilePath)
      ruleDetails.push({ label: 'Profile field', value: field.rule.profilePath, mono: true });
    if (
      field.rule.outcome === 'filled' &&
      score !== undefined &&
      field.rule.confidence !== undefined &&
      field.rule.confidence < score
    )
      ruleDetails.push({ label: 'Option matching', value: 'Needs review' });
  }
  const aiDetails: StageDetail[] = [];
  if (field.ai.confidence)
    aiDetails.push({ label: 'Confidence', value: field.ai.confidence === 'high' ? 'High' : 'Low' });
  if (field.ai.profilePath)
    aiDetails.push({ label: 'Profile field', value: field.ai.profilePath, mono: true });
  if (field.ai.optionReview) aiDetails.push({ label: 'Option matching', value: 'Needs review' });
  return [
    {
      id: 'learned',
      label: 'Learned mappings',
      enabled: check ? check.status !== 'not_checked' : learnedMatch,
      result: learnedResult,
      summary: learnedSummary,
      details: learnedDetails,
    },
    {
      id: 'rules',
      label: 'Rules',
      enabled: ranRules,
      result: learnedMatch
        ? 'Not run after learned mapping'
        : !ranRules
          ? 'Not run for this field'
          : RULE_OUTCOME_LABELS[field.rule.outcome],
      summary: ranRules ? ruleSummary : 'Skipped',
      details: ruleDetails,
    },
    {
      id: 'ai',
      label: 'AI',
      enabled: field.ai.outcome !== 'not_sent',
      result:
        field.ai.outcome === 'skipped' && field.ai.skipReason
          ? {
              answer_changed: 'Your answer changed while AI was checking',
              profile_changed: 'Your profile changed while AI was checking',
              cancelled: 'Autofill was cancelled',
            }[field.ai.skipReason]
          : AI_OUTCOME_LABELS[field.ai.outcome],
      summary: aiSummary,
      details: aiDetails,
    },
  ];
}

export function defaultStage(field: FillLogField, stages: FillStage[]): StageId | null {
  const final = finalFillSource(field);
  const contributor =
    final && final !== 'manual'
      ? final
      : ['filled', 'refined'].includes(field.ai.outcome)
        ? 'ai'
        : field.rule.outcome === 'filled'
          ? field.rule.layer === 'learned'
            ? 'learned'
            : 'rules'
          : null;
  if (contributor && stages.some((stage) => stage.id === contributor && stage.enabled))
    return contributor;
  return [...stages].reverse().find((stage) => stage.enabled)?.id ?? null;
}
