import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import { initTheme } from '@/src/utils/theme';
import './style.css';

function updatePopupHeight() {
  const nativePopup = chrome.extension.getViews({ type: 'popup' }).includes(window);
  const availableTop = 'availTop' in screen && typeof screen.availTop === 'number'
    ? screen.availTop
    : 0;
  // Chrome sizes its popup from the content, so its current viewport cannot be its height limit.
  const availableHeight = nativePopup
    ? availableTop + screen.availHeight - window.screenY
    : window.innerHeight;
  document.documentElement.style.setProperty('--popup-max-height', `${Math.min(600, availableHeight)}px`);
}

updatePopupHeight();
window.addEventListener('resize', updatePopupHeight);

(async () => {
  if (import.meta.env.DEV) {
    const { installDevelopmentSession } = await import('@/src/devtools/sessionChrome');
    await installDevelopmentSession('popup');
  }
  await initTheme();
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
})();
