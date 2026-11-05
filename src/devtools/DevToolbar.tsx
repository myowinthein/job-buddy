import { useEffect, useRef, useState } from 'react';
import { devContext } from './context';
import { getSimulation } from './bootstrap';
import {
  PROFILE_PRESETS,
  exitPreviewUrl,
  navigatePreview,
  preparePreview,
  previewUrl,
  readQuickPreview,
  type PreviewPreset,
} from './quickPreview';
import {
  clearGeminiSettings,
  getGeminiSettings,
  saveGeminiSettings,
  type GeminiSettings,
} from '@/src/utils/storage';
import { DEFAULT_GEMINI_MODEL } from '@/src/resume-ai/types';

export default function DevToolbar() {
  const context = devContext();
  const quick = readQuickPreview();
  const quickPreset = quick?.preset;
  const quickSeedId = quick?.seedId;
  const [missingKey, setMissingKey] = useState(
    quick?.missingKey ?? context?.scenario === 'ai-no-key',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const savedSettings = useRef<GeminiSettings | null>(null);

  useEffect(() => {
    if (!quickPreset || !getSimulation()) return;
    let active = true;
    const refresh = async () => {
      try {
        const settings = await getGeminiSettings();
        if (!active) return;
        const missing = !settings.apiKey;
        setMissingKey(missing);
        const url = new URL(location.href);
        if (missing) url.searchParams.set('devNoKey', '1');
        else url.searchParams.delete('devNoKey');
        history.replaceState(history.state, '', url);
      } catch {
        if (active) setError('Could not read the preview key state.');
      }
    };
    void refresh();
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && ('geminiApiKey' in changes || 'geminiSettingsMeta' in changes))
        void refresh();
    };
    chrome.storage.onChanged.addListener(changed);
    return () => {
      active = false;
      chrome.storage.onChanged.removeListener(changed);
    };
  }, [quickPreset, quickSeedId]);

  const startPreview = async (preset: PreviewPreset, noKey = missingKey) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const seed = await preparePreview(preset);
      navigatePreview(previewUrl(preset, noKey, seed));
    } catch {
      setError('Could not open the preview. Try a profile preset again.');
    } finally {
      setBusy(false);
    }
  };

  const toggleKey = async () => {
    if (!quick || !getSimulation()) {
      await startPreview('saved', !missingKey);
      return;
    }
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const settings = await getGeminiSettings();
      if (!missingKey) {
        savedSettings.current = settings;
        await clearGeminiSettings();
        setMissingKey(true);
      } else {
        const saved = savedSettings.current;
        const result = await saveGeminiSettings(
          saved?.apiKey ?? 'simulated-key',
          saved?.model ?? DEFAULT_GEMINI_MODEL,
          saved?.preference ?? 'auto',
          settings.revision,
        );
        if (!result) throw new Error('Preview key changed');
        setMissingKey(false);
      }
    } catch {
      setError('Could not change the preview key state. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside
      aria-label="Development controls"
      className="relative z-[60] shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
    >
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <span
          title={
            context
              ? 'Changes stay in this tab and reset on refresh. Providers are simulated.'
              : 'Preview controls use isolated data. Your saved extension data stays unchanged.'
          }
          className="inline-flex items-center gap-2"
        >
          <strong className="text-[11px] tracking-wide">DEV</strong>
          <span className="text-amber-800 dark:text-amber-200">
            {context
              ? quick?.preset === 'saved'
                ? 'Preview · saved profile'
                : 'Preview'
              : chrome.runtime.id
                ? 'Saved data'
                : 'Sample data'}
          </span>
        </span>
        <div role="group" aria-label="Profile preset" className="flex flex-wrap items-center gap-1">
          <span className="mr-1">Profile</span>
          {PROFILE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={busy}
              aria-pressed={quick?.preset === preset.id}
              onClick={() => void startPreview(preset.id)}
              className={`rounded-md border px-2.5 py-1 transition-colors disabled:opacity-50 ${quick?.preset === preset.id ? 'border-amber-600 bg-amber-200 font-medium dark:border-amber-500 dark:bg-amber-800' : 'border-transparent hover:border-amber-300 hover:bg-amber-100 dark:hover:border-amber-800 dark:hover:bg-amber-900'}`}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={missingKey}
          disabled={busy}
          onClick={() => void toggleKey()}
          className="inline-flex items-center gap-2 rounded-md py-1 disabled:opacity-50"
        >
          <span>Missing API key</span>
          <span
            aria-hidden="true"
            className={`flex h-4 w-7 items-center rounded-full p-0.5 ${missingKey ? 'bg-amber-700 dark:bg-amber-500' : 'bg-amber-950/20 dark:bg-amber-100/20'}`}
          >
            <span
              className={`h-3 w-3 rounded-full bg-white transition-transform ${missingKey ? 'translate-x-3' : ''}`}
            />
          </span>
        </button>
        {context && (
          <button
            type="button"
            onClick={() => navigatePreview(exitPreviewUrl())}
            className="rounded-sm underline underline-offset-2 sm:ml-auto"
          >
            Exit preview
          </button>
        )}
        {busy && <span role="status">Updating preview…</span>}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </aside>
  );
}
