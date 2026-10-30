import type { ReactNode } from 'react';
import { devContext } from './context';
import { scenarioById } from './scenarios';

export default function SimulationShell({ children }: { children: ReactNode }) {
  const context = devContext();
  if (!context) return children;
  const scenario = scenarioById(context.scenario);
  return (
    <div className="flex flex-col h-screen">
      <aside
        aria-label="Development simulation"
        className="relative z-[60] flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100 text-xs shrink-0"
      >
        <p>
          <strong>Simulation active</strong>: {scenario?.label}. Changes stay in this tab.
        </p>
        <div className="flex gap-4">
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => window.dispatchEvent(new Event('jb:dev:open-tools'))}
          >
            Dev Tools
          </button>
          <a className="underline underline-offset-2" href={`${location.pathname}?devTools=1`}>
            Exit Simulation
          </a>
        </div>
      </aside>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}
