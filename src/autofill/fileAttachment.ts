import { hasVisibleSurface } from './dom';
import { dropzonePreviews } from './dropzone';

/** Read the retained attachment, even when an uploader clears its native picker. */
export function hasFileAttachment(element: HTMLInputElement, name?: string): boolean {
  if (Array.from(element.files ?? []).some((file) => !name || file.name === name)) return true;
  if (
    dropzonePreviews(element).some(
      (preview) => !name || preview.querySelector('[data-dz-name]')?.textContent?.trim() === name,
    )
  )
    return true;
  // Keep this inside one upload component. A neighboring attachment or a
  // whole form's populated state cannot stand in for this picker's answer.
  for (
    let area = element.parentElement, depth = 0;
    area && depth < 3;
    area = area.parentElement, depth++
  ) {
    if (area.matches('body,form,[role="form"]')) break;
    const controls = area.querySelectorAll('input,select,textarea');
    if (controls.length !== 1 || controls[0] !== element) break;
    if (!area.matches('.has-value,[data-has-file="true"]') || !hasVisibleSurface(area)) continue;
    const text = element.ownerDocument.createTreeWalker(area, NodeFilter.SHOW_TEXT);
    for (let node = text.nextNode(); node; node = text.nextNode()) {
      const label = node.textContent?.trim();
      if (label && (!name || label === name)) return true;
    }
  }
  return false;
}
