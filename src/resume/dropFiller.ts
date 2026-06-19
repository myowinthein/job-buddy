import { fillField } from '@/src/autofill/filler';

export function fillDroppedValue(element: HTMLElement | null, value: string): void {
  if (!element) return;
  void fillField(element, value);
}
