import { useEffect, useRef, useState } from 'react';
import { PROFILE_PRESETS, type PreviewPreset } from './quickPreview';
import type { DevSurface, SurfaceState } from './surface';

const PROFILE_OPTIONS = [{ id: 'original', label: 'Original' }, ...PROFILE_PRESETS] as const;
const groupCls =
  'inline-flex shrink-0 overflow-hidden rounded-md border border-amber-400 bg-white/70 divide-x divide-amber-300 dark:border-amber-700 dark:bg-amber-900/50 dark:divide-amber-700';
const optionCls = (selected: boolean) =>
  `px-2.5 py-1 transition-colors focus-visible:relative focus-visible:z-10 focus-visible:outline-offset-[-2px] ${selected ? 'bg-amber-200 font-medium dark:bg-amber-700' : 'hover:bg-amber-100 dark:hover:bg-amber-800'}`;

function IntegrationControl({
  label,
  enabled,
  disabled,
  onChange,
}: {
  label: string;
  enabled: boolean;
  disabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-disabled={disabled}
      onClick={() => onChange(!enabled)}
      className="inline-flex items-center gap-2 rounded-md py-1"
    >
      <span className="text-amber-800 dark:text-amber-200">{label}</span>
      <span
        aria-hidden="true"
        className={`flex h-4 w-7 items-center rounded-full p-0.5 ${enabled ? 'bg-amber-700 dark:bg-amber-500' : 'bg-amber-950/20 dark:bg-amber-100/20'}`}
      >
        <span
          className={`h-3 w-3 rounded-full bg-white transition-transform ${enabled ? 'translate-x-3' : ''}`}
        />
      </span>
    </button>
  );
}

export default function DevToolbar({
  surface,
  onNavigate,
}: {
  surface: DevSurface;
  onNavigate: (url: string) => Promise<void>;
}) {
  const [state, setState] = useState<SurfaceState>();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
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
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch {
      setError('Could not switch test data. Try again.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  const startPreview = async (
    preset: PreviewPreset,
    noKey = missingKey,
    driveConnected = state?.driveConnected ?? false,
  ) => {
    if (
      !state ||
      pending.current ||
      (state.preset === preset && noKey === missingKey && driveConnected === state.driveConnected)
    )
      return;
    if (!surface.canLeave()) return;
    await perform(async () => onNavigate(await surface.prepare(preset, noKey, driveConnected)));
  };

  const setKey = async (enabled: boolean) => {
    if (!state || pending.current || enabled === !missingKey) return;
    if (!state.preset) return startPreview('saved', !enabled);
    await perform(async () => {
      await surface.setKeyEnabled(enabled);
      setState(await surface.state());
    });
  };

  const setDrive = async (enabled: boolean) => {
    if (!state || pending.current || enabled === state.driveConnected) return;
    if (!state.preset) return startPreview('saved', missingKey, enabled);
    await perform(async () => {
      await surface.setDriveConnected(enabled);
      setState(await surface.state());
    });
  };

  const exit = async () => {
    if (!context || pending.current) return;
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
          <div role="group" aria-label="Profile mode" className={groupCls}>
            {PROFILE_OPTIONS.map((preset) => {
              const selected =
                preset.id === 'original'
                  ? !context || state?.preset === 'saved'
                  : state?.preset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-disabled={busy || !state}
                  aria-pressed={selected}
                  onClick={() => void (preset.id === 'original' ? exit() : startPreview(preset.id))}
                  className={optionCls(selected)}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>
        <IntegrationControl
          label="API key"
          enabled={!missingKey}
          disabled={busy || !state}
          onChange={(enabled) => void setKey(enabled)}
        />
        <IntegrationControl
          label="Google Drive"
          enabled={state?.driveConnected ?? false}
          disabled={busy || !state}
          onChange={(enabled) => void setDrive(enabled)}
        />
      </div>
      {error && (
        <p role="alert" className="mt-2 text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </aside>
  );
}
