(() => {
  const figure = document.querySelector('[data-demo-player]');
  if (!figure) return;
  const video = figure.querySelector('video');
  const toggle = figure.querySelector('[data-demo-toggle]');
  const group = figure.querySelector('[data-compare]');
  const demoButton = group.querySelector('[data-show="demo"]');
  const stillButton = group.querySelector('[data-show="after"]');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let visible = false;
  let wantsPlay = false;
  const selected = () => !video.closest('[data-comparison]').hidden;

  function updateControls() {
    toggle.hidden = !selected();
    toggle.textContent = video.paused ? 'Play demo' : 'Pause demo';
  }
  function setSource() {
    const dark = document.documentElement.classList.contains('dark');
    const source = dark ? video.dataset.dark : video.dataset.light;
    video.poster = dark ? video.dataset.posterDark : video.dataset.posterLight;
    if (video.getAttribute('src') !== source) {
      video.src = source;
      video.load();
    }
  }
  async function syncPlayback() {
    if (!selected() || !visible || document.hidden || !wantsPlay) {
      video.pause();
      updateControls();
      return;
    }
    setSource();
    video.muted = true;
    try {
      await video.play();
    } catch {
      // A browser can require an explicit Play action even for muted video.
    }
    updateControls();
  }
  video.controls = false;
  demoButton.hidden = false;
  group.addEventListener('click', (event) => {
    if (!event.target.closest('[data-show]')) return;
    wantsPlay = selected();
    if (wantsPlay) video.currentTime = 0;
    void syncPlayback();
  });
  toggle.addEventListener('click', () => {
    wantsPlay = video.paused;
    void syncPlayback();
  });
  video.addEventListener('play', updateControls);
  video.addEventListener('pause', updateControls);
  video.addEventListener('error', () => {
    wantsPlay = false;
    stillButton.click();
    demoButton.hidden = true;
  });
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    void syncPlayback();
  }).observe(figure);
  document.addEventListener('visibilitychange', () => void syncPlayback());
  document.addEventListener('jb-theme-change', () => {
    if (video.hasAttribute('src')) setSource();
    void syncPlayback();
  });
  motion.addEventListener('change', () => {
    if (motion.matches) stillButton.click();
  });
  if (!motion.matches) demoButton.click();
  updateControls();
})();
