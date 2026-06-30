// ── Theme toggle ──────────────────────────────────────────────────────────
const THEME_KEY = 'jb-site-theme';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('theme-btn');
  if (btn) btn.textContent = theme === 'dark' ? '☀' : '☾';
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const prefer = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  applyTheme(saved || prefer);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

// ── Technical details toggle ──────────────────────────────────────────────
const TECH_KEY = 'jb-site-tech-mode';

function applyTechMode(on) {
  document.body.classList.toggle('tech-mode', on);
  const btn = document.getElementById('tech-btn');
  if (btn) {
    btn.textContent = on ? 'Hide technical details' : 'Show technical details';
    btn.classList.toggle('active', on);
  }
}

function initTechMode() {
  const saved = localStorage.getItem(TECH_KEY) === 'true';
  applyTechMode(saved);
}

function toggleTechMode() {
  const next = !document.body.classList.contains('tech-mode');
  localStorage.setItem(TECH_KEY, String(next));
  applyTechMode(next);
}

// ── Boot ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initTechMode();

  const themeBtn = document.getElementById('theme-btn');
  if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

  const techBtn = document.getElementById('tech-btn');
  if (techBtn) techBtn.addEventListener('click', toggleTechMode);
});
