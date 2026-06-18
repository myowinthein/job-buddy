let underlineIndex = 0;
let scrollResizeListener: (() => void) | null = null;

function updatePositions(): void {
  const elements = document.querySelectorAll<HTMLElement>('[data-jb-underline-id]');
  for (const el of Array.from(elements)) {
    const id = el.dataset.jbUnderlineId;
    if (!id) continue;
    const underline = document.getElementById(id);
    if (!underline) continue;
    const rect = el.getBoundingClientRect();
    underline.style.left  = `${rect.left + 1}px`;
    underline.style.top   = `${rect.bottom - 2}px`;
    underline.style.width = `${rect.width - 2}px`;
  }
}

function attachScrollResizeListener(): void {
  if (scrollResizeListener) return; // already attached for this run
  scrollResizeListener = updatePositions;
  window.addEventListener('scroll', scrollResizeListener, { passive: true });
  window.addEventListener('resize', scrollResizeListener, { passive: true });
}

export function applyHighlight(element: HTMLElement, confidence: number): void {
  element.dataset.jbHighlighted = '1';

  // Fix 1: save and neutralize element's own border-bottom and outline to
  // prevent them from conflicting with the injected underline div
  if (!('jbOrigBorderBottom' in element.dataset)) {
    element.dataset.jbOrigBorderBottom = element.style.borderBottom;
    element.dataset.jbOrigOutline      = element.style.outline;
  }
  element.style.borderBottom = 'none';
  element.style.outline      = 'none';

  let bg: string;
  if (confidence >= 0.85) {
    bg = '#22c55e';
  } else if (confidence >= 0.60) {
    bg = '#eab308';
  } else {
    bg = '#ef4444';
  }

  const rect      = element.getBoundingClientRect();
  const id        = `jb-underline-${underlineIndex++}`;
  const underline = document.createElement('div');
  underline.id    = id;

  // Fix 2: inset by 1px on each side so the underline stays within the
  // element's visual boundary
  Object.assign(underline.style, {
    position:      'fixed',
    left:          `${rect.left + 1}px`,
    top:           `${rect.bottom - 2}px`,
    width:         `${rect.width - 2}px`,
    height:        '2px',
    background:    bg,
    zIndex:        '2147483647',
    pointerEvents: 'none',
    opacity:       '0',
    transition:    'opacity 0.3s ease',
  });

  element.dataset.jbUnderlineId = id;
  document.body.appendChild(underline);

  // Trigger transition: opacity must flip in a separate frame after append
  requestAnimationFrame(() => { underline.style.opacity = '1'; });

  attachScrollResizeListener();
}

export function clearHighlights(): void {
  if (scrollResizeListener) {
    window.removeEventListener('scroll', scrollResizeListener);
    window.removeEventListener('resize', scrollResizeListener);
    scrollResizeListener = null;
  }

  document.querySelectorAll('[id^="jb-underline-"]').forEach((el) => el.remove());
  underlineIndex = 0;

  document.querySelectorAll<HTMLElement>('[data-jb-highlighted]').forEach((el) => {
    el.style.borderBottom = el.dataset.jbOrigBorderBottom ?? '';
    el.style.outline      = el.dataset.jbOrigOutline      ?? '';
    delete el.dataset.jbHighlighted;
    delete el.dataset.jbUnderlineId;
    delete el.dataset.jbOrigBorderBottom;
    delete el.dataset.jbOrigOutline;
  });
}
