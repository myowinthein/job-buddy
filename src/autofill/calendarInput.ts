import { composedAncestors, hasVisibleSurface } from './dom';
import { ownWriteEvents } from './writeSession';

/** Public DOM markers shared by react-datepicker forms, independent of the ATS. */
export function calendarInput(element: HTMLElement): element is HTMLInputElement {
  return element instanceof HTMLInputElement && !!element.closest('.react-datepicker-wrapper');
}

function calendar(element: HTMLElement): HTMLElement | undefined {
  const area = element.closest('.react-datepicker-wrapper')?.parentElement;
  if (!area || area.querySelectorAll('.react-datepicker-wrapper input').length !== 1) return;
  const calendars = [...area.querySelectorAll<HTMLElement>('.react-datepicker-popper')].filter(
    (node) => hasVisibleSurface(node),
  );
  return calendars.length === 1 ? calendars[0] : undefined;
}

/** Only the rendered year-only chooser justifies dropping a saved month. */
export function calendarValue(element: HTMLInputElement, value: string): string {
  const popup = calendar(element);
  if (popup?.querySelector('.react-datepicker__year-wrapper')) {
    const years = value.match(/\b\d{4}\b/g);
    if (years?.length === 1) return years[0];
  }
  if (popup?.querySelector('.react-datepicker__month-wrapper')) {
    const date = /^(\d{4})-(\d{2})$/.exec(value);
    const template = element.placeholder || element.value;
    const separator = /^(?:mm|\d{2})([/.-])(?:yyyy|\d{4})$/i.exec(template)?.[1];
    if (date && separator) return `${date[2]}${separator}${date[1]}`;
  }
  return value;
}

/** Escape closes the input's chooser; its adjacent "Close" button clears data. */
export async function closeCalendar(
  element: HTMLInputElement,
  active: () => boolean,
): Promise<void> {
  if (!active() || !calendar(element)) return;
  // An application dialog can consume Escape in capture before the widget.
  if (
    [...composedAncestors(element)].some((node) =>
      node.matches('dialog,[role="dialog"],[aria-modal="true"]'),
    )
  )
    return;
  ownWriteEvents(() =>
    element.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        bubbles: true,
        composed: true,
        cancelable: true,
      }),
    ),
  );
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}
