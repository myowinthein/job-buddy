import type { FillLogField } from './fillLog';
import { isChoiceChecked } from './dom';
import { readFieldValue } from './fieldValue';

/**
 * Links each fill-report record to its controls and last observed value, so
 * edits made after a run can be recognised. `reset` replaces the maps rather
 * than clearing them, because earlier runs may still hold the old ones.
 */
export class ReportRecords {
  byElement = new Map<HTMLElement, FillLogField>();
  elements = new Map<FillLogField, HTMLElement[]>();
  values = new Map<FillLogField, string>();

  reset(): void {
    this.byElement = new Map();
    this.elements = new Map();
    this.values = new Map();
  }

  bind(record: FillLogField, elements: HTMLElement[]): void {
    this.elements.set(record, elements);
    for (const element of elements) this.byElement.set(element, record);
    this.values.set(record, this.read(record));
  }

  /** The record's current answer: checked choice positions or trimmed text. */
  read(record: FillLogField): string {
    const elements = this.elements.get(record) ?? [];
    if (record.kind === 'radio' || record.kind === 'checkbox') {
      return elements.flatMap((e, index) => (isChoiceChecked(e) ? [String(index)] : [])).join(',');
    }
    return elements[0] ? readFieldValue(elements[0]).trim() : '';
  }
}
