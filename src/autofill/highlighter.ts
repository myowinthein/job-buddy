export function applyHighlight(element: HTMLElement, confidence: number): void {
  // Save original inline styles only on first highlight
  if (!('jbHighlighted' in element.dataset)) {
    element.dataset.jbOrigBorder     = element.style.border;
    element.dataset.jbOrigBackground = element.style.background;
  }

  let border: string;
  let background: string;

  if (confidence >= 0.85) {
    border     = '2px solid #22c55e';
    background = 'rgba(34,197,94,0.08)';
  } else if (confidence >= 0.60) {
    border     = '2px solid #eab308';
    background = 'rgba(234,179,8,0.08)';
  } else {
    border     = '2px solid #ef4444';
    background = 'rgba(239,68,68,0.08)';
  }

  element.style.border     = border;
  element.style.background = background;
  element.dataset.jbHighlighted = '1';
}

export function clearHighlights(): void {
  const elements = document.querySelectorAll<HTMLElement>('[data-jb-highlighted]');
  for (const el of Array.from(elements)) {
    el.style.border     = el.dataset.jbOrigBorder     ?? '';
    el.style.background = el.dataset.jbOrigBackground ?? '';
    delete el.dataset.jbHighlighted;
    delete el.dataset.jbOrigBorder;
    delete el.dataset.jbOrigBackground;
  }
}
