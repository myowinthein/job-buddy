/** Measures content and control edges, excluding transparent layout wrappers. */
export function visibleDividerGaps(divider: Element) {
  function contentBoxes(element: Element, includeSurface = true): DOMRect[] {
    if (
      !element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) ||
      element.matches('script, style, [aria-hidden="true"], .sr-only, input[type="hidden"]')
    )
      return [];
    const box = element.getBoundingClientRect();
    if (!box.height) return [];
    const style = getComputedStyle(element);
    const outlined = [
      style.borderTopWidth,
      style.borderRightWidth,
      style.borderBottomWidth,
      style.borderLeftWidth,
    ].every((width) => parseFloat(width) > 0);
    const filled = !['transparent', 'rgba(0, 0, 0, 0)'].includes(style.backgroundColor);
    if (
      includeSurface &&
      (outlined ||
        filled ||
        element.matches('input, select, textarea, button, label, a, summary, table, img, svg'))
    )
      return [box];
    if (
      [...element.childNodes].some(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
      )
    )
      return [
        new DOMRect(
          box.x,
          box.y + parseFloat(style.paddingTop),
          box.width,
          box.height - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom),
        ),
      ];
    const children = [...element.children].flatMap((child) => contentBoxes(child));
    if (!['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowY)) return children;
    return children
      .filter((child) => child.bottom > box.top && child.top < box.bottom)
      .map(
        (child) =>
          new DOMRect(
            child.x,
            Math.max(child.top, box.top),
            child.width,
            Math.min(child.bottom, box.bottom) - Math.max(child.top, box.top),
          ),
      );
  }

  const style = getComputedStyle(divider);
  const topBorder = parseFloat(style.borderTopWidth);
  const bottomBorder = parseFloat(style.borderBottomWidth);
  const box = divider.getBoundingClientRect();
  let neighbor = topBorder ? divider.previousElementSibling : divider.nextElementSibling;
  let neighborBoxes: DOMRect[] = [];
  while (neighbor && !neighborBoxes.length) {
    neighborBoxes = contentBoxes(neighbor);
    neighbor = topBorder ? neighbor.previousElementSibling : neighbor.nextElementSibling;
  }
  const ownBoxes = contentBoxes(divider, false);
  if (!ownBoxes.length || !neighborBoxes.length) throw new Error('Missing divider content');
  return topBorder
    ? {
        above: box.top - Math.max(...neighborBoxes.map((rect) => rect.bottom)),
        below: Math.min(...ownBoxes.map((rect) => rect.top)) - box.top - topBorder,
      }
    : {
        above: box.bottom - bottomBorder - Math.max(...ownBoxes.map((rect) => rect.bottom)),
        below: Math.min(...neighborBoxes.map((rect) => rect.top)) - box.bottom,
      };
}
