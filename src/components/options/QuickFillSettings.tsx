import { useEffect, useState } from 'react';
import { useToast } from '@/src/components/ui/useToast';
import {
  getQuickFillPreferences,
  normalizePreferences,
  QUICK_FILL_KEY,
  updateQuickFillPreferences,
  type QuickFillPreferences,
} from '@/src/quick-fill/preferences';

export function QuickFillSettings() {
  const { showToast } = useToast();
  const [prefs, setPrefs] = useState<QuickFillPreferences | null>(null);
  const [saving, setSaving] = useState(false);
  const [shortcut, setShortcut] = useState('');
  useEffect(() => {
    let active = true;
    void getQuickFillPreferences()
      .then((value) => {
        if (active) setPrefs(value);
      })
      .catch(() => {
        if (active) showToast('error', 'Could not load quick fill settings.');
      });
    void chrome.commands
      ?.getAll()
      .then((commands) => {
        if (active)
          setShortcut(commands.find((command) => command.name === 'quick-fill')?.shortcut ?? '');
      })
      .catch(() => {});
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
      showToast('error', 'Could not save quick fill settings. Try again.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="mb-8 border-b border-gray-200 pb-8 dark:border-gray-700">
      <h3 className="mb-1 text-base font-semibold text-gray-800 dark:text-gray-200">Quick Fill</h3>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
        Fill empty fields from the page or a keyboard shortcut. Existing answers are kept.
      </p>
      <label className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
        <input
          id="quick-fill-enabled"
          type="checkbox"
          checked={prefs?.enabled ?? false}
          disabled={!prefs || saving}
          onChange={(e) => void save({ enabled: e.target.checked })}
          className="h-4 w-4 accent-blue-600"
        />
        Show a floating Fill Form button on application forms
      </label>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        Drag the handle to move it. Use its menu to hide it on a page or site.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="text-gray-500 dark:text-gray-400">
          {shortcut ? `Keyboard shortcut: ${shortcut}` : 'No keyboard shortcut assigned'}
        </span>
        <button
          type="button"
          className="rounded text-blue-600 hover:underline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-blue-400"
          onClick={() => void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })}
        >
          Change Shortcut
        </button>
      </div>
      {!!prefs?.disabledSites.length && (
        <div className="mt-4">
          <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            Hidden on these sites
          </p>
          <ul className="space-y-2">
            {prefs.disabledSites.map((site) => (
              <li key={site} className="flex items-center justify-between gap-4 text-sm">
                <span className="break-all text-gray-500 dark:text-gray-400">{site}</span>
                <button
                  type="button"
                  disabled={saving}
                  className="shrink-0 rounded text-blue-600 hover:underline disabled:opacity-50 dark:text-blue-400"
                  onClick={() =>
                    void save((current) => ({
                      disabledSites: current.disabledSites.filter((value) => value !== site),
                    }))
                  }
                >
                  Show Button
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
