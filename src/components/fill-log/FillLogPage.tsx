import { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, ListChecks } from 'lucide-react';
import { loadFillLog, returnToForm } from '@/src/fill-log/client';
import { RETAINED_FILL_DETAILS } from '@/src/fill-log/retention';
import {
  checkedBy,
  confidenceText,
  fieldExplanation,
  filterMatches,
  matchesSearch,
  profileFieldName,
  profileMatch,
  ruleMethods,
  sourceNames,
  statusLabel,
  type FilterId,
} from '@/src/fill-log/presentation';
import {
  AI_OUTCOME_LABELS,
  RULE_OUTCOME_LABELS,
  finalFillSource,
  summarizeFillFields,
  type FillLogField,
  type FillLogSnapshot,
} from '@/src/autofill/fillLog';

const buttonCls =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800';
const chipCls = 'rounded-md border px-2.5 py-1.5 text-xs transition-colors';
const tones = {
  green:
    'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300',
  yellow:
    'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  red: 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300',
  gray: 'border-gray-300 bg-gray-100 text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300',
};
const colorFilters: [FilterId, string, keyof typeof tones, string][] = [
  ['green', 'Green', 'green', 'High confidence or confirmed by you'],
  ['yellow', 'Yellow', 'yellow', 'Filled answers that need review'],
  ['red', 'Red', 'red', 'No safe fill or the form rejected the value'],
  ['gray', 'Gray', 'gray', 'A profile match has no usable saved data'],
];
const sourceFilters: [FilterId, string][] = [
  ['learned', 'Learned mappings'],
  ['rules', 'Rules'],
  ['ai', 'AI'],
  ['manual', 'Manual'],
];

function reportIdentity(snapshot: FillLogSnapshot | null): string {
  return (
    String(snapshot?.tabId) +
    ':' +
    (snapshot?.frames.find((frame) => frame.log.status !== 'scanning')?.log.runId ?? '')
  );
}

export function FillLogPage({ tabId }: { tabId: number | null }) {
  const [snapshot, setSnapshot] = useState<FillLogSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [filter, setFilter] = useState<FilterId>('all');
  const [search, setSearch] = useState('');
  const [returnError, setReturnError] = useState(false);
  const currentReport = useRef<string | null>(null);
  const prefix = useId();
  useEffect(() => {
    let active = true;
    let sequence = 0;
    const reload = async () => {
      const request = ++sequence;
      try {
        const next = await loadFillLog(tabId);
        if (!active || request !== sequence) return;
        const key = reportIdentity(next);
        if (currentReport.current !== key) {
          currentReport.current = key;
          setFilter('all');
          setSearch('');
          setReturnError(false);
        }
        setSnapshot(next);
        setUnavailable(false);
        if (next.sourceClosed) setReturnError(false);
      } catch {
        if (active && request === sequence) {
          currentReport.current = null;
          setSnapshot(null);
          setUnavailable(true);
        }
      } finally {
        if (active && request === sequence) setLoading(false);
      }
    };
    const initial = setTimeout(() => void reload(), 0);
    const visible = () => {
      if (document.visibilityState === 'visible') void reload();
    };
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'session' && changes[RETAINED_FILL_DETAILS]) visible();
    };
    const storageChanges = typeof chrome !== 'undefined' ? chrome.storage?.onChanged : undefined;
    storageChanges?.addListener(changed);
    document.addEventListener('visibilitychange', visible);
    const timer = setInterval(visible, 1500);
    return () => {
      active = false;
      sequence++;
      clearTimeout(initial);
      clearInterval(timer);
      storageChanges?.removeListener(changed);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [tabId]);
  const frames = snapshot?.frames.filter((frame) => frame.log.status !== 'scanning') ?? [];
  const reportKey = reportIdentity(snapshot);
  const fields = frames.flatMap((frame) => {
    const indices: Record<string, number> = {};
    return frame.log.fields.map((field) => {
      indices[field.kind] = (indices[field.kind] ?? 0) + 1;
      return {
        field,
        frameId: frame.frameId,
        control:
          (frame.frameId === 0 ? 'Main page' : 'Embedded frame ' + frame.frameId) +
          ': ' +
          field.kind +
          '_' +
          indices[field.kind],
      };
    });
  });
  const counts = summarizeFillFields(fields.map((row) => row.field));
  const shown = fields.filter(
    (row) => filterMatches[filter](row.field) && matchesSearch(row.field, search),
  );
  const countFor = (id: FilterId) => fields.filter((row) => filterMatches[id](row.field)).length;
  const visibleSources = sourceFilters.filter(([id]) => countFor(id) > 0 || filter === id);
  const filledAt = Math.max(
    0,
    ...frames.map((frame) => frame.log.completedAt ?? frame.log.startedAt),
  );
  const modifiedAt = Math.max(0, ...frames.map((frame) => frame.log.modifiedAt ?? 0));
  const sourceUrl =
    snapshot?.pageUrl ??
    frames.find((frame) => frame.frameId === 0)?.log.url ??
    frames[0]?.log.url ??
    frames[0]?.log.origin;
  const sourceTab = snapshot?.tabId ?? tabId;
  const hasReport = fields.length > 0 || snapshot?.needsRefresh;
  const undone = frames.length > 0 && frames.every((frame) => frame.log.status === 'undone');
  const aiFailed = frames.some((frame) => frame.log.aiStatus === 'unavailable');
  const openSource = async () => {
    setReturnError(false);
    try {
      if (sourceTab !== null && sourceTab >= 0) await returnToForm(sourceTab);
    } catch {
      setReturnError(true);
    }
  };
  const neutralChip = (id: FilterId) =>
    [
      chipCls,
      filter === id
        ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/60 dark:text-blue-300'
        : 'border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800',
    ].join(' ');

  return (
    <section
      aria-label="Fill Details"
      className="min-w-0 max-w-6xl text-gray-900 dark:text-gray-100"
    >
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold">Fill Details</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            See how Job Buddy filled your form
          </p>
          {sourceUrl && hasReport && (
            <p className="mt-3 break-all text-xs text-gray-500 dark:text-gray-400">{sourceUrl}</p>
          )}
          {filledAt > 0 && (
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
              <span>
                Filled{' '}
                <time className="whitespace-nowrap">{new Date(filledAt).toLocaleString()}</time>
              </span>
              {modifiedAt > filledAt && (
                <span>
                  Modified{' '}
                  <time className="whitespace-nowrap">{new Date(modifiedAt).toLocaleString()}</time>
                </span>
              )}
            </div>
          )}
        </div>
        {hasReport && sourceTab !== null && sourceTab >= 0 && !snapshot?.sourceClosed && (
          <button type="button" className={buttonCls} onClick={() => void openSource()}>
            <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Return to Form
          </button>
        )}
      </header>
      {returnError && (
        <p role="alert" className="mb-4 text-sm text-red-700 dark:text-red-400">
          Could not open the source form. Its tab may have closed.
        </p>
      )}
      {loading ? (
        <p role="status" className="text-sm text-gray-600 dark:text-gray-300">
          Loading fill details…
        </p>
      ) : unavailable ? (
        <p role="status" className="text-sm text-gray-600 dark:text-gray-300">
          The source form is unavailable. Its tab may have closed.
        </p>
      ) : snapshot?.needsRefresh ? (
        <p role="status" className="text-sm text-gray-600 dark:text-gray-300">
          This form was filled with an earlier version. Refresh the form and fill again to view its
          fill details.
        </p>
      ) : fields.length === 0 ? (
        <div
          role="status"
          className="rounded-xl border border-dashed border-gray-300 px-6 py-12 text-center dark:border-gray-700"
        >
          <ListChecks
            aria-hidden="true"
            className="mx-auto mb-3 h-8 w-8 text-gray-400 dark:text-gray-500"
          />
          <p className="text-sm font-medium">No fill details yet</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Fill a job application form to see its results here.
          </p>
        </div>
      ) : (
        <>
          {snapshot?.sourceClosed && (
            <p role="status" className="mb-4 text-sm text-gray-500 dark:text-gray-400">
              This form is closed. Showing its last fill details.
            </p>
          )}
          {undone && (
            <p role="status" className="mb-4 text-sm text-gray-600 dark:text-gray-300">
              These fills were undone. Details show the completed run.
            </p>
          )}
          {aiFailed && (
            <p
              role="status"
              className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
            >
              AI assistance was unavailable for part or all of this fill. Existing rule-based fills
              were kept.
            </p>
          )}
          <section
            aria-label="Fill summary"
            className="mb-5 border-b border-gray-200 pb-5 dark:border-gray-800"
          >
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {(
                [
                  ['all', 'Detected', counts.detected],
                  ['filled', 'Filled', counts.filled],
                  ['notFilled', 'Not filled', counts.notFilled],
                  ['kept', 'Kept current', counts.kept],
                  ['skipped', 'Skipped', counts.excluded],
                ] as [FilterId, string, number][]
              ).map(([id, label, count]) => (
                <button
                  key={id}
                  type="button"
                  aria-label={label + ' (' + count + ')'}
                  aria-pressed={filter === id}
                  onClick={() => setFilter(id)}
                  className={[
                    'rounded-lg px-3 py-2 text-left transition-colors',
                    filter === id
                      ? 'bg-blue-50 dark:bg-blue-950/40'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-800',
                  ].join(' ')}
                >
                  <span className="block text-2xl font-semibold tabular-nums">{count}</span>
                  <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                    {label}
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="Fill sources">
              {visibleSources.length > 0 && (
                <span className="mr-1 text-xs text-gray-500 dark:text-gray-400">Filled by</span>
              )}
              {visibleSources.map(([id, label]) => (
                <button
                  type="button"
                  key={id}
                  className={neutralChip(id)}
                  aria-pressed={filter === id}
                  onClick={() => setFilter(id)}
                >
                  {label} ({countFor(id)})
                </button>
              ))}
              {visibleSources.length > 0 && (
                <span
                  aria-hidden="true"
                  className="mx-1 h-4 border-l border-gray-300 dark:border-gray-700"
                />
              )}
              <button
                type="button"
                className={neutralChip('sentAI')}
                aria-pressed={filter === 'sentAI'}
                onClick={() => setFilter('sentAI')}
                title="AI can also review rule-filled answers, so this count can overlap with the final fill sources."
              >
                Sent to AI ({counts.sentToAI})
              </button>
            </div>
          </section>
          <section aria-label="Filter fields" className="mb-3">
            <label htmlFor={prefix + '-search'} className="mb-1 block text-sm font-medium">
              Find a field
            </label>
            <input
              id={prefix + '-search'}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search field or profile names"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className={neutralChip('all')}
                aria-pressed={filter === 'all'}
                onClick={() => setFilter('all')}
              >
                All ({counts.detected})
              </button>
              {colorFilters.map(([id, label, tone, help]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={filter === id}
                  title={help}
                  onClick={() => setFilter(id)}
                  className={[
                    chipCls,
                    tones[tone],
                    filter === id
                      ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-blue-400 dark:ring-offset-gray-900'
                      : 'hover:brightness-95 dark:hover:brightness-125',
                  ].join(' ')}
                >
                  {label} ({countFor(id)})
                </button>
              ))}
            </div>
          </section>
          <p role="status" className="mb-1 text-xs text-gray-500 dark:text-gray-400">
            {shown.length} of {counts.detected} fields shown
          </p>
          {shown.length === 0 && (
            <p className="py-6 text-sm text-gray-600 dark:text-gray-300">
              No fields match this search or filter.
            </p>
          )}
          <div aria-label="Field results" className="divide-y divide-gray-200 dark:divide-gray-800">
            {shown.map(({ field, frameId, control }) => (
              <FieldRow
                key={reportKey + ':' + frameId + ':' + field.id}
                field={field}
                control={control}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function FieldRow({ field, control }: { field: FillLogField; control: string }) {
  const source = finalFillSource(field);
  const confidence = confidenceText(field);
  const explanation = fieldExplanation(field);
  const match = profileFieldName(profileMatch(field));
  const filled = source !== null;
  const tone =
    field.outcome === 'review'
      ? 'yellow'
      : field.outcome === 'missing_data'
        ? 'gray'
        : ['not_matched', 'failed'].includes(field.outcome)
          ? 'red'
          : filled
            ? 'green'
            : 'gray';
  return (
    <details className="group py-4">
      <summary className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto_auto] items-start gap-x-3 gap-y-2 rounded-sm">
        <span className="col-span-2 row-start-1 min-w-0 sm:col-span-1">
          <span className="block break-words text-sm font-medium">
            {field.label}
            {field.required && (
              <>
                <span aria-hidden="true" className="ml-1 text-red-600 dark:text-red-400">
                  *
                </span>
                <span className="sr-only"> required</span>
              </>
            )}
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
            {source ? (
              <span>{sourceNames[source]}</span>
            ) : field.outcome !== 'kept' && field.outcome !== 'excluded' ? (
              <span>{checkedBy(field)}</span>
            ) : null}
            {confidence && source !== 'ai' && <span>{confidence}</span>}
          </span>
          {explanation && (
            <span className="mt-1 block text-xs leading-relaxed text-gray-600 dark:text-gray-300">
              {explanation}
            </span>
          )}
          {!filled && match && field.outcome !== 'kept' && field.outcome !== 'excluded' && (
            <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
              {field.outcome === 'missing_data' ? 'Profile field: ' : 'Possible profile field: '}
              {match}
            </span>
          )}
        </span>
        <span
          className={[
            'col-span-2 col-start-1 row-start-2 justify-self-start rounded-md border px-2 py-1 text-xs sm:col-span-1 sm:col-start-2 sm:row-start-1',
            tones[tone],
          ].join(' ')}
        >
          {statusLabel(field)}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="col-start-3 row-start-1 mt-1 h-3.5 w-3.5 text-gray-400 transition-transform group-open:rotate-180"
        />
      </summary>
      <dl className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 border-l-2 border-gray-200 pl-4 text-xs dark:border-gray-700">
        <dt className="text-gray-500 dark:text-gray-400">Learned mapping</dt>
        <dd>
          {field.rule.layer === 'learned'
            ? RULE_OUTCOME_LABELS[field.rule.outcome]
            : field.rule.outcome === 'not_applicable'
              ? 'Not applicable'
              : 'No trusted match'}
        </dd>
        <dt className="text-gray-500 dark:text-gray-400">Rule result</dt>
        <dd>
          {field.rule.layer === 'learned'
            ? 'Not run after learned mapping'
            : RULE_OUTCOME_LABELS[field.rule.outcome]}
        </dd>
        <dt className="text-gray-500 dark:text-gray-400">AI result</dt>
        <dd>{AI_OUTCOME_LABELS[field.ai.outcome]}</dd>
        {field.rule.layer && (
          <>
            <dt className="text-gray-500 dark:text-gray-400">Rule method</dt>
            <dd>{ruleMethods[field.rule.layer]}</dd>
          </>
        )}
        {typeof field.rule.confidence === 'number' && (
          <>
            <dt className="text-gray-500 dark:text-gray-400">
              {field.rule.layer === 'learned' ? 'Learned match score' : 'Rule match score'}
            </dt>
            <dd>{Math.round(field.rule.confidence * 100)}%</dd>
          </>
        )}
        {field.ai.confidence && (
          <>
            <dt className="text-gray-500 dark:text-gray-400">AI confidence</dt>
            <dd className="capitalize">{field.ai.confidence}</dd>
          </>
        )}
        {field.rule.profilePath && (
          <>
            <dt className="text-gray-500 dark:text-gray-400">Rule profile field</dt>
            <dd className="break-all font-mono">{field.rule.profilePath}</dd>
          </>
        )}
        {field.ai.profilePath && (
          <>
            <dt className="text-gray-500 dark:text-gray-400">AI profile field</dt>
            <dd className="break-all font-mono">{field.ai.profilePath}</dd>
          </>
        )}
        <dt className="text-gray-500 dark:text-gray-400">Control</dt>
        <dd className="break-words font-mono">{control}</dd>
      </dl>
    </details>
  );
}
