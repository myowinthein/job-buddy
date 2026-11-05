// All form behavior is local. There is no submission endpoint or entry storage.
const form = document.querySelector('#application');
const completion = document.querySelector('#completion');
form.addEventListener('submit', (event) => {
  event.preventDefault();
  completion.hidden = false;
  completion.focus();
});
document.querySelector('#submit').disabled = false;
form.addEventListener('reset', (event) => {
  event.preventDefault();
  window.scrollTo(0, 0);
  location.reload();
});
const theme = document.querySelector('#theme');
function labelTheme() {
  const dark = document.documentElement.classList.contains('dark');
  theme.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  theme.setAttribute('title', dark ? 'Switch to light mode' : 'Switch to dark mode');
  theme.querySelector('[data-theme-label]').textContent = dark ? 'Light mode' : 'Dark mode';
}
theme.addEventListener('click', () => {
  const dark = document.documentElement.classList.toggle('dark');
  try {
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  } catch {
    /* Keep this visit's theme. */
  }
  labelTheme();
});
labelTheme();
