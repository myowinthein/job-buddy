// Set the theme before paint; browsing still works when storage is unavailable.
(() => {
  let saved;
  try {
    saved = localStorage.getItem('theme');
  } catch {
    /* Use the system preference. */
  }
  const dark =
    saved === 'dark' || (saved !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
})();
