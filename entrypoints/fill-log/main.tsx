import React from 'react';
import ReactDOM from 'react-dom/client';
import { FillLogPage } from '@/src/components/fill-log/FillLogPage';
import { initTheme } from '@/src/utils/theme';
import { LOGO_ICON_SRC } from '@/src/utils/branding';
import '../options/style.css';

await initTheme();
document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.setAttribute('href', LOGO_ICON_SRC);
const value = new URLSearchParams(location.search).get('tabId');
const tabId =
  value !== null && /^\d+$/.test(value) && Number.isSafeInteger(Number(value))
    ? Number(value)
    : null;
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <FillLogPage tabId={tabId} />
  </React.StrictMode>,
);
