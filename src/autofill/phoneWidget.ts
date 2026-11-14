/** intl-tel-input can retain national digits while its adjacent country
 * control supplies the calling code. Verify that explicit selection only. */
export function sameTelephone(element: HTMLElement, actual: string, expected: string): boolean {
  if (
    !(element instanceof HTMLInputElement) ||
    element.type !== 'tel' ||
    !/^\+?[\d\s().-]+$/.test(actual) ||
    !/^\+?[\d\s().-]+$/.test(expected)
  )
    return false;
  const digits = actual.replace(/\D/g, '');
  const wanted = expected.replace(/\D/g, '');
  if (digits === wanted) return true;
  if (!expected.trim().startsWith('+') || actual.trim().startsWith('+')) return false;
  const widget = element.closest('.iti');
  if (!widget) return false;
  const selected = [...widget.querySelectorAll<HTMLElement>('.iti__selected-country')].filter(
    (control) => control.closest('.iti') === widget,
  );
  if (selected.length !== 1) return false;
  const label = selected[0].getAttribute('aria-label') ?? '';
  const code =
    /\(\+(\d{1,4})\)/.exec(label)?.[1] ??
    /^\+(\d{1,4})$/.exec(
      selected[0].querySelector('.iti__selected-dial-code')?.textContent?.trim() ?? '',
    )?.[1];
  return !!code && wanted.startsWith(code) && digits === wanted.slice(code.length);
}
