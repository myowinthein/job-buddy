import { useEffect, useRef, useState, type ReactNode } from 'react';
import { scenarioById } from './scenarios';
import DevToolbar from './DevToolbar';
import { createDevSurface, type DevSurface, type SurfaceState } from './surface';
import { cleanupPreviewSeeds } from './quickPreview';

export default function SimulationShell({ children }: { children: ReactNode }) {
  if (!import.meta.env.DEV) return children;
  return <DevelopmentShell>{children}</DevelopmentShell>;
}

function DevelopmentShell({ children }: { children: ReactNode }) {
  const [surface, setSurface] = useState<DevSurface>(
    () => window.__JB_DEV_SURFACE__ ?? createDevSurface(),
  );
  const [state, setState] = useState<SurfaceState>();
  const container = useRef<HTMLDivElement>(null);
  const currentFrame = useRef<HTMLIFrameElement | null>(null);
  const pendingCleanup = useRef<(() => void) | null>(null);
  const activeCleanup = useRef<(() => void) | null>(null);
  const [embedded, setEmbedded] = useState(false);
  const context = state?.context;
  const scenario = scenarioById(context?.scenario ?? null);

  useEffect(() => {
    let active = true;
    const refresh = () =>
      void surface
        .state()
        .then((next) => {
          if (!active) return;
          setState(next);
          const child = currentFrame.current?.contentWindow;
          if (child) {
            const url = new URL(child.location.href);
            url.searchParams.delete('devEmbedded');
            history.replaceState(history.state, '', url);
          }
        })
        .catch(() => {
          /* The toolbar provides the recovery message. */
        });
    refresh();
    const unsubscribe = surface.subscribe(refresh);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [surface]);

  useEffect(
    () => () => {
      pendingCleanup.current?.();
      activeCleanup.current?.();
    },
    [],
  );

  const navigate = (href: string) =>
    new Promise<void>((resolve, reject) => {
      // Keep the current screen visible until a fresh, isolated document has mounted.
      const frame = document.createElement('iframe');
      const url = new URL(href);
      if (url.origin !== location.origin) throw new Error('Unexpected test data origin');
      url.searchParams.set('devEmbedded', '1');
      frame.src = url.href;
      frame.title = 'Loading test data';
      frame.className = 'absolute inset-0 h-full w-full border-0 invisible';
      let observer: MutationObserver | undefined;
      let committed = false;
      container.current!.inert = true;
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Test data did not load'));
      }, 15_000);
      const cleanup = () => {
        clearTimeout(timeout);
        observer?.disconnect();
        frame.onload = null;
        if (container.current) container.current.inert = false;
        if (!committed) frame.remove();
      };
      pendingCleanup.current = cleanup;
      frame.onload = () => {
        const child = frame.contentWindow as (Window & typeof globalThis) | null;
        const doc = frame.contentDocument;
        if (!child || !doc) return;
        const ready = () => {
          if (!doc.querySelector('[data-dev-ready]') || !child.__JB_DEV_SURFACE__) return;
          committed = true;
          cleanup();
          pendingCleanup.current = null;
          activeCleanup.current?.();
          const previous = currentFrame.current;
          currentFrame.current = frame;
          frame.title = 'Job Buddy options';
          frame.classList.remove('invisible');
          previous?.remove();
          setEmbedded(true);
          setSurface(child.__JB_DEV_SURFACE__);
          url.searchParams.delete('devEmbedded');
          history.replaceState(history.state, '', url);
          cleanupPreviewSeeds(url.searchParams.get('devPreviewSeed'));
          const sync = () => {
            document.documentElement.classList.toggle(
              'dark',
              doc.documentElement.classList.contains('dark'),
            );
            document.title = doc.title;
          };
          sync();
          const theme = new MutationObserver(sync);
          theme.observe(doc.documentElement, { attributes: true, attributeFilter: ['class'] });
          const title = new MutationObserver(sync);
          if (doc.querySelector('title'))
            title.observe(doc.querySelector('title')!, { childList: true });
          activeCleanup.current = () => {
            theme.disconnect();
            title.disconnect();
          };
          resolve();
        };
        observer = new MutationObserver(ready);
        observer.observe(doc.documentElement, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ['data-dev-ready'],
        });
        ready();
      };
      container.current!.append(frame);
    });
  return (
    <div className="flex flex-col h-screen">
      <DevToolbar surface={surface} onNavigate={navigate} />
      {context && !context.quickPreview && (
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
      )}
      <div ref={container} className="relative flex-1 min-h-0 [&>div]:h-full">
        {!embedded && children}
      </div>
    </div>
  );
}
