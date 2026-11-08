// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { FillLogField } from './fillLog';
import { ReportRecords } from './reportRecords';

const record = (kind: FillLogField['kind']): FillLogField => ({
  id: `field_${kind}`,
  label: 'Field',
  kind,
  outcome: 'review',
  source: 'rules',
  rule: { outcome: 'filled' },
  ai: { outcome: 'not_sent' },
});

let records: ReportRecords;
beforeEach(() => {
  document.body.innerHTML = '';
  records = new ReportRecords();
});

function input(type: string, value = ''): HTMLInputElement {
  const element = document.createElement('input');
  element.type = type;
  element.value = value;
  document.body.append(element);
  return element;
}

describe('ReportRecords', () => {
  it('reads the trimmed text of the first control', () => {
    const field = record('text');
    records.bind(field, [input('text', '  Ada  ')]);
    expect(records.read(field)).toBe('Ada');
  });

  it('reads checked choice positions for checkbox groups', () => {
    const field = record('checkbox');
    const boxes = [input('checkbox'), input('checkbox'), input('checkbox')];
    boxes[0].checked = true;
    boxes[2].checked = true;
    records.bind(field, boxes);
    expect(records.read(field)).toBe('0,2');
  });

  it('reads the checked position for radio groups', () => {
    const field = record('radio');
    const radios = [input('radio'), input('radio')];
    radios[1].checked = true;
    records.bind(field, radios);
    expect(records.read(field)).toBe('1');
  });

  it('reads an empty answer when the record has no controls', () => {
    expect(records.read(record('text'))).toBe('');
  });

  it('indexes every control and remembers the value seen at bind time', () => {
    const field = record('checkbox');
    const boxes = [input('checkbox'), input('checkbox')];
    boxes[1].checked = true;
    records.bind(field, boxes);
    expect([records.byElement.get(boxes[0]), records.byElement.get(boxes[1])]).toEqual([
      field,
      field,
    ]);
    boxes[1].checked = false;
    expect(records.values.get(field)).toBe('1');
  });

  it('reset starts empty maps without emptying the ones an earlier run holds', () => {
    const field = record('text');
    const element = input('text', 'Ada');
    records.bind(field, [element]);
    const earlier = records.byElement;
    records.reset();
    expect([records.byElement.size, records.elements.size, records.values.size]).toEqual([0, 0, 0]);
    expect(earlier.get(element)).toBe(field);
  });
});
