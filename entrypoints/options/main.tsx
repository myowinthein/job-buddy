import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import { ToastProvider } from '@/src/components/ui/Toast';
import { initTheme } from '@/src/utils/theme';
import { LOGO_ICON_SRC } from '@/src/utils/branding';
import './style.css';

(async () => {
  // index.html's <link rel="icon"> is static markup and can't reference
  // import.meta.env.DEV directly — swap it at runtime instead, same amber
  // vs. blue distinction as the in-app logo.
  document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.setAttribute('href', LOGO_ICON_SRC);
  await initTheme();
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ToastProvider>
        <App />
      </ToastProvider>
    </React.StrictMode>,
  );
})();
