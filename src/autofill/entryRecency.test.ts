import { describe, it, expect } from 'vitest';
import { mostRecentIdx } from './entryRecency';

describe('mostRecentIdx', () => {
  it.each<{ name: string; entries: Parameters<typeof mostRecentIdx>[0]; expected: number }>([
    { name: 'empty entries', entries: [], expected: 0 },
    {
      name: 'first current entry wins',
      entries: [{}, { isCurrent: true }, { isCurrent: true }],
      expected: 1,
    },
    {
      name: 'current wins over a later date',
      entries: [{ startDate: '2020-01', isCurrent: true }, { startDate: '2025-01' }],
      expected: 0,
    },
    {
      name: 'latest start date wins',
      entries: [{ startDate: '2020-01' }, { startDate: '2025-01' }],
      expected: 1,
    },
    {
      name: 'first entry wins ties',
      entries: [{ startDate: '2025-01' }, { startDate: '2025-01' }],
      expected: 0,
    },
    {
      name: 'present date wins over missing date',
      entries: [{}, { startDate: '2020-01' }],
      expected: 1,
    },
    { name: 'all missing dates', entries: [{}, {}], expected: 0 },
    {
      name: 'dates retain lexical ordering',
      entries: [{ startDate: '2024-05' }, { startDate: '2024-05-01' }],
      expected: 1,
    },
  ])('$name', ({ entries, expected }) => {
    const original = structuredClone(entries);
    expect(mostRecentIdx(entries)).toBe(expected);
    expect(entries).toEqual(original);
  });
});
