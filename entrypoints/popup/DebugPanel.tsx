import { useMemo } from 'react';
import type { DebugSession, DebugAIField } from '@/src/autofill/debug';
import { useEscapeToClose } from '@/src/components/ui/useEscapeToClose';
import { ExpandableCard } from '@/src/components/options/shared/ExpandableCard';

const LAYER_LABEL: Record<string, string> = {
  learned:          'Learned',
  autocomplete:     'Autocomplete',
  dictionary_exact: 'Dictionary',
  fuzzy:            'Fuzzy',
  context:          'Context',
  none:             'No match',
};

const STATE_DOT: Record<string, string> = {
  green:     'bg-green-500',
  yellow:    'bg-yellow-500',
  red:       'bg-red-500',
  gray:      'bg-gray-400',
  unchanged: 'bg-gray-300 dark:bg-gray-600',
};

const STATE_LABEL: Record<string, string> = {
  green:     'Green',
  yellow:    'Yellow',
  red:       'Red',
  gray:      'Gray',
  unchanged: 'Unchanged',
};

function StateDot({ state }: { state: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block w-2 h-2 rounded-full ${STATE_DOT[state] ?? 'bg-gray-300'}`} />
      <span className="text-[10px] text-gray-500 dark:text-gray-400">{STATE_LABEL[state] ?? state}</span>
    </span>
  );
}

// Quick scan overview — otherwise the only way to gauge how a scan went is
// to manually count colored dots across two separate accordion sections.
function SummaryBar({ summary }: { summary: DebugSession['summary'] }) {
  const total = summary.green + summary.yellow + summary.red + summary.gray;
  const counts: { state: keyof DebugSession['summary']; count: number }[] = [
    { state: 'green',  count: summary.green },
    { state: 'yellow', count: summary.yellow },
    { state: 'red',    count: summary.red },
    { state: 'gray',   count: summary.gray },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 border-b border-gray-200 dark:border-gray-700 text-[11px] text-gray-600 dark:text-gray-400 shrink-0">
      <span className="font-medium text-gray-800 dark:text-gray-200">{total} field{total !== 1 ? 's' : ''} scanned</span>
      {counts.filter((c) => c.count > 0).map((c) => (
        <span key={c.state} className="inline-flex items-center gap-1">
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${STATE_DOT[c.state]}`} />
          {c.count}
        </span>
      ))}
    </div>
  );
}

export function DebugPanel({
  session,
  onClose,
}: {
  session: DebugSession;
  onClose: () => void;
}) {
  const aiByFieldId = useMemo(
    () => new Map(session.ai.map((a) => [a.fieldId, a])),
    [session.ai],
  );
  const scannerByFieldId = useMemo(
    () => new Map(session.scanner.map((s) => [s.fieldId, s])),
    [session.scanner],
  );

  // 'unchanged' means AI reviewed the field and produced no fill — the
  // common case, and mostly noise for a field-by-field debugging read.
  // Fields AI actually acted on are shown in full detail; the rest are
  // condensed to a single muted line each further down.
  const [aiChanged, aiUnchanged] = useMemo(() => {
    const changed:   DebugAIField[] = [];
    const unchanged: DebugAIField[] = [];
    for (const a of aiByFieldId.values()) (a.finalState === 'unchanged' ? unchanged : changed).push(a);
    return [changed, unchanged];
  }, [aiByFieldId]);

  useEscapeToClose(onClose);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-3"
      onClick={onClose}
    >
      {/* items-start (not items-center) so the accordion sections below can
          expand/collapse — changing this dialog's height — without the
          whole dialog re-centering and visibly jumping on screen. Only the
          bottom edge moves as content grows/shrinks. */}
      <div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl dark:shadow-black/60 w-full max-w-md flex flex-col max-h-[90vh] text-gray-900 dark:text-gray-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <h3 className="text-sm font-semibold">Autofill Debug</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <SummaryBar summary={session.summary} />

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-3 py-2 text-xs">

          <ExpandableCard
            summary="Rule Mapping"
            subtitle={`${session.mapping.length} field${session.mapping.length !== 1 ? 's' : ''}`}
            defaultExpanded
            contentClassName="p-2"
          >
            {session.mapping.length === 0 ? (
              <p className="text-gray-400 dark:text-gray-500 italic">No mapping data.</p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {session.mapping.map((m) => {
                  const scanned = scannerByFieldId.get(m.fieldId);
                  return (
                    <li key={m.fieldId} className="py-1.5">
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-mono text-[10px] text-gray-400">{m.fieldId}</span>
                        <span className="font-medium truncate">{scanned?.label || '(no label)'}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-gray-600 dark:text-gray-400">
                        <span>{LAYER_LABEL[m.matchLayer]}</span>
                        <span>·</span>
                        <span>conf={m.confidence.toFixed(2)}</span>
                        <span>·</span>
                        <StateDot state={m.finalState} />
                      </div>
                      {m.profilePath && (
                        <div className="font-mono text-[10px] text-blue-600 dark:text-blue-400 truncate">{m.profilePath}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </ExpandableCard>

          <ExpandableCard
            summary="AI Mapping"
            subtitle={`${session.ai.length} field${session.ai.length !== 1 ? 's' : ''}`}
            contentClassName="p-2"
          >
            {session.aiSkipped ? (
              <p className="text-gray-400 dark:text-gray-500 italic">AI layer skipped — no API key configured.</p>
            ) : session.ai.length === 0 ? (
              <p className="text-gray-400 dark:text-gray-500 italic">No fields sent to AI.</p>
            ) : (
              <>
                {aiChanged.length > 0 && (
                  <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                    {aiChanged.map((a) => (
                      <li key={a.fieldId} className="py-1.5">
                        <div className="flex items-baseline gap-1.5">
                          <span className="font-mono text-[10px] text-gray-400">{a.fieldId}</span>
                          <span className="font-medium truncate">{a.label || '(no label)'}</span>
                          <span className="text-[10px] text-gray-400">[{a.type}]</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-gray-600 dark:text-gray-400">
                          <span>ai conf={a.aiConfidence ?? 'null'}</span>
                          <span>·</span>
                          <StateDot state={a.finalState} />
                        </div>
                        {a.aiResult && (
                          <div className="font-mono text-[10px] text-purple-600 dark:text-purple-400 truncate">{a.aiResult}</div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {/* Condensed — AI reviewed these but produced no fill. Full
                    per-entry detail (type, confidence, dot) is mostly noise
                    once you already know nothing happened; one line each
                    keeps them debuggable without dominating the section. */}
                {aiUnchanged.length > 0 && (
                  <div className={aiChanged.length > 0 ? 'mt-2 pt-2 border-t border-gray-100 dark:border-gray-800' : ''}>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-1">
                      {aiUnchanged.length} reviewed, no change
                    </p>
                    <ul className="space-y-0.5">
                      {aiUnchanged.map((a) => (
                        <li key={a.fieldId} className="flex items-baseline gap-1.5 text-[10px] text-gray-400 dark:text-gray-500 truncate">
                          <span className="font-mono">{a.fieldId}</span>
                          <span className="truncate">{a.label || '(no label)'}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </ExpandableCard>

        </div>

      </div>
    </div>
  );
}
