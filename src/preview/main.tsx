import React from 'react';
import ReactDOM from 'react-dom/client';
import { createPreviewChrome } from './chrome';
import '../../entrypoints/options/style.css';
import './style.css';

// Install before importing the actual Options entrypoint dependencies. The
// normal Chrome object is never used to read an installed extension's data.
let themeStorage: Storage | undefined;
try {
  themeStorage = window.localStorage;
} catch {
  /* Storage may be unavailable. */
}

Object.defineProperty(window, 'chrome', {
  configurable: true,
  value: createPreviewChrome(
    new URLSearchParams(window.location.search).get('profile') === 'empty'
      ? { id: 'preview-empty' }
      : undefined,
    themeStorage,
  ),
});

const [{ default: App }, { ToastProvider }, { initTheme }] = await Promise.all([
  import('@/entrypoints/options/App'),
  import('@/src/components/ui/Toast'),
  import('@/src/utils/theme'),
]);

await initTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <div className="preview-shell">
      <aside className="preview-notice" aria-label="Preview information">
        <strong>Preview · sample data</strong>
        <span>
          Profile changes reset on refresh. Appearance is remembered. Gemini and Google Drive are
          disabled.
        </span>
        <span>
          <a className="underline" href="/">
            Sample profile
          </a>{' '}
          ·{' '}
          <a className="underline" href="/?profile=empty">
            Empty profile
          </a>
        </span>
      </aside>
      <div className="preview-app">
        <ToastProvider>
          <App />
        </ToastProvider>
      </div>
    </div>
  </React.StrictMode>,
);
