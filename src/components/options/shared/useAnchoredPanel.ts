import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';

// Portalled pickers must fit the viewport, including when their trigger is
// inside a scrolling form or an entry card with overflow hidden.
export function useAnchoredPanel(
  open: boolean,
  anchor: RefObject<HTMLElement | null>,
  minWidth: number,
  preferredHeight = 360,
  withinMain = false,
) {
  const [position, setPosition] = useState<CSSProperties>({
    position: 'fixed',
    visibility: 'hidden',
  });
  useLayoutEffect(() => {
    if (!open) return;
    let frame = 0;
    const place = () => {
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect) return;
      const inset = 12;
      const gap = 8;
      const main = withinMain ? anchor.current?.closest('main') : null;
      const mainRect = main?.getBoundingClientRect();
      const padding = main ? getComputedStyle(main) : null;
      const leftEdge = Math.max(
        inset,
        mainRect ? mainRect.left + (parseFloat(padding!.paddingLeft) || 0) : 0,
      );
      const rightEdge = Math.min(
        window.innerWidth - inset,
        mainRect ? mainRect.right - (parseFloat(padding!.paddingRight) || 0) : window.innerWidth,
      );
      const width = Math.min(Math.max(rect.width, minWidth), Math.max(1, rightEdge - leftEdge));
      const below = Math.max(0, window.innerHeight - rect.bottom - inset - gap);
      const above = Math.max(0, rect.top - inset - gap);
      const flip = below < Math.min(240, preferredHeight) && above > below;
      const maxHeight = Math.min(preferredHeight, flip ? above : below);
      setPosition({
        position: 'fixed',
        width,
        left: Math.max(leftEdge, Math.min(rect.left, rightEdge - width)),
        maxHeight,
        ...(flip
          ? { bottom: Math.max(inset, window.innerHeight - rect.top + gap) }
          : { top: Math.max(inset, rect.bottom + gap) }),
      });
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    place();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    if (anchor.current) observer?.observe(anchor.current);
    const main = anchor.current?.closest('main');
    if (main) observer?.observe(main);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
    };
  }, [open, anchor, minWidth, preferredHeight, withinMain]);
  return position;
}
