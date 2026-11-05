import { useEffect, useState } from 'react';
import { PROFILE_PRESETS, type PreviewPreset } from './quickPreview';
import type { DevSurface, SurfaceState } from './surface';

const PROFILE_OPTIONS = [{ id: 'original', label: 'Original' }, ...PROFILE_PRESETS] as const;

export default function DevToolbar({
  surface,
  onNavigate,
}: {
  surface: DevSurface;
  onNavigate: (url: string) => Promise<void>;
}) {
  const [state, setState] = useState<SurfaceState>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const context = state?.context;
  const missingKey = state?.missingKey ?? false;

  useEffect(() => {
    let active = true;
    let sequence = 0;
    const refresh = async () => {
      const revision = ++sequence;
      try {
        const next = await surface.state();
        if (active && revision === sequence) setState(next);
      } catch {
        if (active) setError('Could not read the test data.');
      }
    };
    void refresh();
    const unsubscribe = surface.subscribe(() => void refresh());
    return () => {
      active = false;
      unsubscribe();
    };
  }, [surface]);

  const perform = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch {
      setError('Could not switch test data. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const startPreview = async (preset: PreviewPreset, noKey = missingKey) => {
    if (!surface.canLeave()) return;
    await perform(async () => onNavigate(await surface.prepare(preset, noKey)));
  };

  const toggleKey = async () => {
    if (!state?.preset) return startPreview('saved', !missingKey);
    await perform(async () => {
      await surface.toggleKey();
      setState(await surface.state());
    });
  };

  const exit = async () => {
    if (!context) return;
    if (!surface.canLeave()) return;
    await perform(() => onNavigate(surface.exitUrl()));
  };

  return (
    <aside
      aria-label="Development controls"
      className="relative z-[60] shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
    >
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <span
            title={
              context
                ? 'Changes stay in this tab and reset on refresh. Gemini and Drive are simulated.'
                : 'Original uses your saved data. Other modes use temporary data.'
            }
            className="text-amber-800 dark:text-amber-200"
          >
            Profile
          </span>
          <div
            role="group"
            aria-label="Profile mode"
            className="inline-flex shrink-0 overflow-hidden rounded-md border border-amber-400 bg-white/70 divide-x divide-amber-300 dark:border-amber-700 dark:bg-amber-900/50 dark:divide-amber-700"
          >
            {PROFILE_OPTIONS.map((preset) => {
              const selected =
                preset.id === 'original'
                  ? !context || state?.preset === 'saved'
                  : state?.preset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={busy || !state}
                  aria-pressed={selected}
                  onClick={() => void (preset.id === 'original' ? exit() : startPreview(preset.id))}
                  className={`px-2.5 py-1 transition-colors focus-visible:relative focus-visible:z-10 focus-visible:outline-offset-[-2px] disabled:opacity-50 ${selected ? 'bg-amber-200 font-medium dark:bg-amber-700' : 'hover:bg-amber-100 dark:hover:bg-amber-800'}`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={missingKey}
          disabled={busy || !state}
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
        {busy && <span role="status">Switching data…</span>}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </aside>
  );
}
