import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, Circle, CircleAlert, X } from 'lucide-react';
import { LOGO_ICON_SRC } from '@/src/utils/branding';
import { loadFillLog, returnToForm } from '@/src/fill-log/client';
import {
  summarizeFillFields,
  FILL_OUTCOME_LABELS,
  RULE_OUTCOME_LABELS,
  AI_OUTCOME_LABELS,
} from '@/src/autofill/fillLog';
import type { FillLogField, FillLogSnapshot } from '@/src/autofill/fillLog';

type Filter = 'all' | 'attention' | 'rules' | 'ai' | 'kept' | 'excluded';
const needsAttention = (field: FillLogField) =>
  ['review', 'not_matched', 'missing_data', 'failed'].includes(field.outcome);
const filters: { id: Filter; label: string; matches: (field: FillLogField) => boolean }[] = [
  { id: 'all', label: 'All', matches: () => true },
  { id: 'attention', label: 'Needs attention', matches: needsAttention },
  { id: 'rules', label: 'Rules', matches: (f) => f.rule.outcome === 'filled' },
  { id: 'ai', label: 'Sent to AI', matches: (f) => f.ai.outcome !== 'not_sent' },
  { id: 'kept', label: 'Kept current', matches: (f) => f.outcome === 'kept' },
  { id: 'excluded', label: 'Excluded', matches: (f) => f.outcome === 'excluded' },
];
const buttonCls =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700';
const layers: Record<string, string> = {
  learned: 'Learned mapping',
  autocomplete: 'Autocomplete attribute',
  dictionary_exact: 'Exact dictionary match',
  fuzzy: 'Similar field label',
  custom_link: 'Custom link label',
  checkbox_status: 'Current-status checkbox',
  context: 'Nearby context',
  none: 'No match',
};

export function FillLogPage({ tabId }: { tabId: number | null }) {
  const [snapshot, setSnapshot] = useState<FillLogSnapshot | null>(null);
  const [loading, setLoading] = useState(tabId !== null);
  const [unavailable, setUnavailable] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<'overview' | 'fields'>('overview');
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [returnError, setReturnError] = useState(false);
  const sequence = useRef(0);
  const live = useRef(true);
  const tabsRef = useRef<HTMLDivElement>(null);
  const prefix = useId();
  const reload = useCallback(async () => {
    const request = ++sequence.current;
    if (tabId === null) return;
    try {
      const next = await loadFillLog(tabId);
      if (live.current && request === sequence.current) {
        setSnapshot(next);
        setUnavailable(false);
      }
    } catch {
      if (live.current && request === sequence.current) {
        setSnapshot(null);
        setUnavailable(true);
      }
    } finally {
      if (live.current && request === sequence.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [tabId]);
  useEffect(() => {
    live.current = true;
    const initial = setTimeout(() => void reload(), 0);
    const visible = () => {
      if (document.visibilityState === 'visible') void reload();
    };
    document.addEventListener('visibilitychange', visible);
    const timer = setInterval(visible, 1500);
    return () => {
      live.current = false;
      clearTimeout(initial);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [reload]);
  const frames = snapshot?.frames.filter((frame) => frame.log.status !== 'scanning') ?? [];
  const fields = frames.flatMap((frame) =>
    frame.log.fields.map((field) => ({ field, frameId: frame.frameId, origin: frame.log.origin })),
  );
  const counts = summarizeFillFields(fields.map((row) => row.field));
  const activeFilter = filters.find((item) => item.id === filter)!;
  const shown = fields.filter(
    (row) =>
      activeFilter.matches(row.field) &&
      `${row.field.label} ${row.field.kind}`.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const timestamp = frames.reduce(
    (max, frame) => Math.max(max, frame.log.completedAt ?? frame.log.startedAt),
    0,
  );
  const source = frames.find((frame) => frame.frameId === 0)?.log.origin ?? frames[0]?.log.origin;
  const aiFailed = frames.some((frame) => frame.log.aiStatus === 'unavailable');
  const undone = frames.length > 0 && frames.every((frame) => frame.log.status === 'undone');
  const openSource = async () => {
    setReturnError(false);
    try {
      if (tabId !== null) await returnToForm(tabId);
    } catch {
      setReturnError(true);
    }
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 text-gray-900 dark:text-gray-100 sm:px-8 sm:py-10">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <img src={LOGO_ICON_SRC} className="h-8 w-8" alt="" />
          <div>
            <h1 className="text-xl font-semibold">Fill Log</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {source && source !== 'null' ? source : 'Job Buddy'}
              {timestamp > 0 && <> · Latest fill at {new Date(timestamp).toLocaleString()}</>}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {tabId !== null && (
            <button type="button" className={buttonCls} onClick={() => void openSource()}>
              <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Back to Form
            </button>
          )}
          <button
            type="button"
            className={buttonCls}
            onClick={() => {
              setRefreshing(true);
              void reload();
            }}
            disabled={refreshing || tabId === null}
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>
      {returnError && (
        <p role="alert" className="mb-4 text-sm text-red-700 dark:text-red-400">
          Could not open the source form. Its tab may have closed.
        </p>
      )}
      {loading ? (
        <p role="status" className="text-sm text-gray-600 dark:text-gray-300">
          Loading fill log…
        </p>
      ) : unavailable ? (
        <p role="status" className="text-sm text-gray-600 dark:text-gray-300">
          The source form is unavailable. Its tab may have closed.
        </p>
      ) : snapshot?.needsRefresh ? (
        <p role="status" className="text-sm text-gray-600 dark:text-gray-300">
          This form was filled with an earlier version. Refresh the form and fill again to create
          its log.
        </p>
      ) : frames.length === 0 ? (
        <p role="status" className="text-sm text-gray-600 dark:text-gray-300">
          No completed fill log is available. Open the form and fill again to create one.
        </p>
      ) : (
        <>
          {undone && (
            <p role="status" className="mb-4 rounded-lg bg-gray-100 p-3 text-sm dark:bg-gray-800">
              These fills were undone. The log shows the completed run.
            </p>
          )}
          {aiFailed && (
            <p
              role="status"
              className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-300"
            >
              AI assistance was unavailable for part or all of this fill. Existing rule-based fills
              were kept.
            </p>
          )}
          <div
            ref={tabsRef}
            role="tablist"
            aria-label="Fill log views"
            className="mb-6 flex gap-6 border-b border-gray-200 dark:border-gray-700"
          >
            {(['overview', 'fields'] as const).map((tab) => (
              <button
                key={tab}
                id={`${prefix}-${tab}-tab`}
                role="tab"
                type="button"
                tabIndex={view === tab ? 0 : -1}
                aria-selected={view === tab}
                aria-controls={`${prefix}-${tab}`}
                onClick={() => setView(tab)}
                onKeyDown={(event) => {
                  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                    event.preventDefault();
                    const next =
                      event.key === 'Home'
                        ? 'overview'
                        : event.key === 'End'
                          ? 'fields'
                          : view === 'overview'
                            ? 'fields'
                            : 'overview';
                    setView(next);
                    tabsRef.current
                      ?.querySelector<HTMLButtonElement>(`[id="${prefix}-${next}-tab"]`)
                      ?.focus();
                  }
                }}
                className={`border-b-2 px-1 pb-3 text-sm font-medium ${view === tab ? 'border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-400' : 'border-transparent text-gray-600 dark:text-gray-400'}`}
              >
                {tab === 'overview' ? 'Overview' : 'Fields'}
              </button>
            ))}
          </div>
          <section
            id={`${prefix}-overview`}
            role="tabpanel"
            aria-labelledby={`${prefix}-overview-tab`}
            hidden={view !== 'overview'}
          >
            <div className="mb-6 flex flex-wrap gap-x-10 gap-y-4">
              {[
                ['Detected', counts.detected],
                ['Filled', counts.filled],
                ['Kept current', counts.kept],
                ['Not filled', counts.notFilled],
                ...(counts.excluded ? [['Excluded', counts.excluded]] : []),
              ].map(([label, count]) => (
                <div key={label}>
                  <p className="text-2xl font-semibold tabular-nums">{count}</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{label}</p>
                </div>
              ))}
            </div>
            <dl className="divide-y divide-gray-200 dark:divide-gray-700">
              <ProcessRow
                count={counts.ruleFilled}
                title="Filled by rules"
                description="Matched using saved mappings and profile data."
              />
              <ProcessRow
                count={counts.sentToAI}
                title="Sent to AI"
                description={
                  counts.sentToAI
                    ? 'Fields needing further matching or review.'
                    : frames.some((frame) => frame.log.aiStatus === 'unavailable')
                      ? 'No AI request was made for these fields.'
                      : 'No fields needed AI assistance.'
                }
              />
              <ProcessRow
                count={counts.aiFilled}
                title="New fills by AI"
                description="Previously unfilled fields filled with AI assistance."
              />
              {counts.aiRefined > 0 && (
                <ProcessRow
                  count={counts.aiRefined}
                  title="Refined by AI"
                  description="Rule-filled values checked and updated by AI."
                />
              )}
              {counts.review > 0 && (
                <ProcessRow
                  count={counts.review}
                  title="Filled values to review"
                  description="Check the yellow fields before submitting."
                />
              )}
              <ProcessRow
                count={counts.notFilled}
                title="Need your input"
                description={`${counts.unmatched} unmatched, ${counts.missing} missing profile data${counts.failed ? `, ${counts.failed} could not be filled` : ''}.`}
              />
              {counts.manual > 0 && (
                <ProcessRow
                  count={counts.manual}
                  title="Entered manually"
                  description="Updated on the form after autofill."
                />
              )}
            </dl>
            {counts.aiRefined > 0 && (
              <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
                AI also reviewed rule-filled values. Processing-stage counts can overlap; each field
                is counted once in the final result.
              </p>
            )}
            {counts.excluded > 0 && (
              <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
                Consent questions are excluded from autofill and do not count as unfilled.
              </p>
            )}
          </section>
          <section
            id={`${prefix}-fields`}
            role="tabpanel"
            aria-labelledby={`${prefix}-fields-tab`}
            hidden={view !== 'fields'}
          >
            <label htmlFor={`${prefix}-search`} className="mb-1 block text-sm font-medium">
              Find a field
            </label>
            <input
              id={`${prefix}-search`}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search field names"
              className="mb-4 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800"
            />
            <div aria-label="Filter fields" className="mb-4 flex flex-wrap gap-2">
              {filters
                .filter(
                  (item) =>
                    item.id === 'all' ||
                    item.id === filter ||
                    fields.some((row) => item.matches(row.field)),
                )
                .map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={filter === item.id}
                    onClick={() => setFilter(item.id)}
                    className={`${buttonCls} ${filter === item.id ? 'border-blue-400 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : ''}`}
                  >
                    {item.label} ({fields.filter((row) => item.matches(row.field)).length})
                  </button>
                ))}
            </div>
            <p role="status" className="mb-2 text-xs text-gray-500 dark:text-gray-400">
              {shown.length} field{shown.length === 1 ? '' : 's'} shown
            </p>
            {shown.length === 0 && (
              <p className="py-6 text-sm text-gray-600 dark:text-gray-300">
                No fields match this search or filter.
              </p>
            )}
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {shown.map(({ field, frameId, origin }) => (
                <FieldRow
                  key={`${frameId}:${field.id}`}
                  field={field}
                  frameId={frameId}
                  origin={origin}
                  multipleFrames={frames.length > 1}
                />
              ))}
            </div>
          </section>
          <footer className="mt-8 border-t border-gray-200 pt-4 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
            Latest run only. Colors describe the result; rules and AI describe how it was reached.
          </footer>
        </>
      )}
    </main>
  );
}

function ProcessRow({
  count,
  title,
  description,
}: {
  count: number;
  title: string;
  description: string;
}) {
  return (
    <div className="grid grid-cols-[2rem_1fr] items-baseline gap-x-4 py-4">
      <dt className="col-start-2 text-sm font-medium">{title}</dt>
      <dd className="col-start-1 row-start-1 row-span-2 text-right text-lg font-semibold tabular-nums">
        {count}
      </dd>
      <dd className="col-start-2 mt-1 text-xs text-gray-500 dark:text-gray-400">{description}</dd>
    </div>
  );
}

function FieldRow({
  field,
  frameId,
  origin,
  multipleFrames,
}: {
  field: FillLogField;
  frameId: number;
  origin: string;
  multipleFrames: boolean;
}) {
  const color = ['high_confidence', 'manual'].includes(field.outcome)
    ? 'text-green-700 dark:text-green-400'
    : field.outcome === 'review'
      ? 'text-amber-700 dark:text-amber-400'
      : ['not_matched', 'failed'].includes(field.outcome)
        ? 'text-red-700 dark:text-red-400'
        : 'text-gray-500 dark:text-gray-400';
  const Icon =
    field.outcome === 'review'
      ? CircleAlert
      : ['high_confidence', 'manual'].includes(field.outcome)
        ? Check
        : ['not_matched', 'failed'].includes(field.outcome)
          ? X
          : Circle;
  const finalLabel =
    field.reason === 'manual_clear' ? 'Cleared manually' : FILL_OUTCOME_LABELS[field.outcome];
  return (
    <details className="group py-4">
      <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-4 gap-y-1 rounded-sm">
        <span className="min-w-0 flex-1 break-words text-sm font-medium">{field.label}</span>
        {field.source && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {field.source === 'ai'
              ? 'AI'
              : field.source === 'rules'
                ? 'Rules'
                : field.source === 'manual'
                  ? 'Manual'
                  : ''}
          </span>
        )}
        <span className={`inline-flex items-center gap-1 text-xs ${color}`}>
          <Icon aria-hidden="true" className="h-3.5 w-3.5" />
          {finalLabel}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="h-3.5 w-3.5 shrink-0 text-gray-400 group-open:rotate-180"
        />
      </summary>
      <dl className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs">
        <dt className="text-gray-500 dark:text-gray-400">Rule result</dt>
        <dd>{RULE_OUTCOME_LABELS[field.rule.outcome]}</dd>
        <dt className="text-gray-500 dark:text-gray-400">AI result</dt>
        <dd>{AI_OUTCOME_LABELS[field.ai.outcome]}</dd>
        <dt className="text-gray-500 dark:text-gray-400">Final outcome</dt>
        <dd>{finalLabel}</dd>
        {field.reason === 'consent' && (
          <>
            <dt className="text-gray-500 dark:text-gray-400">Reason</dt>
            <dd>Consent is left for you to decide.</dd>
          </>
        )}
        <dt className="text-gray-500 dark:text-gray-400">Control</dt>
        <dd className="capitalize">{field.kind}</dd>
        {field.rule.layer && (
          <>
            <dt className="text-gray-500 dark:text-gray-400">Rule method</dt>
            <dd>{layers[field.rule.layer]}</dd>
          </>
        )}
        {typeof field.rule.confidence === 'number' && (
          <>
            <dt className="text-gray-500 dark:text-gray-400">Rule confidence</dt>
            <dd className="tabular-nums">{Math.round(field.rule.confidence * 100)}%</dd>
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
        <dt className="text-gray-500 dark:text-gray-400">Field ID</dt>
        <dd className="break-all font-mono">
          {frameId}:{field.id}
        </dd>
        {multipleFrames && (
          <>
            <dt className="text-gray-500 dark:text-gray-400">Frame</dt>
            <dd className="break-all">
              {frameId === 0 ? 'Main page' : `Embedded frame ${frameId}`} · {origin}
            </dd>
          </>
        )}
      </dl>
    </details>
  );
}
