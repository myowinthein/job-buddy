const root = document.documentElement;
const themeButton = document.querySelector('.theme-toggle');
let userTheme = false;
try {
  userTheme = ['light', 'dark'].includes(localStorage.getItem('theme'));
} catch {
  /* Storage is optional. */
}
function updateTheme() {
  const dark = root.classList.contains('dark');
  themeButton?.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  themeButton?.setAttribute('title', dark ? 'Switch to light mode' : 'Switch to dark mode');
  themeButton?.setAttribute('aria-pressed', String(dark));
  document.querySelectorAll('img[data-light][data-dark]').forEach((img) => {
    img.src = dark ? img.dataset.dark : img.dataset.light;
  });
  document.dispatchEvent(new Event('jb-theme-change'));
}
themeButton?.addEventListener('click', () => {
  root.classList.toggle('dark');
  userTheme = true;
  try {
    localStorage.setItem('theme', root.classList.contains('dark') ? 'dark' : 'light');
  } catch {
    /* Keep the selected theme for this visit. */
  }
  updateTheme();
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
  if (!userTheme) {
    root.classList.toggle('dark', event.matches);
    updateTheme();
  }
});
updateTheme();

const dialog = document.querySelector('.image-dialog');
const dialogImage = dialog?.querySelector('img');
const dialogCaption = dialog?.querySelector('p');
let lastTrigger;
function sizeViewer() {
  if (dialogImage?.naturalWidth) {
    // One source pixel per screen pixel, including browser zoom / Retina density.
    dialog.style.setProperty('--image-width', `${dialogImage.naturalWidth / devicePixelRatio}px`);
  }
}
dialogImage?.addEventListener('load', sizeViewer);
window.addEventListener('resize', sizeViewer);
document.querySelectorAll('[data-enlarge]').forEach((button) => {
  button.addEventListener('click', () => {
    const img = button.querySelector('img');
    lastTrigger = button;
    dialogImage.src = img.currentSrc || img.src;
    dialogImage.alt = img.alt;
    dialogCaption.textContent = img.alt;
    sizeViewer();
    dialog.showModal();
  });
});
dialog?.querySelector('button')?.addEventListener('click', () => dialog.close());
dialog?.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
});
dialog?.addEventListener('close', () => lastTrigger?.focus());

document.querySelectorAll('[data-visual-tour]').forEach((tour) => {
  const controls = [...tour.querySelectorAll('[data-show-visual]')];
  const panels = [...tour.querySelectorAll('[data-visual-panel]')];
  const status = tour.querySelector('.visual-status');
  function select(button, announce = true) {
    controls.forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    panels.forEach((panel) => { panel.hidden = panel.id !== button.dataset.showVisual; });
    if (announce) {
      status.textContent = `${controls.indexOf(button) + 1} of ${controls.length}: ${button.textContent.trim()}`;
      scheduleChapter();
    }
  }
  controls.forEach((button, index) => {
    button.addEventListener('click', () => select(button));
    button.addEventListener('keydown', (event) => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % controls.length;
      if (event.key === 'ArrowLeft') next = (index + controls.length - 1) % controls.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = controls.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      controls[next].focus();
      select(controls[next]);
    });
  });
  tour.classList.add('is-enhanced');
  select(controls[0], false);
});

const chapters = [...document.querySelectorAll('main > [id]')];
const links = [...document.querySelectorAll('.chapter-nav a')];
// Use the current positions rather than only the last observer transition.
// This also handles jumping back to the top or expanding a long chapter.
let navigationFrame = 0;
function updateChapter() {
  navigationFrame = 0;
  const marker =
    (document.querySelector('.site-header')?.getBoundingClientRect().height || 0) + 100;
  let active = chapters[0];
  for (const chapter of chapters) {
    if (chapter.getBoundingClientRect().top <= marker) active = chapter;
    else break;
  }
  links.forEach((link) => {
    if (active && link.hash === '#' + active.id) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
}
function scheduleChapter() {
  if (!navigationFrame) navigationFrame = requestAnimationFrame(updateChapter);
}
window.addEventListener('scroll', scheduleChapter, { passive: true });
window.addEventListener('resize', scheduleChapter);
document.addEventListener('load', scheduleChapter, true);
updateChapter();
document.querySelectorAll('.mobile-contents a').forEach((link) => {
  link.addEventListener('click', () => {
    link.closest('details').open = false;
  });
});
document.querySelectorAll('[data-command-tabs]').forEach((group) => {
  const tabs = [...group.querySelectorAll('[role="tab"]')];
  const panels = [...group.querySelectorAll('[role="tabpanel"]')];
  function select(tab) {
    tabs.forEach((item) => {
      item.setAttribute('aria-selected', String(item === tab));
      item.tabIndex = item === tab ? 0 : -1;
    });
    panels.forEach((panel) => {
      panel.hidden = panel.id !== tab.getAttribute('aria-controls');
    });
    scheduleChapter();
  }
  function revealHash() {
    const target = document.getElementById(location.hash.slice(1));
    const panel = target?.closest('[role="tabpanel"]');
    if (!panels.includes(panel)) return;
    select(tabs.find((tab) => tab.getAttribute('aria-controls') === panel.id));
    const details = target.closest('details');
    if (details) details.open = true;
    target.scrollIntoView();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', (event) => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      select(tabs[next]);
      tabs[next].focus();
    });
  });
  group.classList.add('is-enhanced');
  select(tabs[0]);
  window.addEventListener('hashchange', revealHash);
  revealHash();
});

document.querySelectorAll('a[data-open-details]').forEach((link) => {
  function openDetails() {
    const target = document.getElementById(link.hash.slice(1));
    if (target instanceof HTMLDetailsElement) target.open = true;
  }
  link.addEventListener('click', openDetails);
  if (link.hash === location.hash) openDetails();
});
document.querySelectorAll('.copy-code').forEach((button) => {
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(
        button.parentElement.querySelector('code').textContent.trim(),
      );
      button.textContent = 'Copied';
      setTimeout(() => {
        button.textContent = 'Copy';
      }, 1500);
    } catch {
      button.textContent = 'Select and copy the code';
    }
  });
});
