import type { MouseEvent } from 'react';

// A blur error can move a control between mouse-down and mouse-up. Move focus
// only once its click has arrived, so the first click still reaches the control.
export function deferPointerFocus(event: MouseEvent<HTMLElement>) {
  if (event.button === 0) event.preventDefault();
}

export function focusOnClick(event: MouseEvent<HTMLElement>) {
  event.currentTarget.focus({ preventScroll: true });
}

export const stableDisclosureFocus = { onMouseDown: deferPointerFocus, onClick: focusOnClick };
