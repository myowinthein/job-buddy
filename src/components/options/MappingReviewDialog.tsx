import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { LoaderCircle, Sparkles, X } from 'lucide-react';
import type { Profile } from '@/src/types/profile';
import type { LearnedMappings } from '@/src/types/storage';
import { getGeminiSettings } from '@/src/utils/storage';
import { toGeminiModel, MODEL_DISPLAY_NAMES } from '@/src/resume-ai/types';
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
import { useDialogFocus } from '../ui/useDialogFocus';
import { useEscapeToClose } from '../ui/useEscapeToClose';
import { feedback } from '@/src/ui/feedback';

const secondary =
  'rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-40 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700';
const primary =
  'rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-40';
const verdicts = {
  correct: { label: 'Looks correct', color: 'text-green-700 dark:text-green-400' },
  change: { label: 'Better field', color: 'text-amber-700 dark:text-amber-400' },
  uncertain: { label: 'Needs context', color: 'text-gray-500 dark:text-gray-400' },
  inactive: { label: 'No suitable field', color: 'text-amber-700 dark:text-amber-400' },
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
  const [site, setSite] = useState('');
  const [reviewAll, setReviewAll] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [limit, setLimit] = useState(20);
  const [results, setResults] = useState<Record<string, MappingAssessment>>({});
  const [decisions, setDecisions] = useState<Record<string, MappingReviewDecision>>({});
  const [working, setWorking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [progress, setProgress] = useState('');
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
  const scoped = items.filter((item) => !site || item.domain === site);
  const completed = scoped.filter((item) => results[item.id]);
  const attention = completed.filter((item) => results[item.id].verdict !== 'correct');
  const shown = showAll ? completed : attention;
  const changes = items.filter((item) => {
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
    try {
      const settings = await getGeminiSettings();
      if (!live.current) return;
      setHasKey(!!settings.apiKey && !!settings.model);
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
        if ('geminiApiKey' in changes && !changes.geminiApiKey.newValue) setHasKey(false);
        setError(feedback.geminiChangedInAnotherTab);
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
    setError(null);
    setWarning(null);
    setProgress('Preparing review…');
    try {
      const settings = await getGeminiSettings();
      controller.signal.throwIfAborted();
      if (!settings.apiKey || !settings.model) {
        setHasKey(false);
        return;
      }
      const model = toGeminiModel(settings.model);
      const keys = await mappingReviewKeys(profile, items, model);
      const cached = await readMappingReviews(profile, items, keys).catch(() => {
        if (live.current) setWarning(feedback.mappingReviewCacheFailed);
        return new Map();
      });
      controller.signal.throwIfAborted();
      setResults(Object.fromEntries([...cached].map(([id, value]) => [id, value.assessment])));
      const pending = scoped.filter((item) => reviewAll || !cached.has(item.id));
      if (reviewAll) {
        setResults((current) =>
          Object.fromEntries(
            Object.entries(current).filter(([id]) => !pending.some((item) => item.id === id)),
          ),
        );
        setDecisions((current) =>
          Object.fromEntries(
            Object.entries(current).filter(([id]) => !pending.some((item) => item.id === id)),
          ),
        );
      }
      const accept = async (assessments: MappingAssessment[], usedModel: string) => {
        if (!live.current) return;
        setResults((current) => ({
          ...current,
          ...Object.fromEntries(assessments.map((result) => [result.id, result])),
        }));
        try {
          await saveMappingReviews(profile, items, keys, assessments, usedModel);
        } catch {
          if (live.current) setWarning(feedback.mappingReviewCacheFailed);
        }
      };
      const missingContext = pending.filter((item) => !hasReviewQuestion(item));
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
      let processed = scoped.length - pending.length + missingContext.length;
      for (const batch of mappingReviewBatches(pending.filter(hasReviewQuestion), catalog)) {
        controller.signal.throwIfAborted();
        const result = await reviewMappingsWithAI(
          settings.apiKey,
          model,
          batch,
          catalog,
          controller.signal,
          (activeModel) =>
            setProgress(
              `Reviewing ${processed + 1}–${processed + batch.length} of ${scoped.length} with ${MODEL_DISPLAY_NAMES[activeModel]}…`,
            ),
        );
        controller.signal.throwIfAborted();
        await accept(result.assessments, result.model);
        processed += batch.length;
      }
      if (live.current) setProgress('Review complete');
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
      await applyMappingReview(profile, mappings, items, decisions);
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
        className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-2xl outline-none dark:bg-gray-800"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="shrink-0 px-6 pt-5 pb-4">
          <div className="flex items-center justify-between gap-3">
            <h3 id={titleId} className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Review Mappings
            </h3>
            <button
              type="button"
              aria-label="Close review"
              disabled={applying}
              onClick={close}
              className={secondary}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Check saved matches with Gemini and choose any corrections.
          </p>
        </header>
        <div className="min-h-0 overflow-y-auto px-6 pb-4">
          {loading ? (
            <p role="status" className="text-sm text-gray-500">
              Loading AI settings…
            </p>
          ) : (
            <>
              {!hasKey && !error && (
                <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
                  <p>{feedback.mappingReviewKeyRequired}</p>
                  {onGoToApiKey && (
                    <button
                      type="button"
                      onClick={() => {
                        close();
                        onGoToApiKey();
                      }}
                      className="mt-2 font-medium underline"
                    >
                      Go to Settings
                    </button>
                  )}
                </div>
              )}
              {hasKey && (
                <>
                  <label
                    className="block text-sm font-medium text-gray-700 dark:text-gray-200"
                    htmlFor={`${titleId}-site`}
                  >
                    Sites to review
                  </label>
                  <select
                    id={`${titleId}-site`}
                    value={site}
                    disabled={working || applying || stale}
                    className={`${fieldCls()} mt-1`}
                    onChange={(event) => {
                      setSite(event.target.value);
                      setLimit(20);
                    }}
                  >
                    <option value="">All sites ({sites.length})</option>
                    {sites.map((domain) => (
                      <option key={domain} value={domain}>
                        {domain}
                      </option>
                    ))}
                  </select>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={reviewAll}
                        disabled={working || applying || stale}
                        onChange={(event) => setReviewAll(event.target.checked)}
                      />
                      Review all again
                    </label>
                    <button
                      type="button"
                      className={primary}
                      disabled={
                        working ||
                        applying ||
                        stale ||
                        (!reviewAll && completed.length === scoped.length)
                      }
                      onClick={() => void run()}
                    >
                      <span className="flex items-center gap-2">
                        <Sparkles size={15} aria-hidden="true" />
                        Review Mappings
                      </span>
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Saved questions and profile field names are sent to Gemini.
                  </p>
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
                      {working
                        ? progress
                        : `${completed.length} reviewed · ${scoped.length - completed.length} remaining`}
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
          {warning && (
            <p role="status" className="mt-3 text-sm text-amber-700 dark:text-amber-400">
              {warning}
            </p>
          )}
          {!!completed.length && (
            <>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-3 dark:border-gray-700">
                <div role="group" aria-label="Review results" className="flex gap-3 text-sm">
                  <button
                    type="button"
                    aria-pressed={!showAll}
                    onClick={() => {
                      setShowAll(false);
                      setLimit(20);
                    }}
                    className={
                      !showAll
                        ? 'font-medium text-blue-600 dark:text-blue-400'
                        : 'text-gray-500 dark:text-gray-400'
                    }
                  >
                    Needs review ({attention.length})
                  </button>
                  <button
                    type="button"
                    aria-pressed={showAll}
                    onClick={() => {
                      setShowAll(true);
                      setLimit(20);
                    }}
                    className={
                      showAll
                        ? 'font-medium text-blue-600 dark:text-blue-400'
                        : 'text-gray-500 dark:text-gray-400'
                    }
                  >
                    All ({completed.length})
                  </button>
                </div>
                <button
                  type="button"
                  disabled={
                    working ||
                    applying ||
                    stale ||
                    !attention.some((item) =>
                      ['change', 'inactive'].includes(results[item.id].verdict),
                    )
                  }
                  className="text-sm text-blue-600 disabled:opacity-40 dark:text-blue-400"
                  onClick={() =>
                    setDecisions((current) => ({
                      ...current,
                      ...Object.fromEntries(
                        attention.flatMap<[string, MappingReviewDecision]>((item) => {
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
              {!shown.length && (
                <p className="py-5 text-sm text-gray-600 dark:text-gray-300">
                  No questionable mappings found in the completed reviews.
                </p>
              )}
              {shown.slice(0, limit).map((item, index) => {
                const assessment = results[item.id];
                const verdict = verdicts[assessment.verdict];
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
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h5 className="min-w-0 flex-1 break-words text-sm font-medium text-gray-900 dark:text-gray-100">
                        {item.question || item.title}
                      </h5>
                      <span className={`text-xs ${verdict.color}`}>{verdict.label}</span>
                    </div>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      Current · {mappingDestination(item.path, labels)}
                      {item.status === 'Inactive' ? ' (Inactive)' : ''}
                    </p>
                    {assessment.verdict === 'change' && (
                      <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">
                        Suggested · {mappingDestination(assessment.path!, labels)}
                      </p>
                    )}
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                      {assessment.reason}
                    </p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
                      <select
                        aria-label={`Action for ${item.title}`}
                        className={`${fieldCls()} sm:max-w-48`}
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
        <footer className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-gray-200 p-4 dark:border-gray-700">
          <button type="button" className={secondary} disabled={applying} onClick={close}>
            Close
          </button>
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
        </footer>
      </div>
    </div>
  );
}
