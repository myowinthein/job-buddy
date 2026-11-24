import React from 'react';
import ReactDOM from 'react-dom/client';
import { ToastProvider } from '@/src/components/ui/Toast';
import './style.css';

(async () => {
  const preview = import.meta.env.DEV ? await import('@/src/devtools/bootstrap') : null;
  // Fail closed if simulation setup fails: never mount a live App under a simulation URL.
  try {
    if (import.meta.env.DEV && location.protocol === 'chrome-extension:') {
      const { installDevelopmentSession } = await import('@/src/devtools/sessionChrome');
      await installDevelopmentSession('options');
    } else preview?.initializeDevPreview();
  } catch {
    const root = document.getElementById('root');
    if (root) {
      root.textContent = 'Could not load temporary data. ';
      const back = document.createElement('a');
      back.href = location.pathname;
      back.textContent = 'Use original data';
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
  const DevShell =
    import.meta.env.DEV && !new URLSearchParams(location.search).has('devEmbedded')
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
})();
