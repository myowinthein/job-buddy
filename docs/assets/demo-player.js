(() => {
  const figure = document.querySelector('[data-demo-player]');
  if (!figure) return;
  const video = figure.querySelector('video');
  const videoPanel = figure.querySelector('[data-demo-video]');
  const still = figure.querySelector('[data-demo-still]');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let visible = false;
  let failed = false;
  let playbackRevision = 0;

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
    const revision = ++playbackRevision;
    const showVideo = !motion.matches && !failed;
    videoPanel.hidden = !showVideo;
    still.hidden = showVideo;
    if (!showVideo || !visible || document.hidden) {
      video.pause();
      return;
    }
    setSource();
    video.muted = true;
    try {
      await video.play();
    } catch {
      // Ignore superseded play requests, such as a theme change during loading.
      if (revision !== playbackRevision) return;
      failed = true;
      void syncPlayback();
    }
  }
  video.addEventListener('play', () => {
    if (!visible || document.hidden || motion.matches || failed) video.pause();
  });
  video.addEventListener('error', () => {
    failed = true;
    void syncPlayback();
  });
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    void syncPlayback();
  }).observe(figure);
  document.addEventListener('visibilitychange', () => void syncPlayback());
  document.addEventListener('jb-theme-change', () => {
    if (video.hasAttribute('src') && !motion.matches && !failed) setSource();
    void syncPlayback();
  });
  motion.addEventListener('change', () => void syncPlayback());
  void syncPlayback();
})();
