import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, LoaderCircle } from 'lucide-react';
import { GeminiMessage } from '@/src/components/ui/GeminiMessage';
import { RetryNotice } from '@/src/components/ui/RetryNotice';
import type { Profile } from '@/src/types/profile';
import type { LearnedMappings } from '@/src/types/storage';
import { getGeminiSettings } from '@/src/utils/storage';
import { toGeminiModel, type ResumeModelAttempt } from '@/src/resume-ai/types';
import { reviewMappingsWithAI } from '@/src/resume-ai/gemini';
import { applyMappingReview } from '@/src/utils/learnedMappingReview';
import {
  hasReviewQuestion,
  mappingReviewBatches,
  mappingReviewCatalog,
  mappingReviewItems,
  type MappingAssessment,
  type MappingReviewDecision,
} from '@/src/learned-mappings/review';
import { groupMappings } from '@/src/learned-mappings/groups';
import { mappingDestination, profileFieldLabels } from './learnedMappingsView';
import { SearchableProfileFieldSelect } from './shared/SearchableProfileFieldSelect';
import { fieldCls } from './shared/fieldCls';
import { MappingReviewSites } from './MappingReviewSites';
import { MappingReviewTitle } from './MappingReviewTitle';
import { useDialogFocus } from '../ui/useDialogFocus';
import { useEscapeToClose } from '../ui/useEscapeToClose';
import { feedback } from '@/src/ui/feedback';
import { Notice } from '@/src/components/ui/Notice';
import { ModelFallbackNotice } from '@/src/components/shared/ModelFallbackNotice';
import { equalJsonValues } from '@/src/utils/equalJsonValues';

const secondary =
  'rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-40 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700';
const primary =
  'rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-40';
const verdicts = {
  correct: { label: 'Looks correct', color: 'text-green-700 dark:text-green-400' },
  change: { label: 'Better match found', color: 'text-amber-700 dark:text-amber-400' },
  uncertain: { label: 'Unclear match', color: 'text-amber-700 dark:text-amber-400' },
  inactive: { label: 'No matching field', color: 'text-amber-700 dark:text-amber-400' },
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
  const [limit, setLimit] = useState(20);
  const [expandedSite, setExpandedSite] = useState<string | null | undefined>(undefined);
  const [results, setResults] = useState<Record<string, MappingAssessment>>({});
  const [decisions, setDecisions] = useState<Record<string, MappingReviewDecision>>({});
  const [working, setWorking] = useState(false);
  const [phase, setPhase] = useState<'setup' | 'analyzing' | 'results'>('setup');
  const [attempt, setAttempt] = useState<ResumeModelAttempt | null>(null);
  const [applying, setApplying] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  const selectedSiteCount = new Set(scoped.map((item) => item.domain)).size;
  const completed = scoped.filter((item) => results[item.id]);
  const attention = completed.filter((item) => {
    const verdict = results[item.id].verdict;
    return verdict !== 'correct' && !(verdict === 'inactive' && item.status === 'Inactive');
  });
  const findingSites = new Map<string, typeof attention>();
  for (const item of attention.slice(0, limit)) {
    const group = findingSites.get(item.domain) ?? [];
    group.push(item);
    findingSites.set(item.domain, group);
  }
  const suggestedDecisions: Record<string, MappingReviewDecision> = Object.fromEntries(
    completed.map((item) => {
      const assessment = results[item.id];
      let suggested: MappingReviewDecision = { action: 'keep' };
      if (assessment.verdict === 'change') suggested = { action: 'change', path: assessment.path! };
      else if (assessment.verdict === 'inactive') suggested = { action: 'inactive' };
      return [item.id, suggested];
    }),
  );
  const selectedDecisions = { ...suggestedDecisions, ...decisions };
  const suggestionsChanged = !equalJsonValues(selectedDecisions, suggestedDecisions);
  const changes = scoped.filter((item) => {
    const choice = selectedDecisions[item.id];
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
    try {
      const settings = await getGeminiSettings();
      if (!live.current) return;
      setHasKey(!!settings.apiKey && !!settings.model);
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
        setWorking(false);
        setStale(true);
        setError(feedback.mappingReviewChanged);
      }
      if (
        setupReady.current &&
        ['geminiApiKey', 'geminiModel', 'geminiSettingsMeta'].some((key) => key in changes)
      ) {
        abortRef.current?.abort();
        setWorking(false);
        if ('geminiApiKey' in changes && !changes.geminiApiKey.newValue) {
          setHasKey(false);
          setPhase('setup');
          setError(null);
        } else {
          setStale(true);
          setError(feedback.geminiChangedInAnotherTab);
        }
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
  }, []);

  useEffect(() => {
    dialog.current?.focus({ preventScroll: true });
    dialog.current?.querySelector('.review-dialog-body')?.scrollTo?.(0, 0);
  }, [phase, dialog]);

  const close = () => {
    abortRef.current?.abort();
    onClose();
  };
  useEscapeToClose(applying ? undefined : close);

  const run = async () => {
    if (stale || !scoped.length || (abortRef.current && !abortRef.current.signal.aborted)) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setWorking(true);
    setPhase('analyzing');
    setAttempt(null);
    setLimit(20);
    setError(null);
    try {
      const settings = await getGeminiSettings();
      controller.signal.throwIfAborted();
      if (!settings.apiKey || !settings.model) {
        setHasKey(false);
        setPhase('setup');
        return;
      }
      const model = toGeminiModel(settings.model);
      const remaining = scoped.filter((item) => !results[item.id]);
      const accept = (assessments: MappingAssessment[]) => {
        controller.signal.throwIfAborted();
        if (!live.current) return;
        setResults((current) => ({
          ...current,
          ...Object.fromEntries(assessments.map((result) => [result.id, result])),
        }));
      };
      const missingContext = remaining.filter((item) => !hasReviewQuestion(item));
      if (missingContext.length)
        accept(
          missingContext.map((item) => ({
            id: item.id,
            verdict: 'uncertain',
            path: null,
            reason: feedback.mappingReviewMissingContext,
          })),
        );
      for (const batch of mappingReviewBatches(remaining.filter(hasReviewQuestion), catalog)) {
        controller.signal.throwIfAborted();
        const result = await reviewMappingsWithAI(
          settings.apiKey,
          model,
          batch,
          catalog,
          controller.signal,
          (model, reason) => {
            if (live.current && !controller.signal.aborted) setAttempt({ model, reason });
          },
        );
        controller.signal.throwIfAborted();
        accept(result.assessments);
      }
      if (live.current) setPhase('results');
    } catch (failure) {
      if (live.current && !controller.signal.aborted)
        setError(failure instanceof Error ? failure.message : feedback.mappingReviewFailed);
    } finally {
      controller.abort();
      if (live.current) setWorking(false);
    }
  };
  const apply = async () => {
    if (applyingRef.current || stale || working || !hasKey) return;
    applyingRef.current = true;
    setApplying(true);
    setError(null);
    try {
      await applyMappingReview(profile, mappings, scoped, selectedDecisions);
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

  const partialReviewError = phase === 'analyzing' && completed.length > 0 && !stale && !!error;
  const errorNotice = error && (
    !hasKey && !stale ? (
      <RetryNotice busy={loading} onRetry={() => void load()}>{error}</RetryNotice>
    ) : (
      <Notice tone={stale || partialReviewError ? 'review' : 'error'} urgent>
        <p><GeminiMessage message={error} /></p>
      </Notice>
    )
  );

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
        className={`review-dialog flex max-h-[90dvh] w-full ${phase === 'results' ? 'max-w-3xl' : phase === 'analyzing' ? 'max-w-sm' : 'max-w-lg'} flex-col rounded-xl bg-white shadow-2xl outline-none dark:bg-gray-800`}
        onClick={(event) => event.stopPropagation()}
      >
        <header
          className={
            phase === 'analyzing'
              ? 'shrink-0 px-6 pt-8 text-center'
              : 'shrink-0 border-b border-gray-200 px-6 py-4 dark:border-gray-700'
          }
        >
          <div
            className={
              phase === 'analyzing' ? undefined : 'flex items-center justify-between gap-4'
            }
          >
            <div>
              <h3 id={titleId} className="text-base font-semibold text-gray-900 dark:text-gray-100">
                {phase === 'analyzing' ? 'Analyzing Mappings' : 'Review Mappings'}
              </h3>
              {phase !== 'analyzing' && (
                <p className="mt-0.5 text-pretty text-xs text-gray-500 dark:text-gray-400">
                  {phase === 'setup'
                    ? 'Use Gemini to check saved matches, then review any corrections.'
                    : 'Choose which corrections to apply.'}
                </p>
              )}
            </div>
            {phase !== 'analyzing' && (
              <button
                type="button"
                aria-label="Close review"
                disabled={applying}
                onClick={close}
                className="ml-4 shrink-0 text-xl leading-none text-gray-500 transition-colors hover:text-gray-600 active:scale-95 disabled:opacity-40 dark:text-gray-400 dark:hover:text-gray-300"
              >
                ×
              </button>
            )}
          </div>
          {hasKey && phase === 'results' && (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
              <span className="text-gray-500 dark:text-gray-400" aria-live="polite">
                Reviewed {completed.length} of {scoped.length}{' '}
                {scoped.length === 1 ? 'mapping' : 'mappings'}.
              </span>
              {!!attention.length && (
                <>
                  <button
                    type="button"
                    onClick={() => setDecisions({})}
                    disabled={!suggestionsChanged || applying || stale}
                    className="text-blue-600 text-action disabled:opacity-50 dark:text-blue-400"
                  >
                    Use Suggestions
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDecisions(
                        Object.fromEntries(
                          completed.map((item) => [item.id, { action: 'keep' as const }]),
                        ),
                      )
                    }
                    disabled={!changes.length || applying || stale}
                    className="text-blue-600 text-action disabled:opacity-50 dark:text-blue-400"
                  >
                    Keep All Current
                  </button>
                </>
              )}
            </div>
          )}
        </header>
        <div
          className={`review-dialog-body min-h-0 overflow-y-auto px-6 ${phase === 'analyzing' ? 'py-6' : 'py-4'}`}
        >
          {error && !partialReviewError && (
            <div className="mb-4 last:mb-0">
              {errorNotice}
            </div>
          )}
          {loading ? (
            <p
              role="status"
              className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400"
            >
              <LoaderCircle
                aria-hidden="true"
                className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none"
              />
              Loading AI settings…
            </p>
          ) : (
            <>
              {!hasKey && !error && (
                <div className="flex flex-col items-center text-center">
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
                      className="text-sm font-medium text-blue-600 text-action active:scale-95 dark:text-blue-400"
                    >
                      Go to Settings →
                    </button>
                  )}
                </div>
              )}
              {hasKey && phase === 'setup' && (
                <div>
                  <MappingReviewSites
                    sites={sites}
                    selected={selectedSites}
                    disabled={working || applying || stale}
                    onChange={(selected) => {
                      setSelectedSites(selected);
                      setLimit(20);
                    }}
                  />
                </div>
              )}
              {hasKey && phase === 'analyzing' && (
                <div>
                  <div
                    role="status"
                    aria-atomic="true"
                    className="flex items-center justify-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200"
                  >
                    {working && (
                      <LoaderCircle
                        size={16}
                        aria-hidden="true"
                        className="animate-spin text-blue-500 motion-reduce:animate-none"
                      />
                    )}
                    <span>
                      Reviewed {completed.length} of {scoped.length}{' '}
                      {scoped.length === 1 ? 'mapping' : 'mappings'}.
                    </span>
                  </div>
                  <p className="mt-1 text-center text-xs text-gray-500 dark:text-gray-400">
                    From {selectedSiteCount} selected {selectedSiteCount === 1 ? 'site' : 'sites'}
                  </p>
                  <div
                    role="progressbar"
                    aria-label="Mappings reviewed"
                    aria-valuemin={0}
                    aria-valuemax={scoped.length}
                    aria-valuenow={completed.length}
                    className="mt-4 h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
                  >
                    <div
                      className="h-full bg-blue-600"
                      style={{
                        width: `${scoped.length ? (completed.length / scoped.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  {working && attempt?.reason && (
                    <ModelFallbackNotice model={attempt.model} reason={attempt.reason} />
                  )}
                  {partialReviewError && <div className="mt-4">{errorNotice}</div>}
                </div>
              )}
            </>
          )}
          {hasKey && phase === 'results' && (
            <>
              {!attention.length && (
                <Notice tone="success">No changes suggested for the reviewed mappings.</Notice>
              )}
              {!!attention.length && (
                <div className="space-y-3">
                  {[...findingSites].map(([domain, group], index) => {
                    const expanded =
                      expandedSite === undefined ? index === 0 : expandedSite === domain;
                    const siteCount = attention.filter((item) => item.domain === domain).length;
                    return (
                      <div
                        key={domain}
                        role="group"
                        aria-label={`Findings for ${domain}`}
                        className="rounded-lg border border-gray-200 dark:border-gray-700"
                      >
                        <h4>
                          <button
                            type="button"
                            aria-label={domain}
                            aria-expanded={expanded}
                            aria-controls={`${titleId}-site-${encodeURIComponent(domain)}`}
                            disabled={applying}
                            onClick={() => setExpandedSite(expanded ? null : domain)}
                            className="flex w-full items-center justify-between gap-3 rounded-lg px-4 py-3 text-left hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-50 dark:hover:bg-gray-700/40"
                          >
                            <span className="min-w-0 flex-1 break-all text-sm font-semibold text-gray-800 dark:text-gray-200">
                              {domain}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {siteCount} {siteCount === 1 ? 'mapping' : 'mappings'}
                            </span>
                            <ChevronDown
                              aria-hidden="true"
                              className={`h-4 w-4 shrink-0 text-gray-400 ${expanded ? 'rotate-180' : ''}`}
                            />
                          </button>
                        </h4>
                        <div
                          id={`${titleId}-site-${encodeURIComponent(domain)}`}
                          hidden={!expanded}
                          className="divide-y divide-gray-200 px-4 pb-2 dark:divide-gray-700"
                        >
                          {group.map((item) => {
                            const assessment = results[item.id];
                            const verdict = verdicts[assessment.verdict];
                            const choice = selectedDecisions[item.id];
                            return (
                              <section
                                key={item.id}
                                aria-label={`Review ${item.title}`}
                                className="py-2.5 last:pb-0"
                              >
                                <div className="grid items-start gap-3 md:grid-cols-[minmax(0,1fr)_15rem] md:gap-5">
                                  <div className="min-w-0">
                                    <MappingReviewTitle text={item.question || item.title} />
                                    <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
                                      <dt className="text-gray-500 dark:text-gray-400">Current</dt>
                                      <dd className="min-w-0 break-words text-gray-600 dark:text-gray-300">
                                        {mappingDestination(item.path, labels)}
                                        {item.status === 'Inactive' ? ' (Inactive)' : ''}
                                      </dd>
                                      <dt className="text-gray-500 dark:text-gray-400">
                                        Review result
                                      </dt>
                                      <dd className={`min-w-0 break-words ${verdict.color}`}>
                                        {verdict.label}
                                      </dd>
                                    </dl>
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
                                              ? {
                                                  action: 'change',
                                                  path: assessment.path ?? item.path,
                                                }
                                              : {
                                                  action: event.target.value as 'keep' | 'inactive',
                                                },
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
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {attention.length > limit && (
                <button
                  type="button"
                  className={`${secondary} mt-4`}
                  onClick={() => setLimit((current) => current + 20)}
                >
                  Show {Math.min(20, attention.length - limit)} more
                </button>
              )}
            </>
          )}
        </div>
        <footer
          className={
            phase === 'analyzing'
              ? 'flex shrink-0 flex-wrap justify-center gap-3 px-6 pb-8'
              : 'flex shrink-0 flex-wrap justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700'
          }
        >
          <button
            type="button"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 active:scale-95 disabled:opacity-40 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            disabled={applying}
            onClick={close}
          >
            {phase === 'results' && !attention.length ? 'Done' : 'Cancel'}
          </button>
          {hasKey && phase === 'setup' && (
            <button
              type="button"
              className={primary}
              disabled={loading || stale || !scoped.length}
              onClick={() => void run()}
            >
              Analyze Mappings
            </button>
          )}
          {hasKey && phase === 'analyzing' && error && !stale && (
            <>
              {!!completed.length && (
                <button
                  type="button"
                  className={secondary}
                  onClick={() => {
                    setError(null);
                    setPhase('results');
                  }}
                >
                  Review Completed
                </button>
              )}
              <button type="button" className={primary} onClick={() => void run()}>
                Retry
              </button>
            </>
          )}
          {hasKey && phase === 'results' && !!attention.length && (
            <button
              type="button"
              className={`inline-flex items-center justify-center gap-2 ${primary}`}
              disabled={!changes.length || working || applying || stale}
              aria-busy={applying}
              onClick={() => void apply()}
            >
              {applying && <LoaderCircle aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" />}
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
