import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { LoaderCircle, Sparkles } from 'lucide-react';
import type { Profile } from '@/src/types/profile';
import type { LearnedMappings } from '@/src/types/storage';
import { getGeminiSettings } from '@/src/utils/storage';
import { toGeminiModel } from '@/src/resume-ai/types';
import { reviewMappingsWithAI } from '@/src/resume-ai/gemini';
import {
  applyMappingReview,
  mappingReviewKeys,
  readMappingReviews,
  saveMappingReviews,
} from '@/src/utils/learnedMappingReview';
import {
  hasReviewQuestion,
  mappingReviewBatches,
  mappingReviewCatalog,
  mappingReviewItems,
  type MappingAssessment,
  type MappingReviewDecision,
} from '@/src/learned-mappings/review';
import { groupMappings, mappingDestination, profileFieldLabels } from './learnedMappingsView';
import { SearchableProfileFieldSelect } from './shared/SearchableProfileFieldSelect';
import { fieldCls } from './shared/fieldCls';
import { MappingReviewSites } from './MappingReviewSites';
import { useDialogFocus } from '../ui/useDialogFocus';
import { useEscapeToClose } from '../ui/useEscapeToClose';
import { feedback } from '@/src/ui/feedback';

const secondary =
  'rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-40 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700';
const primary =
  'rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-40';
const verdictLabels = {
  change: 'Better field',
  uncertain: 'Needs context',
  inactive: 'No suitable field',
};

export function MappingReviewDialog({
  profile,
  mappings,
  onClose,
  onSaved,
  onGoToApiKey,
}: {
  profile: Partial<Profile>;
  mappings: LearnedMappings;
  onClose: () => void;
  onSaved: () => void;
  onGoToApiKey?: () => void;
}) {
  const dialog = useDialogFocus();
  const titleId = useId();
  const abortRef = useRef<AbortController | null>(null);
  const live = useRef(true);
  const applyingRef = useRef(false);
  const setupReady = useRef(false);
  const [loading, setLoading] = useState(true);
  const [hasKey, setHasKey] = useState(false);
  const [selectedSites, setSelectedSites] = useState<Set<string> | null>(null);
  const [statusFilter, setStatusFilter] = useState<keyof typeof verdictLabels | null>(null);
  const [limit, setLimit] = useState(20);
  const [results, setResults] = useState<Record<string, MappingAssessment>>({});
  const [decisions, setDecisions] = useState<Record<string, MappingReviewDecision>>({});
  const [working, setWorking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const items = useMemo(
    () =>
      mappingReviewItems(
        [...groupMappings(mappings)].flatMap(([domain, groups]) =>
          groups.map((group) => ({ domain, group })),
        ),
      ),
    [mappings],
  );
  const catalog = useMemo(() => mappingReviewCatalog(profile), [profile]);
  const labels = useMemo(() => profileFieldLabels(profile), [profile]);
  const sites = useMemo(() => [...new Set(items.map((item) => item.domain))].sort(), [items]);
  const scoped = items.filter((item) => selectedSites === null || selectedSites.has(item.domain));
  const completed = scoped.filter((item) => results[item.id]);
  const attention = completed.filter((item) => {
    const verdict = results[item.id].verdict;
    return verdict !== 'correct' && !(verdict === 'inactive' && item.status === 'Inactive');
  });
  const statusOptions = (['change', 'uncertain', 'inactive'] as const)
    .map((value) => ({
      value,
      label: verdictLabels[value],
      count: attention.filter((item) => results[item.id].verdict === value).length,
    }))
    .filter((option) => option.count > 0);
  const activeStatus =
    statusOptions.find((option) => option.value === statusFilter)?.value ?? statusOptions[0]?.value;
  const shown = attention.filter((item) => results[item.id].verdict === activeStatus);
  const changes = scoped.filter((item) => {
    const choice = decisions[item.id];
    return (
      results[item.id] &&
      choice &&
      choice.action !== 'keep' &&
      (choice.action !== 'inactive' || item.status !== 'Inactive')
    );
  });

  const load = async () => {
    setLoading(true);
    setError(null);
    setWarning(null);
    try {
      const settings = await getGeminiSettings();
      if (!live.current) return;
      setHasKey(!!settings.apiKey && !!settings.model);
      if (!settings.apiKey || !settings.model) return;
      const keys = await mappingReviewKeys(profile, items, toGeminiModel(settings.model));
      const cached = await readMappingReviews(profile, items, keys).catch(() => {
        if (live.current) setWarning(feedback.mappingReviewCacheFailed);
        return new Map();
      });
      if (!live.current) return;
      setResults(Object.fromEntries([...cached].map(([id, value]) => [id, value.assessment])));
    } catch {
      if (live.current) setError(feedback.geminiLoadFailed);
    } finally {
      setupReady.current = true;
      if (live.current) setLoading(false);
    }
  };
  useEffect(() => {
    live.current = true;
    const initial = setTimeout(() => void load(), 0);
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local') return;
      if (
        ['profile', 'learnedMappings', 'learnedMappingsRevision'].some((key) => key in changes) &&
        !applyingRef.current
      ) {
        abortRef.current?.abort();
        setStale(true);
        setError(feedback.mappingReviewChanged);
      }
      if (
        setupReady.current &&
        ['geminiApiKey', 'geminiModel', 'geminiSettingsMeta'].some((key) => key in changes)
      ) {
        abortRef.current?.abort();
        if ('geminiApiKey' in changes && !changes.geminiApiKey.newValue) {
          setHasKey(false);
          setError(null);
        } else setError(feedback.geminiChangedInAnotherTab);
      }
    };
    chrome.storage.onChanged.addListener(changed);
    return () => {
      live.current = false;
      clearTimeout(initial);
      abortRef.current?.abort();
      chrome.storage.onChanged.removeListener(changed);
    };
    // The owner captures one immutable review base when opening this dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => {
    abortRef.current?.abort();
    onClose();
  };
  useEscapeToClose(applying ? undefined : close);

  const run = async () => {
    if (abortRef.current && !abortRef.current.signal.aborted) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setWorking(true);
    setStatusFilter(null);
    setError(null);
    setWarning(null);
    try {
      const settings = await getGeminiSettings();
      controller.signal.throwIfAborted();
      if (!settings.apiKey || !settings.model) {
        setHasKey(false);
        return;
      }
      const model = toGeminiModel(settings.model);
      const keys = await mappingReviewKeys(profile, scoped, model);
      controller.signal.throwIfAborted();
      const selectedIds = new Set(scoped.map((item) => item.id));
      setResults((current) =>
        Object.fromEntries(Object.entries(current).filter(([id]) => !selectedIds.has(id))),
      );
      setDecisions((current) =>
        Object.fromEntries(Object.entries(current).filter(([id]) => !selectedIds.has(id))),
      );
      setLimit(20);
      const accept = async (assessments: MappingAssessment[], usedModel: string) => {
        if (!live.current) return;
        setResults((current) => ({
          ...current,
          ...Object.fromEntries(assessments.map((result) => [result.id, result])),
        }));
        try {
          await saveMappingReviews(profile, scoped, keys, assessments, usedModel);
        } catch {
          if (live.current) setWarning(feedback.mappingReviewCacheFailed);
        }
      };
      const missingContext = scoped.filter((item) => !hasReviewQuestion(item));
      if (missingContext.length)
        await accept(
          missingContext.map((item) => ({
            id: item.id,
            verdict: 'uncertain',
            path: null,
            reason: feedback.mappingReviewMissingContext,
          })),
          'local-context-check',
        );
      for (const batch of mappingReviewBatches(scoped.filter(hasReviewQuestion), catalog)) {
        controller.signal.throwIfAborted();
        const result = await reviewMappingsWithAI(
          settings.apiKey,
          model,
          batch,
          catalog,
          controller.signal,
        );
        controller.signal.throwIfAborted();
        await accept(result.assessments, result.model);
      }
    } catch (failure) {
      if (live.current && !controller.signal.aborted)
        setError(failure instanceof Error ? failure.message : feedback.mappingReviewFailed);
    } finally {
      controller.abort();
      if (live.current) setWorking(false);
    }
  };
  const apply = async () => {
    if (applyingRef.current) return;
    applyingRef.current = true;
    setApplying(true);
    setError(null);
    try {
      await applyMappingReview(profile, mappings, scoped, decisions);
      if (live.current) onSaved();
    } catch (failure) {
      if (live.current)
        setError(
          failure instanceof Error && failure.message === feedback.mappingReviewChanged
            ? failure.message
            : feedback.sectionSaveFailed,
        );
    } finally {
      applyingRef.current = false;
      if (live.current) setApplying(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
      onClick={applying ? undefined : close}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`flex max-h-[90vh] w-full ${!loading && !hasKey ? 'max-w-lg' : 'max-w-3xl'} flex-col rounded-xl bg-white shadow-2xl outline-none dark:bg-gray-800`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <div>
            <h3 id={titleId} className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Review Mappings
            </h3>
            <p className="mt-0.5 text-pretty text-xs text-gray-500 dark:text-gray-400">
              Check saved matches with Gemini and choose any corrections.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close review"
            disabled={applying}
            onClick={close}
            className="ml-4 shrink-0 text-xl leading-none text-gray-400 transition-colors hover:text-gray-600 active:scale-95 disabled:opacity-40 dark:text-gray-500 dark:hover:text-gray-300"
          >
            ×
          </button>
        </header>
        <div
          className={`min-h-0 overflow-y-auto px-6 ${!loading && !hasKey ? 'py-5' : 'pt-4 pb-4'}`}
        >
          {loading ? (
            <p role="status" className="text-sm text-gray-500">
              Loading AI settings…
            </p>
          ) : (
            <>
              {!hasKey && !error && (
                <div className="py-6 text-center">
                  <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
                    {feedback.mappingReviewKeyRequired}
                  </p>
                  {onGoToApiKey && (
                    <button
                      type="button"
                      onClick={() => {
                        close();
                        onGoToApiKey();
                      }}
                      className="text-sm font-medium text-blue-600 hover:underline active:scale-95 dark:text-blue-400"
                    >
                      Go to Settings →
                    </button>
                  )}
                </div>
              )}
              {hasKey && (
                <>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                    <MappingReviewSites
                      sites={sites}
                      selected={selectedSites}
                      disabled={working || applying || stale}
                      onChange={(selected) => {
                        setSelectedSites(selected);
                        setStatusFilter(null);
                        setLimit(20);
                      }}
                    />
                    <button
                      type="button"
                      className={`${primary} shrink-0 self-start sm:mt-6`}
                      disabled={working || applying || stale || !scoped.length}
                      onClick={() => void run()}
                    >
                      <span className="flex items-center gap-1.5">
                        Review Mappings
                        <Sparkles aria-hidden="true" className="w-3.5 h-3.5 shrink-0 text-white" />
                      </span>
                    </button>
                  </div>
                  <div
                    role="status"
                    className="mt-3 flex flex-wrap items-center gap-2 text-sm text-gray-600 dark:text-gray-300"
                  >
                    {working && (
                      <LoaderCircle
                        size={16}
                        aria-hidden="true"
                        className="animate-spin text-blue-500 motion-reduce:animate-none"
                      />
                    )}
                    <span>
                      Reviewed {completed.length} of {scoped.length} mappings.
                    </span>
                    {working && (
                      <button
                        type="button"
                        className="ml-auto text-blue-600 underline dark:text-blue-400"
                        onClick={() => abortRef.current?.abort()}
                      >
                        Stop review
                      </button>
                    )}
                  </div>
                </>
              )}
            </>
          )}
          {error && (
            <div
              role="alert"
              className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200"
            >
              <p>{error}</p>
              {!hasKey && !stale && (
                <button type="button" className="mt-2 underline" onClick={() => void load()}>
                  Retry
                </button>
              )}
            </div>
          )}
          {hasKey && warning && (
            <p role="status" className="mt-3 text-sm text-amber-700 dark:text-amber-400">
              {warning}
            </p>
          )}
          {hasKey && !!completed.length && (
            <>
              {!!attention.length && (
                <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-3 dark:border-gray-700">
                  <div
                    role="group"
                    aria-label="Review status"
                    className="flex flex-wrap gap-x-4 gap-y-2 text-sm"
                  >
                    {statusOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={activeStatus === option.value}
                        onClick={() => {
                          setStatusFilter(option.value);
                          setLimit(20);
                        }}
                        className={`rounded-sm py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${activeStatus === option.value ? 'font-medium text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
                      >
                        {option.label} ({option.count})
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    disabled={
                      working ||
                      applying ||
                      stale ||
                      !shown.some((item) =>
                        ['change', 'inactive'].includes(results[item.id].verdict),
                      )
                    }
                    className="text-sm text-blue-600 disabled:opacity-40 dark:text-blue-400"
                    onClick={() =>
                      setDecisions((current) => ({
                        ...current,
                        ...Object.fromEntries(
                          shown.flatMap<[string, MappingReviewDecision]>((item) => {
                            const result = results[item.id];
                            return result.verdict === 'change'
                              ? [[item.id, { action: 'change', path: result.path! }]]
                              : result.verdict === 'inactive'
                                ? [[item.id, { action: 'inactive' }]]
                                : [];
                          }),
                        ),
                      }))
                    }
                  >
                    Use clear suggestions
                  </button>
                </div>
              )}
              {!attention.length && (
                <p className="py-5 text-sm text-gray-600 dark:text-gray-300">
                  No changes suggested for the reviewed mappings.
                </p>
              )}
              {shown.slice(0, limit).map((item, index) => {
                const assessment = results[item.id];
                const choice = decisions[item.id] ?? { action: 'keep' as const };
                return (
                  <section
                    key={item.id}
                    aria-label={`Review ${item.title}`}
                    className="border-b border-gray-200 py-4 last:border-0 dark:border-gray-700"
                  >
                    {(index === 0 || shown[index - 1].domain !== item.domain) && (
                      <h4 className="mb-3 break-all text-xs font-medium text-gray-500 dark:text-gray-400">
                        {item.domain}
                      </h4>
                    )}
                    <div className="grid items-start gap-3 md:grid-cols-[minmax(0,1fr)_15rem] md:gap-5">
                      <div className="min-w-0">
                        <h5 className="break-words text-sm font-medium text-gray-900 dark:text-gray-100">
                          {item.question || item.title}
                        </h5>
                        <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
                          <dt className="text-gray-500 dark:text-gray-400">Current</dt>
                          <dd className="min-w-0 break-words text-gray-600 dark:text-gray-300">
                            {mappingDestination(item.path, labels)}
                            {item.status === 'Inactive' ? ' (Inactive)' : ''}
                          </dd>
                          {assessment.verdict === 'change' && (
                            <>
                              <dt className="text-gray-500 dark:text-gray-400">Suggested</dt>
                              <dd className="min-w-0 break-words text-gray-900 dark:text-gray-100">
                                {mappingDestination(assessment.path!, labels)}
                              </dd>
                            </>
                          )}
                        </dl>
                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                          {assessment.reason}
                        </p>
                      </div>
                      <div className="flex min-w-0 flex-col gap-2">
                        <select
                          aria-label={`Action for ${item.title}`}
                          className={fieldCls()}
                          value={choice.action}
                          disabled={working || applying || stale}
                          onChange={(event) =>
                            setDecisions((current) => ({
                              ...current,
                              [item.id]:
                                event.target.value === 'change'
                                  ? { action: 'change', path: assessment.path ?? item.path }
                                  : { action: event.target.value as 'keep' | 'inactive' },
                            }))
                          }
                        >
                          <option value="keep">Keep current</option>
                          <option value="change">Change field</option>
                          <option value="inactive">Make inactive</option>
                        </select>
                        {choice.action === 'change' && (
                          <SearchableProfileFieldSelect
                            profile={profile}
                            includeEmpty
                            value={choice.path}
                            disabled={working || applying || stale}
                            onChange={(path) =>
                              setDecisions((current) => ({
                                ...current,
                                [item.id]: { action: 'change', path },
                              }))
                            }
                          />
                        )}
                      </div>
                    </div>
                  </section>
                );
              })}
              {shown.length > limit && (
                <button
                  type="button"
                  className={`${secondary} mt-3`}
                  onClick={() => setLimit((current) => current + 20)}
                >
                  Show {Math.min(20, shown.length - limit)} more
                </button>
              )}
            </>
          )}
        </div>
        <footer className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
          <button
            type="button"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 active:scale-95 disabled:opacity-40 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            disabled={applying}
            onClick={close}
          >
            Close
          </button>
          {hasKey && (
            <button
              type="button"
              className={primary}
              disabled={!changes.length || working || applying || stale}
              onClick={() => void apply()}
            >
              {applying
                ? 'Applying…'
                : `Apply Changes${changes.length ? ` (${changes.length})` : ''}`}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
