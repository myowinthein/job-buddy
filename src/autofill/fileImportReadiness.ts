import {
  composedAncestors,
  controlForm,
  hasVisibleSurface,
  isControlAvailable,
  queryOpenElements,
} from './dom';

const SAMPLE_MS = 32;
const TIMEOUT_MS = 10_000;
const BUSY = '[aria-busy="true"],[role="progressbar"],progress:not([value])';
const portalNode = (node: HTMLElement): boolean =>
  ![...composedAncestors(node)].some((ancestor) => ancestor.hasAttribute('data-job-buddy-ui')) &&
  hasVisibleSurface(node);

/** Observe the upload's application area before firing its change event. */
export function observeFileImport(element: HTMLInputElement): {
  wait: (active: () => boolean) => Promise<boolean>;
  dispose: () => void;
} {
  let scope: Element | null = controlForm(element);
  if (!scope) {
    const main = element.closest('main,[role="main"]');
    if (main && queryOpenElements(main, 'form,[role="form"]').length === 1) scope = main;
  }
  if (!scope) return { wait: async (active) => active(), dispose: () => {} };
  const area = scope;
  const enabled = queryOpenElements(area, 'button,input[type="submit"],[role="button"]').filter(
    (button) => isControlAvailable(button),
  );
  const initialBusy = new Set(queryOpenElements(area, BUSY).filter(portalNode));
  let edited = false;
  const onEdit = (event: Event) => {
    if (event.isTrusted && event.target !== element) edited = true;
  };
  area.addEventListener('input', onEdit, true);
  area.addEventListener('change', onEdit, true);
  const dispose = () => {
    area.removeEventListener('input', onEdit, true);
    area.removeEventListener('change', onEdit, true);
  };
  return {
    dispose,
    wait: async (active) => {
      const deadline = Date.now() + TIMEOUT_MS;
      let quiet = 0;
      do {
        await new Promise<void>((resolve) => setTimeout(resolve, SAMPLE_MS));
        if (!active() || edited || !area.isConnected) return false;
        const busy =
          enabled.some(
            (button) => button.isConnected && button.matches(':disabled,[aria-disabled="true"]'),
          ) ||
          queryOpenElements(area, BUSY).some((node) => !initialBusy.has(node) && portalNode(node));
        quiet = busy ? 0 : quiet + 1;
        if (quiet >= 2) return true;
      } while (Date.now() < deadline);
      // The file can remain accepted, but the remaining writes must stop rather
      // than race an importer that has not finished. Accepted writes keep Undo.
      return false;
    },
  };
}
