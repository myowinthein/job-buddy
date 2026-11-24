import { feedback, fillModeLabels } from '@/src/ui/feedback';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { useToast } from '@/src/components/ui/useToast';
import { RetryNotice } from '@/src/components/ui/RetryNotice';
import { fieldCls } from './shared/fieldCls';
import {
  getQuickFillPreferences,
  normalizePreferences,
  QUICK_FILL_KEY,
  updateQuickFillPreferences,
  type QuickFillPreferences,
} from '@/src/quick-fill/preferences';

const SITES_PER_PAGE = 5;
const paginationButton =
  'grid h-8 w-8 place-items-center rounded-md text-gray-600 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent dark:text-gray-300 dark:hover:bg-gray-800 dark:disabled:hover:bg-transparent';

export function QuickFillSettings() {
  const { showToast } = useToast();
  const [prefs, setPrefs] = useState<QuickFillPreferences | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const savedPreferences = useRef<QuickFillPreferences | null>(null);
  const pendingSaves = useRef(0);
  const saveQueue = useRef(Promise.resolve());
  const receivePreferences = useCallback((value: QuickFillPreferences) => {
    savedPreferences.current = value;
    if (!pendingSaves.current) setPrefs(value);
  }, []);
  useEffect(() => {
    let active = true;
    let receivedUpdate = false;
    void getQuickFillPreferences()
      .then((value) => {
        if (active && !receivedUpdate) receivePreferences(value);
      })
      .catch(() => {
        if (active && !receivedUpdate) setLoadError(true);
      });
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (active && area === 'local' && QUICK_FILL_KEY in changes) {
        receivedUpdate = true;
        receivePreferences(normalizePreferences(changes[QUICK_FILL_KEY].newValue));
        setLoadError(false);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => {
      active = false;
      chrome.storage.onChanged.removeListener(listener);
    };
  }, [loadAttempt, receivePreferences]);
  const save = (change: Parameters<typeof updateQuickFillPreferences>[0]) => {
    pendingSaves.current++;
    setPrefs((current) =>
      current
        ? { ...current, ...(typeof change === 'function' ? change(current) : change) }
        : current,
    );
    setSaving(true);
    saveQueue.current = saveQueue.current.then(async () => {
      try {
        await updateQuickFillPreferences(change);
        receivePreferences(await getQuickFillPreferences());
      } catch {
        const latest = await getQuickFillPreferences().catch(() => savedPreferences.current);
        if (latest) receivePreferences(latest);
        showToast('error', feedback.quickFillSaveFailed);
      } finally {
        pendingSaves.current--;
        if (!pendingSaves.current) {
          setPrefs(savedPreferences.current);
          setSaving(false);
        }
      }
    });
    return saveQueue.current;
  };
  const hiddenSites = prefs?.disabledSites ?? [];
  const sites = hiddenSites
    .filter((site) => site.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.localeCompare(b));
  const lastPage = Math.max(0, Math.ceil(sites.length / SITES_PER_PAGE) - 1);
  const currentPage = Math.min(page, lastPage);
  const start = currentPage * SITES_PER_PAGE;
  return (
    <section className="mb-8 border-b border-gray-200 pb-8 dark:border-gray-700">
      <h3 className="mb-1 text-base font-semibold text-gray-800 dark:text-gray-200">Quick Fill</h3>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
        Fill fields using a floating button on job application forms.
      </p>
      {loadError && (
        <div className="mb-4 max-w-md">
          <RetryNotice onRetry={() => {
            setLoadError(false);
            setLoadAttempt((attempt) => attempt + 1);
          }}>
            {feedback.quickFillLoadFailed}
          </RetryNotice>
        </div>
      )}
      <div
        id="quick-fill-enabled"
        role="group"
        aria-label="Floating button"
        tabIndex={-1}
        className="inline-flex overflow-hidden rounded-lg border border-gray-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-gray-600"
      >
        {([true, false] as const).map((enabled) => (
          <button
            key={String(enabled)}
            type="button"
            disabled={!prefs}
            aria-pressed={prefs?.enabled === enabled}
            onClick={() => {
              if (prefs?.enabled !== enabled) void save({ enabled });
            }}
            className={[
              'inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 first:rounded-l-md last:rounded-r-md focus-visible:relative focus-visible:z-10 focus-visible:-outline-offset-2 aria-pressed:focus-visible:outline-white',
              enabled ? 'border-r border-gray-300 dark:border-gray-600' : '',
              prefs?.enabled === enabled
                ? 'bg-blue-600 text-white dark:bg-blue-500 dark:text-gray-950'
                : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700',
            ].join(' ')}
          >
            <Check aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 ${prefs?.enabled === enabled ? '' : 'invisible'}`} />
            {enabled ? 'On' : 'Off'}
          </button>
        ))}
      </div>
      <div className="mt-4">
        <label
          htmlFor="quick-fill-mode"
          className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Fields to fill
        </label>
        <select
          id="quick-fill-mode"
          value={prefs?.fillMode ?? 'overwrite'}
          disabled={!prefs || saving || !prefs.enabled}
          className={`${fieldCls(undefined, !prefs || saving || !prefs.enabled)} max-w-xs`}
          onChange={(event) =>
            void save({ fillMode: event.target.value === 'overwrite' ? 'overwrite' : 'merge' })
          }
        >
          <option value="merge">{fillModeLabels.merge}</option>
          <option value="overwrite">{fillModeLabels.overwrite}</option>
        </select>
      </div>
      {!!prefs && !!hiddenSites.length && (
        <details className="mt-4">
          <summary className="cursor-pointer rounded-sm text-sm font-medium text-gray-700 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-gray-300">
            Hidden sites ({hiddenSites.length})
          </summary>
          <div className="mt-3 w-full max-w-[480px] space-y-3">
            {(hiddenSites.length > SITES_PER_PAGE || query) && (
              <input
                type="search"
                aria-label="Search hidden sites"
                placeholder="Search sites"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(0);
                }}
                className={fieldCls()}
              />
            )}
            {sites.length > SITES_PER_PAGE && (
              <div
                role="group"
                aria-label="Hidden sites pagination"
                className="flex items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400"
              >
                <span role="status" className="whitespace-nowrap tabular-nums">
                  {start + 1}–{Math.min(start + SITES_PER_PAGE, sites.length)} of {sites.length}{' '}
                  sites
                </span>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    aria-label="Previous page"
                    title="Previous page"
                    disabled={saving || currentPage === 0}
                    onClick={() => setPage(currentPage - 1)}
                    className={paginationButton}
                  >
                    <ChevronLeft aria-hidden="true" className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next page"
                    title="Next page"
                    disabled={saving || currentPage === lastPage}
                    onClick={() => setPage(currentPage + 1)}
                    className={paginationButton}
                  >
                    <ChevronRight aria-hidden="true" className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
            {sites.length ? (
              <ul className="space-y-2.5">
                {sites.slice(start, start + SITES_PER_PAGE).map((site) => (
                  <li key={site} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span className="break-all text-gray-600 dark:text-gray-400">{site}</span>
                    <button
                      type="button"
                      disabled={saving}
                      aria-label={`Show button on ${site}`}
                      className="shrink-0 rounded text-blue-600 text-action focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-50 dark:text-blue-400"
                      onClick={() =>
                        void save((current) => ({
                          disabledSites: current.disabledSites.filter((value) => value !== site),
                        }))
                      }
                    >
                      Show
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No sites match your search.
              </p>
            )}
          </div>
        </details>
      )}
    </section>
  );
}
