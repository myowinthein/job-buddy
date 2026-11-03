import { feedback } from '@/src/ui/feedback';
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useToast } from '@/src/components/ui/useToast';
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

// Temporary review entries. Remove after the hidden-site pagination review.
const DEMO_HIDDEN_SITES =
  import.meta.env.MODE === 'development'
    ? [
        'careers.acme.example',
        'careers.brightside.example',
        'careers.cloudworks.example',
        'jobs.designstudio.example',
        'jobs.evergreen.example',
        'jobs.fintech.example',
        'talent.globalteam.example',
        'work.horizon.example',
      ]
    : [];

export function QuickFillSettings() {
  const { showToast } = useToast();
  const [prefs, setPrefs] = useState<QuickFillPreferences | null>(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [demoSites, setDemoSites] = useState(DEMO_HIDDEN_SITES);
  useEffect(() => {
    let active = true;
    void getQuickFillPreferences()
      .then((value) => {
        if (active) setPrefs(value);
      })
      .catch(() => {
        if (active) showToast('error', feedback.quickFillLoadFailed);
      });
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && QUICK_FILL_KEY in changes)
        setPrefs(normalizePreferences(changes[QUICK_FILL_KEY].newValue));
    };
    chrome.storage.onChanged.addListener(listener);
    return () => {
      active = false;
      chrome.storage.onChanged.removeListener(listener);
    };
  }, [showToast]);
  const save = async (change: Parameters<typeof updateQuickFillPreferences>[0]) => {
    const previous = prefs;
    setPrefs((current) =>
      current
        ? { ...current, ...(typeof change === 'function' ? change(current) : change) }
        : current,
    );
    setSaving(true);
    try {
      await updateQuickFillPreferences(change);
      setPrefs(await getQuickFillPreferences());
    } catch {
      setPrefs(await getQuickFillPreferences().catch(() => previous));
      showToast('error', feedback.quickFillSaveFailed);
    } finally {
      setSaving(false);
    }
  };
  const hiddenSites = [...new Set([...(prefs?.disabledSites ?? []), ...demoSites])];
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
            disabled={!prefs || saving}
            aria-pressed={prefs?.enabled === enabled}
            onClick={() => {
              if (prefs?.enabled !== enabled) void save({ enabled });
            }}
            className={[
              'px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-50',
              enabled ? 'border-r border-gray-300 dark:border-gray-600' : '',
              prefs?.enabled === enabled
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700',
            ].join(' ')}
          >
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
          value={prefs?.fillMode ?? 'merge'}
          disabled={!prefs || saving || !prefs.enabled}
          className={`${fieldCls(undefined, !prefs || saving || !prefs.enabled)} max-w-xs`}
          onChange={(event) =>
            void save({ fillMode: event.target.value === 'overwrite' ? 'overwrite' : 'merge' })
          }
        >
          <option value="merge">Empty fields only</option>
          <option value="overwrite">Empty and existing fields</option>
        </select>
      </div>
      {!!prefs && !!hiddenSites.length && (
        <details className="mt-4">
          <summary className="cursor-pointer rounded-sm text-sm font-medium text-gray-700 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-gray-300">
            Hidden sites ({hiddenSites.length})
          </summary>
          <div className="mt-3 space-y-3">
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
                className={`${fieldCls()} max-w-xs`}
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
                      className="shrink-0 rounded text-blue-600 hover:underline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-50 dark:text-blue-400"
                      onClick={() => {
                        setDemoSites((current) => current.filter((value) => value !== site));
                        if (prefs.disabledSites.includes(site))
                          void save((current) => ({
                            disabledSites: current.disabledSites.filter((value) => value !== site),
                          }));
                      }}
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
