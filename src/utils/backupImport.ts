import type { ApplicationEntry, LearnedMappings, LearnedMappingValue } from '@/src/types/storage';
import type { FieldChange } from '@/src/resume-ai/types';
import type { InvalidField } from './profileValidator';
import { mergeLearnedMappings } from './storage';
import { equalJsonValues } from './equalJsonValues';

export const MAPPINGS_CHANGE_ID = 'backup.learnedMappings';
export const HISTORY_CHANGE_ID = 'backup.applicationHistory';

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const safeKey = (key: string) =>
  key.trim() && !['__proto__', 'constructor', 'prototype'].includes(key);

/** Validate backup-only data separately from the profile schema. */
export function validateBackupData(raw: Record<string, unknown>) {
  const invalidFields: InvalidField[] = [];
  let learnedMappings: LearnedMappings | undefined;
  let applicationHistory: ApplicationEntry[] | undefined;
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
          const valid =
            safeKey(signal) &&
            ((typeof entry === 'string' && !!entry.trim()) ||
              (record(entry) &&
                typeof entry.path === 'string' &&
                !!entry.path.trim() &&
                typeof entry.count === 'number' &&
                Number.isFinite(entry.count) &&
                entry.count >= 0 &&
                (entry.label === undefined || typeof entry.label === 'string')));
          if (!valid)
            invalidFields.push({
              path: 'Learned Mappings',
              reason: `Invalid mapping: ${domain} / ${signal}`,
            });
          else if (typeof entry === 'string') group[signal] = entry;
          else {
            const value = entry as Record<string, unknown>;
            group[signal] = {
              path: value.path as string,
              count: value.count as number,
              ...(typeof value.label === 'string' ? { label: value.label } : {}),
            };
          }
        }
        if (Object.keys(group).length) learnedMappings[domain] = group;
      }
    }
  }
  if (raw.applicationHistory !== undefined) {
    if (!Array.isArray(raw.applicationHistory))
      invalidFields.push({ path: 'Application History', reason: 'Expected an application list' });
    else {
      applicationHistory = [];
      for (const [index, entry] of raw.applicationHistory.entries()) {
        let validUrl = false;
        if (record(entry) && typeof entry.url === 'string') {
          try {
            validUrl = ['http:', 'https:'].includes(new URL(entry.url).protocol);
          } catch {
            /* Invalid URL. */
          }
        }
        if (
          !record(entry) ||
          !['id', 'jobTitle', 'company', 'url', 'appliedAt'].every(
            (key) => typeof entry[key] === 'string',
          ) ||
          !entry.id ||
          !validUrl ||
          !Number.isFinite(Date.parse(entry.appliedAt as string)) ||
          !['applied', 'duplicate_warned'].includes(entry.status as string)
        ) {
          invalidFields.push({
            path: 'Application History',
            reason: `Invalid application at position ${index + 1}`,
          });
          continue;
        }
        applicationHistory.push({
          id: entry.id as string,
          jobTitle: entry.jobTitle as string,
          company: entry.company as string,
          url: entry.url as string,
          appliedAt: entry.appliedAt as string,
          status: entry.status as ApplicationEntry['status'],
        });
      }
    }
  }
  return { learnedMappings, applicationHistory, invalidFields };
}

/** Add missing applications without overwriting an existing application ID. */
export function mergeApplicationHistory(
  local: ApplicationEntry[],
  incoming: ApplicationEntry[],
): ApplicationEntry[] {
  const merged = new Map(local.map((entry) => [entry.id, entry]));
  for (const entry of incoming) if (!merged.has(entry.id)) merged.set(entry.id, entry);
  return [...merged.values()];
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
  localHistory: ApplicationEntry[] = [],
  incomingHistory?: ApplicationEntry[],
): FieldChange[] {
  const changes: FieldChange[] = [];
  if (incomingMappings) {
    const merged = mergeLearnedMappings(localMappings, incomingMappings);
    changes.push({
      id: MAPPINGS_CHANGE_ID,
      label: 'Learned Mappings',
      section: 'Learned Mappings',
      currentValue: localMappings,
      suggestedValue: merged,
      displayCurrent: mappingsDisplay(localMappings),
      displaySuggested: mappingsDisplay(merged),
      status: equalJsonValues(localMappings, merged)
        ? 'unchanged'
        : Object.keys(localMappings).length
          ? 'conflict'
          : 'new',
      accepted: !equalJsonValues(localMappings, merged),
      hasIncomingValue: Object.keys(incomingMappings).length > 0,
      note: 'Mappings are merged. Existing mappings are kept when equally trusted.',
    });
  }
  if (incomingHistory) {
    const merged = mergeApplicationHistory(localHistory, incomingHistory);
    const display = (rows: ApplicationEntry[]) =>
      rows
        .map(
          (entry) =>
            `${entry.jobTitle} at ${entry.company}\n${entry.appliedAt} · ${entry.status === 'applied' ? 'Applied' : 'Duplicate warned'}\n${entry.url}`,
        )
        .join('\n\n');
    changes.push({
      id: HISTORY_CHANGE_ID,
      label: 'Application History',
      section: 'Application History',
      currentValue: localHistory,
      suggestedValue: merged,
      displayCurrent: display(localHistory),
      displaySuggested: display(merged),
      status: equalJsonValues(localHistory, merged)
        ? 'unchanged'
        : localHistory.length
          ? 'conflict'
          : 'new',
      accepted: !equalJsonValues(localHistory, merged),
      hasIncomingValue: incomingHistory.length > 0,
      note: 'Applications are merged by ID. Existing applications are kept.',
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
    applicationHistory: changes.find(
      (change) =>
        change.id === HISTORY_CHANGE_ID && change.status !== 'unchanged' && change.accepted,
    )?.suggestedValue as ApplicationEntry[] | undefined,
  };
}

export const acceptAllChanges = (changes: FieldChange[]) =>
  changes.map((change) => ({ ...change, accepted: change.status !== 'unchanged' }));
