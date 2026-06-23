import type { DebugSession } from '@/src/autofill/debug';

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

export function DebugPanel({ session, onClose }: { session: DebugSession; onClose: () => void }) {
  const aiByFieldId = new Map(session.ai.map((a) => [a.fieldId, a]));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh] text-gray-900 dark:text-gray-100"
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5 text-xs">

          {/* ── Stage 1 — Scanner ───────────────────────────────────────── */}
          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
              Stage 1 — Scanner ({session.scanner.length})
            </h4>
            {session.scanner.length === 0 ? (
              <p className="text-gray-400 dark:text-gray-500 italic">No fields scanned.</p>
            ) : (
              <ul className="space-y-1.5">
                {session.scanner.map((f) => (
                  <li key={f.fieldId} className="px-2 py-1.5 bg-gray-50 dark:bg-gray-800 rounded">
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-mono text-[10px] text-gray-400">{f.fieldId}</span>
                      <span className="font-medium truncate">{f.label || '(no label)'}</span>
                    </div>
                    <div className="font-mono text-[10px] text-gray-500 dark:text-gray-400 truncate">
                      type={f.type || '—'} · name={f.name || '—'} · id={f.id || '—'}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── Stage 2 — Manual Mapping ────────────────────────────────── */}
          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
              Stage 2 — Manual Mapping ({session.mapping.length})
            </h4>
            {session.mapping.length === 0 ? (
              <p className="text-gray-400 dark:text-gray-500 italic">No mapping data.</p>
            ) : (
              <ul className="space-y-1.5">
                {session.mapping.map((m) => {
                  const scanned = session.scanner.find((s) => s.fieldId === m.fieldId);
                  return (
                    <li key={m.fieldId} className="px-2 py-1.5 bg-gray-50 dark:bg-gray-800 rounded">
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
          </section>

          {/* ── Stage 3 — AI Layer ──────────────────────────────────────── */}
          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
              Stage 3 — AI Layer ({session.ai.length})
            </h4>
            {session.aiSkipped ? (
              <p className="text-gray-400 dark:text-gray-500 italic">AI layer skipped — no API key configured.</p>
            ) : session.ai.length === 0 ? (
              <p className="text-gray-400 dark:text-gray-500 italic">No fields sent to AI.</p>
            ) : (
              <ul className="space-y-1.5">
                {Array.from(aiByFieldId.values()).map((a) => (
                  <li key={a.fieldId} className="px-2 py-1.5 bg-gray-50 dark:bg-gray-800 rounded">
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
          </section>

          {/* ── Stage 4 — Final Summary ─────────────────────────────────── */}
          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
              Stage 4 — Final Summary
            </h4>
            <div className="grid grid-cols-2 gap-2">
              <SummaryCell color="green"  label="Green (no review)"  count={session.summary.green} />
              <SummaryCell color="yellow" label="Yellow (review)"    count={session.summary.yellow} />
              <SummaryCell color="red"    label="Red (low conf)"     count={session.summary.red} />
              <SummaryCell color="gray"   label="Gray (no data)"     count={session.summary.gray} />
            </div>
          </section>

        </div>

        {/* Footer */}
        <div className="flex justify-end px-4 py-3 border-t border-gray-200 dark:border-gray-700 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-xs font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryCell({ color, label, count }: { color: 'green' | 'yellow' | 'red' | 'gray'; label: string; count: number }) {
  const ring = {
    green:  'border-green-300 dark:border-green-700  bg-green-50 dark:bg-green-900/20',
    yellow: 'border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/20',
    red:    'border-red-300 dark:border-red-700      bg-red-50 dark:bg-red-900/20',
    gray:   'border-gray-300 dark:border-gray-700    bg-gray-50 dark:bg-gray-800',
  }[color];
  return (
    <div className={`px-2 py-1.5 rounded border ${ring}`}>
      <div className="text-[10px] text-gray-500 dark:text-gray-400">{label}</div>
      <div className="text-base font-semibold text-gray-900 dark:text-gray-100">{count}</div>
    </div>
  );
}
