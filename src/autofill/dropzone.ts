/** Dropzone 5 portals its native picker to the document body. Only associate
 * an otherwise unlabelled picker when the tree has exactly one upload widget. */
export function dropzoneSurface(element: HTMLElement): HTMLElement | undefined {
  if (
    !(element instanceof HTMLInputElement) ||
    element.type !== 'file' ||
    !element.matches('.dz-hidden-input') ||
    element.labels?.length ||
    element.getAttribute('aria-label') ||
    element.getAttribute('aria-labelledby')
  )
    return;
  const root = element.getRootNode() as Document | ShadowRoot;
  const inputs = root.querySelectorAll('input[type="file"].dz-hidden-input');
  const surfaces = root.querySelectorAll<HTMLElement>('.dz-clickable');
  if (inputs.length !== 1 || inputs[0] !== element || surfaces.length !== 1) return;
  const surface = surfaces[0];
  // Never link an anonymous picker to a separate frame, unrelated file editor,
  // or multiple possible upload questions.
  if (!surface.closest('form,[role="form"]') || surface.querySelector('input[type="file"]')) return;
  return surface;
}

export function dropzoneLabel(element: HTMLElement): string {
  const surface = dropzoneSurface(element);
  if (!surface) return '';
  const clone = surface.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.dz-preview').forEach((preview) => preview.remove());
  return surface.getAttribute('aria-label') || clone.textContent?.trim() || '';
}

export function dropzonePreviews(element: HTMLElement): HTMLElement[] {
  const form = dropzoneSurface(element)?.closest('form,[role="form"]');
  return form ? [...form.querySelectorAll<HTMLElement>('.dz-preview')] : [];
}

/** A successful preview is the widget's retained-file acknowledgement, rather
 * than the native picker (which Dropzone normally discards after a change). */
export async function waitDropzoneFile(
  element: HTMLInputElement,
  file: File,
  before: readonly HTMLElement[],
  active: () => boolean,
): Promise<HTMLElement | null> {
  const started = Date.now();
  while (active() && Date.now() - started < 10_000) {
    const preview = dropzonePreviews(element).find(
      (item) =>
        !before.includes(item) &&
        item.querySelector('[data-dz-name]')?.textContent?.trim() === file.name,
    );
    if (preview?.classList.contains('dz-error')) return null;
    if (preview?.classList.contains('dz-success')) return preview;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return null;
}
