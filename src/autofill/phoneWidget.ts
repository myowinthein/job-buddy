const DIAL_CODE = /^\s*(\+\d{1,4})(?:\s|[a-z_]|$)/i;

/** A local telephone component with one number and an explicit dial-code toggle. */
export function telephoneCountry(
  element: HTMLElement,
): { input: HTMLInputElement; button: HTMLButtonElement; code: string } | null {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLButtonElement)) return null;
  if (element instanceof HTMLButtonElement && !DIAL_CODE.test(element.textContent ?? ''))
    return null;
  const widget = element.parentElement;
  if (!widget || widget.matches('body,form')) return null;
  const inputs = widget.querySelectorAll<HTMLInputElement>(
    'input:not([type=hidden]),select,textarea',
  );
  const buttons = [...widget.querySelectorAll<HTMLButtonElement>('button')].filter((button) =>
    DIAL_CODE.test(button.textContent ?? ''),
  );
  if (inputs.length !== 1 || !(inputs[0] instanceof HTMLInputElement) || buttons.length !== 1)
    return null;
  if (element !== inputs[0] && element !== buttons[0]) return null;
  const field = widget.closest('.field,.form-field,.form-group,.form-item');
  const question = [
    widget.getAttribute('formcontrolname'),
    inputs[0].name,
    inputs[0].autocomplete,
    field?.querySelector('label')?.textContent,
  ].join(' ');
  if (!/\b(?:phone|telephone|mobile|tel)\b/i.test(question)) return null;
  return {
    input: inputs[0],
    button: buttons[0],
    code: DIAL_CODE.exec(buttons[0].textContent ?? '')![1],
  };
}

/** intl-tel-input can retain national digits while its adjacent country
 * control supplies the calling code. Verify that explicit selection only. */
export function sameTelephone(element: HTMLElement, actual: string, expected: string): boolean {
  if (
    !(element instanceof HTMLInputElement) ||
    (element.type !== 'tel' && !telephoneCountry(element)) ||
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
