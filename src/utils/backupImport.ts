import { selectChange } from '@/src/resume-ai/entrySelection';
import type { LearnedMappings, LearnedMappingValue } from '@/src/types/storage';
import type { FieldChange } from '@/src/resume-ai/types';
import type { InvalidField } from './profileValidator';
import { mergeLearnedMappings } from './storage';
import { equalJsonValues } from './equalJsonValues';
import { safeMappingKey as safeKey, validMapping, inactiveMapping } from './learnedMappingData';
import { validatedMappingIndices } from './learnedMappingProfile';
import type { EntryIndexMap } from './profileValidator';

export const MAPPINGS_CHANGE_ID = 'backup.learnedMappings';

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** Validate backup-only data separately from the profile schema. */
export function validateBackupData(raw: Record<string, unknown>, indices?: EntryIndexMap) {
  const invalidFields: InvalidField[] = [];
  let learnedMappings: LearnedMappings | undefined;
  if (raw.learnedMappings !== undefined) {
    if (!record(raw.learnedMappings))
      invalidFields.push({ path: 'Learned Mappings', reason: 'Expected a mapping object' });
    else {
      learnedMappings = {};
      for (const [domain, entries] of Object.entries(raw.learnedMappings)) {
        if (!safeKey(domain) || !record(entries)) {
          invalidFields.push({
            path: 'Learned Mappings',
            reason: `Invalid mapping group: ${domain}`,
          });
          continue;
        }
        const group: Record<string, LearnedMappingValue> = {};
        for (const [signal, entry] of Object.entries(entries)) {
          const valid = safeKey(signal) && (validMapping(entry) || inactiveMapping(entry));
          if (!valid)
            invalidFields.push({
              path: 'Learned Mappings',
              reason: `Invalid mapping: ${domain} / ${signal}`,
            });
          else if (typeof entry === 'string') group[signal] = entry;
          else {
            const value = entry;
            group[signal] = {
              path: value.path as string,
              count: value.count as number,
              ...(typeof value.label === 'string' ? { label: value.label } : {}),
              ...(typeof value.question === 'string' ? { question: value.question } : {}),
              ...(value.scope === 'field' || value.scope === 'entry' ? { scope: value.scope } : {}),
              ...(value.inactive ? { inactive: true as const } : {}),
            };
          }
        }
        if (Object.keys(group).length) learnedMappings[domain] = group;
      }
    }
  }
  return { learnedMappings: learnedMappings && indices ? validatedMappingIndices(learnedMappings, indices) : learnedMappings, invalidFields };
}

function mappingsDisplay(mappings: LearnedMappings): string {
  return Object.entries(mappings)
    .flatMap(([domain, entries]) =>
      Object.entries(entries).map(
        ([signal, entry]) =>
          `${domain} · ${typeof entry === 'string' ? signal : entry.label || signal}: ${typeof entry === 'string' ? entry : entry.path}`,
      ),
    )
    .join('\n');
}

export function backupDataChanges(
  localMappings: LearnedMappings,
  incomingMappings: LearnedMappings | undefined,
  mode: 'update' | 'replace' = 'update',
): FieldChange[] {
  const changes: FieldChange[] = [];
  if (incomingMappings || mode === 'replace') {
    const merged =
      mode === 'replace'
        ? (incomingMappings ?? {})
        : mergeLearnedMappings(localMappings, incomingMappings!);
    changes.push({
      id: MAPPINGS_CHANGE_ID,
      label: 'Learned Mappings',
      section: 'Learned Mappings',
      currentValue: localMappings,
      suggestedValue: merged,
      displayCurrent: mappingsDisplay(localMappings),
      displaySuggested: mappingsDisplay(merged),
      status:
        mode === 'replace' && Object.keys(merged).length
          ? Object.keys(localMappings).length
            ? 'conflict'
            : 'new'
          : equalJsonValues(localMappings, merged)
            ? 'unchanged'
            : Object.keys(localMappings).length
              ? 'conflict'
              : 'new',
      accepted:
        mode === 'replace'
          ? Object.keys(merged).length > 0 || Object.keys(localMappings).length > 0
          : !equalJsonValues(localMappings, merged),
      hasIncomingValue: Object.keys(incomingMappings ?? {}).length > 0,
      note:
        mode === 'replace'
          ? 'Current mappings will be replaced. Unselected mappings will be cleared.'
          : 'Mappings are merged. Existing choices are kept when paths conflict.',
    });
  }
  return changes;
}

export function selectedBackupData(changes: FieldChange[]) {
  return {
    learnedMappings: changes.find(
      (change) =>
        change.id === MAPPINGS_CHANGE_ID && change.status !== 'unchanged' && change.accepted,
    )?.suggestedValue as LearnedMappings | undefined,
  };
}

export const acceptAllChanges = (changes: FieldChange[]) =>
  changes.map((change) => selectChange(change, change.status !== 'unchanged'));
