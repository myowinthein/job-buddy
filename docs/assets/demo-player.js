(() => {
  const figure = document.querySelector('[data-demo-player]');
  if (!figure) return;
  const video = figure.querySelector('video');
  const videoPanel = figure.querySelector('[data-demo-video]');
  const still = figure.querySelector('[data-demo-still]');
  const playback = figure.querySelector('[data-demo-playback]');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let visible = false;
  let failed = false;
  let pausedByUser = false;
  let playbackRevision = 0;

  function setSource() {
    const dark = document.documentElement.classList.contains('dark');
    const source = dark ? video.dataset.dark : video.dataset.light;
    if (video.getAttribute('src') !== source) {
      video.src = source;
      video.load();
    }
  }
  function showReadyFrame() {
    const ready = !motion.matches && !failed && video.readyState >= 2;
    videoPanel.hidden = !ready;
    still.hidden = ready;
  }
  async function syncPlayback() {
    const revision = ++playbackRevision;
    const showVideo = !motion.matches && !failed;
    showReadyFrame();
    playback.hidden = !showVideo;
    playback.textContent = pausedByUser ? 'Play video' : 'Pause video';
    if (!showVideo || !visible || document.hidden) {
      video.pause();
      return;
    }
    setSource();
    showReadyFrame();
    if (pausedByUser) {
      video.pause();
      return;
    }
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
  video.addEventListener('loadeddata', showReadyFrame);
  video.addEventListener('emptied', showReadyFrame);
  video.addEventListener('play', () => {
    if (!visible || document.hidden || motion.matches || failed || pausedByUser) video.pause();
  });
  playback.addEventListener('click', () => {
    pausedByUser = !pausedByUser;
    void syncPlayback();
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
    void syncPlayback();
  });
  motion.addEventListener('change', () => void syncPlayback());
  void syncPlayback();
})();
