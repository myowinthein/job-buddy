import { isControlAvailable } from '@/src/autofill/dom';
import { likelyApplicationForm } from './detect';

const OPEN_PANEL = 'dialog[open],[role="dialog"][aria-modal="true"],[aria-modal="true"]';

/** Keep real clicks inside the application, including capture-phase outside-click handlers. */
export function mountInApplicationPanel(host: HTMLElement, onMove: () => void): () => void {
  const update = () => {
    const panels = [...document.querySelectorAll<HTMLElement>(OPEN_PANEL)];
    const panel = panels
      .reverse()
      .find(
        (element) =>
          isControlAvailable(element) &&
          (element === host.parentElement || likelyApplicationForm(element)),
      );
    const parent = panel ?? document.documentElement;
    if (host.parentElement === parent) return;
    parent.append(host);
    onMove();
  };
  const observer = new MutationObserver(update);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['role', 'aria-modal', 'open', 'hidden', 'aria-hidden'],
  });
  const reposition = (event: Event) => {
    if (
      host.parentElement !== document.documentElement &&
      event.target instanceof Element &&
      event.target.contains(host)
    )
      onMove();
  };
  document.addEventListener('scroll', reposition, true);
  document.addEventListener('transitionend', reposition, true);
  update();
  return () => {
    observer.disconnect();
    document.removeEventListener('scroll', reposition, true);
    document.removeEventListener('transitionend', reposition, true);
  };
}
