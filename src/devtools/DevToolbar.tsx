import { useEffect, useState } from 'react';
import { PROFILE_PRESETS, type PreviewPreset } from './quickPreview';
import type { DevSurface, SurfaceState } from './surface';

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
    if (!surface.canLeave()) return;
    await perform(() => onNavigate(surface.exitUrl()));
  };

  return (
    <aside
      aria-label="Development controls"
      className="relative z-[60] shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
    >
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {context && (
          <span
            title="Changes stay in this tab and reset on refresh. Gemini and Drive are simulated."
            className="font-medium text-amber-800 dark:text-amber-200"
          >
            Temporary data
          </span>
        )}
        <div role="group" aria-label="Profile preset" className="flex flex-wrap items-center gap-1">
          <span className="mr-2 text-amber-800 dark:text-amber-200">Profile</span>
          {PROFILE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={busy || !state}
              aria-pressed={state?.preset === preset.id}
              onClick={() => void startPreview(preset.id)}
              className={`rounded-md border px-2.5 py-1 transition-colors disabled:opacity-50 ${state?.preset === preset.id ? 'border-amber-600 bg-amber-200 font-medium dark:border-amber-500 dark:bg-amber-800' : 'border-amber-300 bg-white/70 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-900/50 dark:hover:bg-amber-800'}`}
            >
              {preset.label}
            </button>
          ))}
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
        {context && (
          <button
            type="button"
            disabled={busy || !state}
            onClick={() => void exit()}
            className="rounded-sm underline underline-offset-2 sm:ml-auto"
          >
            Use saved data
          </button>
        )}
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
