import { describe, expect, it } from 'vitest';
import { backupDataChanges, selectedBackupData, validateBackupData } from './backupImport';
import { equalJsonValues } from './equalJsonValues';

describe('backup-only data import', () => {
  it('never selects unchanged metadata and only returns accepted changes', () => {
    const mappings = { 'example.com': { name: 'personal.firstName' } };
    const unchanged = backupDataChanges(mappings, mappings);
    expect(unchanged.every((change) => change.status === 'unchanged' && !change.accepted)).toBe(
      true,
    );
    expect(selectedBackupData(unchanged)).toEqual({
      learnedMappings: undefined,
    });
    const changed = backupDataChanges({}, mappings);
    expect(selectedBackupData(changed.map((change) => ({ ...change, accepted: false })))).toEqual({
      learnedMappings: undefined,
    });
    expect(selectedBackupData(changed)).toEqual({
      learnedMappings: mappings,
    });
  });
  it('ignores unrecognized properties in older backups', () => {
    expect(validateBackupData({ retiredFeatureData: [{ value: 'unused' }] })).toEqual({
      learnedMappings: undefined,
      invalidFields: [],
    });
  });
  it('preserves trusted local mappings rather than offering ineffective replacements', () => {
    const local = { 'example.com': { name: { path: 'personal.firstName', count: 2 } } };
    const changes = backupDataChanges(local, {
      'example.com': { name: { path: 'personal.lastName', count: 1 } },
    });
    expect(changes[0].status).toBe('unchanged');
  });
  it('validates both legacy and counted mappings and reports malformed entries', () => {
    const result = validateBackupData({
      learnedMappings: {
        'example.com': {
          valid: 'personal.firstName',
          counted: { path: 'personal.lastName', count: 2, label: 'Surname' },
          invalid: { path: 12, count: 'two' },
        },
      },
    });
    expect(result.learnedMappings).toEqual({
      'example.com': {
        valid: 'personal.firstName',
        counted: { path: 'personal.lastName', count: 2, label: 'Surname' },
      },
    });
    expect(result.invalidFields).toHaveLength(1);
  });
  it('rejects malformed metadata containers and unsafe dictionary keys', () => {
    expect(validateBackupData({ learnedMappings: [] }).invalidFields).toHaveLength(1);
    const raw = JSON.parse(
      '{"learnedMappings":{"__proto__":{"polluted":"yes"},"safe.example":{"constructor":"x"}}}',
    );
    const result = validateBackupData(raw);
    expect(result.learnedMappings).toEqual({});
    expect(result.invalidFields).toHaveLength(2);
    expect(Object.prototype).not.toHaveProperty('polluted');
  });
});

describe('JSON value equality', () => {
  it('ignores object property order at every depth and omitted undefined properties', () => {
    expect(
      equalJsonValues(
        { list: [{ size: 1, name: 'cv', extra: undefined }] },
        { list: [{ name: 'cv', size: 1 }] },
      ),
    ).toBe(true);
  });
  it('preserves meaningful array order and actual value differences', () => {
    expect(equalJsonValues([1, 2], [2, 1])).toBe(false);
    expect(equalJsonValues({ file: { base64: 'a' } }, { file: { base64: 'b' } })).toBe(false);
    expect(equalJsonValues({ empty: null }, {})).toBe(false);
  });
});
