/** Required markers are presentation metadata; they never influence matching. */
export function requiredField(elements: HTMLElement[], label: string, question?: Element): boolean {
  return (
    elements.some(
      (element) =>
        element.hasAttribute('required') || element.getAttribute('aria-required') === 'true',
    ) ||
    question?.getAttribute('aria-required') === 'true' ||
    /(?:^\s*\*|\*\s*$)/.test(label)
  );
}

export function reportTitle(label: string, kind: string, index: number): string {
  const text = label.trim().replace(/(?:^\s*\*+\s*|\s*\*+\s*$)/g, '');
  // Machine-generated names remain matching keys, never the visible question title.
  return !text ||
    (/^[a-f\d_-]+$/i.test(text) &&
      /[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}/i.test(text))
    ? `${kind === 'radio' ? 'Radio question' : kind === 'checkbox' ? 'Checkbox question' : 'Unlabelled field'} ${index}`
    : text;
}
