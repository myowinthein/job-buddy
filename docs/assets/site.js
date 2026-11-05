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
document.querySelectorAll('[data-enlarge]').forEach((button) => {
  button.addEventListener('click', () => {
    const img = button.querySelector('img');
    lastTrigger = button;
    dialogImage.src = img.currentSrc || img.src;
    dialogImage.alt = img.alt;
    dialogCaption.textContent = img.alt;
    dialog.showModal();
  });
});
dialog?.querySelector('button')?.addEventListener('click', () => dialog.close());
dialog?.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
});
dialog?.addEventListener('close', () => lastTrigger?.focus());

document.querySelectorAll('[data-compare]').forEach((group) => {
  const figure = group.closest('figure');
  group.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => {
      group
        .querySelectorAll('button')
        .forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
      figure.querySelectorAll('[data-comparison]').forEach((panel) => {
        panel.hidden = panel.dataset.comparison !== button.dataset.show;
      });
    });
  });
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
