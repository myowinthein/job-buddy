// Shared by the guides and demo; apply the initial theme before paint.
(() => {
  const storageKey = 'job-buddy-theme';
  const root = document.documentElement;
  const validPreference = (value) => value === 'light' || value === 'dark' ? value : null;
  let preference = null;
  let systemTheme;
  try {
    preference = validPreference(localStorage.getItem(storageKey));
  } catch {
    /* Keep the preference in memory when storage is unavailable. */
  }
  try {
    systemTheme = matchMedia('(prefers-color-scheme: dark)');
  } catch {
    /* Fall back to light if the system preference is unavailable. */
  }

  function applyTheme() {
    const dark = preference === 'dark' || (preference === null && !!systemTheme?.matches);
    root.classList.toggle('dark', dark);
    const button = document.querySelector('.theme-toggle, #theme');
    const label = dark ? 'Switch to light mode' : 'Switch to dark mode';
    button?.setAttribute('aria-label', label);
    button?.setAttribute('title', label);
    // The label describes the next action; clear toggle semantics from existing headers.
    button?.removeAttribute('aria-pressed');
    document.dispatchEvent(new Event('jb-theme-change'));
  }

  applyTheme();
  systemTheme?.addEventListener('change', () => {
    if (preference === null) applyTheme();
  });
  window.addEventListener('storage', (event) => {
    if (event.key !== storageKey && event.key !== null) return;
    try {
      if (event.storageArea !== localStorage) return;
    } catch {
      return;
    }
    preference = validPreference(event.newValue);
    applyTheme();
  });

  function bindControl() {
    document.querySelector('.theme-toggle, #theme')?.addEventListener('click', () => {
      preference = root.classList.contains('dark') ? 'light' : 'dark';
      applyTheme();
      try {
        localStorage.setItem(storageKey, preference);
      } catch {
        /* Keep the selected theme for this visit. */
      }
    });
    applyTheme();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindControl, { once: true });
  } else {
    bindControl();
  }
})();
