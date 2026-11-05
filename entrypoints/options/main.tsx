import React from 'react';
import ReactDOM from 'react-dom/client';
import { ToastProvider } from '@/src/components/ui/Toast';
import { LOGO_ICON_SRC } from '@/src/utils/branding';
import './style.css';

(async () => {
  // index.html's <link rel="icon"> is static markup and can't reference
  // import.meta.env.DEV directly — swap it at runtime instead, same amber
  // vs. blue distinction as the in-app logo.
  document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.setAttribute('href', LOGO_ICON_SRC);
  const devTools = import.meta.env.DEV ? await import('@/src/devtools/bootstrap') : null;
  // Fail closed if simulation setup fails: never mount a live App under a simulation URL.
  try {
    devTools?.initializeDevTools();
  } catch {
    const root = document.getElementById('root');
    if (root) {
      root.textContent = 'Could not start this simulation. ';
      const back = document.createElement('a');
      back.href = `${location.pathname}?devTools=1`;
      back.textContent = 'Return to Dev Tools';
      root.append(back);
    }
    return;
  }
  if (import.meta.env.DEV) {
    const { createDevSurface } = await import('@/src/devtools/surface');
    window.__JB_DEV_SURFACE__ = createDevSurface();
    if (new URLSearchParams(location.search).has('devEmbedded'))
      document.getElementById('root')!.style.height = '100vh';
  }
  const [{ default: App }, { initTheme }] = await Promise.all([
    import('./App'),
    import('@/src/utils/theme'),
  ]);
  const DevShell = import.meta.env.DEV && !new URLSearchParams(location.search).has('devEmbedded')
    ? (await import('@/src/devtools/SimulationShell')).default
    : React.Fragment;
  await initTheme();
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ToastProvider>
        <DevShell>
          <App />
        </DevShell>
      </ToastProvider>
    </React.StrictMode>,
  );
  const root = document.getElementById('root');
  if (root) devTools?.startScenario(root);
})();
