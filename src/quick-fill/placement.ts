type Rect = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;
type Position = Pick<DOMRect, 'left' | 'top'>;

export const QUICK_FILL_INSET = 12;
const CONTROL_GAP = 12;

/** Finds the nearest clear position inside the viewport, preferring above on ties. */
export function avoidQuickFillOverlap(
  control: Rect,
  peers: readonly Rect[],
  viewport: { width: number; height: number },
): Position {
  const maxLeft = Math.max(QUICK_FILL_INSET, viewport.width - control.width - QUICK_FILL_INSET);
  const maxTop = Math.max(QUICK_FILL_INSET, viewport.height - control.height - QUICK_FILL_INSET);
  const clampLeft = (left: number) => Math.max(QUICK_FILL_INSET, Math.min(maxLeft, left));
  const clampTop = (top: number) => Math.max(QUICK_FILL_INSET, Math.min(maxTop, top));
  const preferred = { left: clampLeft(control.left), top: clampTop(control.top) };
  const overlap = ({ left, top }: Position) =>
    peers.reduce((area, peer) => {
      const width = Math.max(
        0,
        Math.min(left + control.width, peer.left + peer.width + CONTROL_GAP) -
          Math.max(left, peer.left - CONTROL_GAP),
      );
      const height = Math.max(
        0,
        Math.min(top + control.height, peer.top + peer.height + CONTROL_GAP) -
          Math.max(top, peer.top - CONTROL_GAP),
      );
      return area + width * height;
    }, 0);
  let best = preferred;
  let bestOverlap = overlap(best);
  let bestDistance = 0;
  if (bestOverlap === 0) return best;

  const lefts = new Set(
    [
      preferred.left,
      ...peers.flatMap((peer) => [
        peer.left - control.width - CONTROL_GAP,
        peer.left + peer.width + CONTROL_GAP,
      ]),
      QUICK_FILL_INSET,
      maxLeft,
    ].map(clampLeft),
  );
  const tops = new Set(
    [
      preferred.top,
      ...peers.flatMap((peer) => [
        peer.top - control.height - CONTROL_GAP,
        peer.top + peer.height + CONTROL_GAP,
      ]),
      QUICK_FILL_INSET,
      maxTop,
    ].map(clampTop),
  );
  for (const top of tops) {
    for (const left of lefts) {
      const candidate = { left, top };
      const area = overlap(candidate);
      const distance = (left - preferred.left) ** 2 + (top - preferred.top) ** 2;
      if (area < bestOverlap || (area === bestOverlap && distance < bestDistance)) {
        best = candidate;
        bestOverlap = area;
        bestDistance = distance;
      }
    }
  }
  return best;
}
