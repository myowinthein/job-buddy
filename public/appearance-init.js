// A paint-only hint: the app still reads its authoritative, session-aware setting.
(() => {
  const key = 'jb:appearance';
  const valid = (value) => ['system', 'light', 'dark'].includes(value);
  let preference;
  try {
    const cached = localStorage.getItem(key);
    if (valid(cached)) preference = cached;
  } catch {
    // Appearance must still work when web storage is unavailable.
  }
  let dark = preference === 'dark';
  if (preference !== 'light' && preference !== 'dark') {
    try {
      dark = matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      // Use light when the system preference is unavailable.
    }
  }
  document.documentElement.classList.toggle('dark', dark);
  document.addEventListener('jb:theme-applied', (event) => {
    if (!valid(event.detail)) return;
    try {
      localStorage.setItem(key, event.detail);
    } catch {
      // This optional hint never prevents applying the real preference.
    }
  });
})();
