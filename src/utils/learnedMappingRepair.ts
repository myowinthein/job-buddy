import type { LearnedMappings, LearnedMappingValue } from '../types/storage';
import type { FieldSignals } from '../autofill/signals';
import { normalize } from '../autofill/normalizer';
import { genericLearnedSignal, learningQuestion } from '../autofill/learnedContext';
import { isLearnedPath, safeMappingKey } from './learnedMappingData';

export const LEARNED_REPAIR_VERSION = 1;

export interface LearnedRepairField {
  keys: string[];
  question: string;
}
interface RepairCheckpoint {
  version: number;
  source: string;
  form: string;
}
export type LearnedRepairState = Record<string, RepairCheckpoint>;

export function learnedRepairField(signals: FieldSignals): LearnedRepairField {
  return {
    keys: [
      ...new Set(
        [signals.name, signals.id, signals.placeholder, signals.ariaLabel, signals.label]
          .filter(Boolean)
          .map(normalize)
          .filter(safeMappingKey),
      ),
    ].sort(),
    question: learningQuestion(signals),
  };
}

export function validRepairFields(value: unknown): value is LearnedRepairField[] {
  return (
    Array.isArray(value) &&
    value.length <= 1000 &&
    value.every(
      (field) =>
        field &&
        Array.isArray(field.keys) &&
        field.keys.length <= 5 &&
        field.keys.every((key: unknown) => typeof key === 'string' && safeMappingKey(key)) &&
        typeof field.question === 'string' &&
        field.question.length <= 1000,
    )
  );
}

async function fingerprint(value: unknown): Promise<string> {
  const serialized = JSON.stringify(value, (_key, item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    return Object.fromEntries(
      Object.keys(item)
        .sort()
        .map((key) => [key, item[key]]),
    );
  });
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function needsQuestion(value: LearnedMappingValue): boolean {
  return typeof value === 'string' || (!value.inactive && (!value.label || !value.question));
}

function recoverQuestion(
  key: string,
  value: LearnedMappingValue,
  fields: LearnedRepairField[],
  mappings: LearnedMappings[string],
): LearnedMappingValue {
  if (fields.length !== 1 || (typeof value !== 'string' && value.inactive)) return value;
  const question = fields[0].question.trim();
  const normalized = normalize(question);
  if (!normalized || genericLearnedSignal(normalized)) return value;
  const path = typeof value === 'string' ? value : value.path;
  const metadata = typeof value === 'string' ? undefined : value;
  const compatible = (text: string) =>
    normalize(text) === normalized || normalize(text) === normalize(question.slice(0, 120));
  // An existing full question must agree. Internal IDs alone cannot establish identity.
  if (metadata?.question && normalize(metadata.question) !== normalized) return value;
  if (metadata?.label && !compatible(metadata.label)) return value;
  const anchor = mappings[normalized];
  const anchored =
    anchor !== undefined &&
    (typeof anchor === 'string'
      ? anchor === path
      : anchor.path === path &&
        !anchor.inactive &&
        (!anchor.question || normalize(anchor.question) === normalized) &&
        (!anchor.label || compatible(anchor.label))) &&
    fields[0].keys.includes(normalized);
  if (!metadata?.question && !(metadata?.label && compatible(metadata.label)) && !anchored)
    return value;
  if (!fields[0].keys.includes(key)) return value;
  if (metadata?.label && metadata.question) return value;
  return {
    ...(metadata ?? { path, count: 2 }),
    label: question.slice(0, 120),
    question,
  };
}

/** Local, deterministic repairs. Checkpoints are separate from portable mapping data. */
export async function repairMappingDomain(
  mappings: LearnedMappings[string],
  fields: LearnedRepairField[],
  previous: LearnedRepairState,
  profileId: string,
): Promise<{ mappings: LearnedMappings[string]; state: LearnedRepairState }> {
  const byKey = new Map<string, LearnedRepairField[]>();
  for (const field of fields)
    for (const key of new Set(field.keys)) {
      const matches = byKey.get(key) ?? [];
      matches.push(field);
      byKey.set(key, matches);
    }
  const repaired = { ...mappings };
  const state: LearnedRepairState = {};
  await Promise.all(
    Object.entries(mappings).map(async ([key, value]) => {
      const evidence = byKey.get(key) ?? [];
      const source = await fingerprint([profileId, value]);
      const form = needsQuestion(value) && evidence.length ? await fingerprint(evidence) : '';
      const checkpoint = previous[key];
      if (
        checkpoint?.version === LEARNED_REPAIR_VERSION &&
        checkpoint.source === source &&
        checkpoint.form === form
      ) {
        state[key] = checkpoint;
        return;
      }
      const path = typeof value === 'string' ? value : value.path;
      const label = typeof value === 'string' ? '' : value.question || value.label || '';
      if (
        !isLearnedPath(path) ||
        genericLearnedSignal(key) ||
        normalize(label) === 'languagetranslatewidget'
      )
        repaired[key] = {
          ...(typeof value === 'string' ? { path, count: 2 } : value),
          inactive: true,
        };
      else repaired[key] = recoverQuestion(key, value, evidence, mappings);
      state[key] = {
        version: LEARNED_REPAIR_VERSION,
        source: repaired[key] === value ? source : await fingerprint([profileId, repaired[key]]),
        form: needsQuestion(repaired[key]) ? form : '',
      };
    }),
  );
  return { mappings: repaired, state };
}
