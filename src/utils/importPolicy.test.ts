import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEV_PROFILE } from './devProfile';
import {
  assertImportCurrent,
  initialImportMode,
  replacementChanges,
  ImportProfileChangedError,
} from './importPolicy';
import { replaceImportedProfile } from './replaceImportedProfile';
import { createPreviewChrome } from '@/src/preview/chrome';
import {
  getProfile,
  getLearnedMappings,
  getDriveBackupState,
  getGeminiApiKey,
  saveProfile,
} from './storage';
import { backupDataChanges } from './backupImport';
import { retryPendingDriveSync, syncProfileToDrive } from './driveSync';
import type { Profile } from '@/src/types/profile';

const base = () => structuredClone(DEV_PROFILE);
const spouse = () => ({
  personal: {
    ...DEV_PROFILE.personal,
    firstName: 'Sam',
    lastName: 'Lee',
    email: 'sam@example.com',
  },
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('import identity and replacement policy', () => {
  it('requires a choice for different names and emails, regardless of matching IDs', () => {
    expect(initialImportMode(base(), { ...spouse(), id: DEV_PROFILE.id })).toBeNull();
  });
  it('does not treat changed email alone, missing identities, or Burmese name splits as proof of another person', () => {
    expect(
      initialImportMode(base(), {
        personal: { ...DEV_PROFILE.personal, email: 'new@example.com' },
      }),
    ).toBe('update');
    expect(initialImportMode(base(), { workHistory: [] })).toBe('update');
    const current = {
      personal: { ...DEV_PROFILE.personal, firstName: 'Myo Win', lastName: 'Thein' },
    };
    const incoming = {
      personal: {
        ...current.personal,
        firstName: 'Myo',
        lastName: 'Win Thein',
        email: 'new@example.com',
      },
    };
    expect(initialImportMode(current, incoming)).toBe('update');
  });
  it('compares normalized full names and emails without inventing Gmail aliases', () => {
    expect(
      initialImportMode(base(), {
        personal: {
          ...DEV_PROFILE.personal,
          firstName: ' JANE ',
          lastName: 'DOE',
          email: 'JANE.DOE@EXAMPLE.COM ',
        },
      }),
    ).toBe('update');
  });
  it('asks when a conflicting identifier has no second identifier to resolve it', () => {
    expect(
      initialImportMode(base(), {
        personal: { firstName: 'Sam', lastName: 'Lee' } as Profile['personal'],
      }),
    ).toBeNull();
    expect(
      initialImportMode(base(), { personal: { email: 'sam@example.com' } as Profile['personal'] }),
    ).toBeNull();
  });
  it('makes omitted fields explicit clearing operations in a replacement review', () => {
    const changes = replacementChanges(base(), spouse());
    expect(changes.find((c) => c.id === 'address.city')).toMatchObject({
      status: 'conflict',
      hasIncomingValue: false,
      displaySuggested: 'Will be cleared',
    });
  });
  it('rejects an owner change and concurrent changes to reviewed fields, but allows unrelated edits on update', () => {
    const current = base();
    const incoming = { professional: { summary: 'New summary' } };
    const changes = replacementChanges(current, incoming).filter(
      (c) => c.id === 'professional.summary',
    );
    expect(() =>
      assertImportCurrent(current, { ...current, id: 'another-person' }, changes),
    ).toThrow(ImportProfileChangedError);
    expect(() =>
      assertImportCurrent(
        current,
        { ...current, professional: { summary: 'Concurrent summary' } },
        changes,
      ),
    ).toThrow(ImportProfileChangedError);
    expect(() =>
      assertImportCurrent(
        current,
        { ...current, address: { city: 'New city', country: 'US' } },
        changes,
      ),
    ).not.toThrow();
  });
});

describe('atomic person replacement', () => {
  function setup(failWrite?: (items: Record<string, unknown>) => string | undefined) {
    const current = base();
    vi.stubGlobal(
      'chrome',
      createPreviewChrome(current, undefined, {
        failWrite,
        initialData: {
          learnedMappings: { 'old.example': { name: 'personal.firstName' } },
          geminiApiKey: 'local-test-key',
          geminiDevDisabled: true,
          themePreference: 'dark',
          driveToken: 'local-test-token',
          driveBackupState: {
            fileId: 'old-backup',
            lastSynced: '2026-01-01',
            pendingSync: true,
            error: null,
          },
        },
      }),
    );
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('No real requests allowed')));
    return current;
  }
  it('clears old documents, address, pay, lists, mappings; retains browser settings; pauses uploads', async () => {
    const current = setup();
    const saved = await replaceImportedProfile(current, replacementChanges(current, spouse()));
    expect(saved.id).not.toBe(current.id);
    expect(saved.personal.firstName).toBe('Sam');
    expect(saved.personal.phone).toEqual(current.personal.phone);
    for (const key of [
      'address',
      'salary',
      'documents',
      'workHistory',
      'education',
      'languages',
      'links',
    ])
      expect(saved).not.toHaveProperty(key);
    expect(await getLearnedMappings()).toEqual({});
    expect(await getGeminiApiKey()).toBe('local-test-key');
    expect(await getDriveBackupState()).toMatchObject({
      fileId: 'old-backup',
      reviewRequired: true,
      error: 'review_required',
    });
    await syncProfileToDrive();
    await retryPendingDriveSync();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('replaces backup metadata with incoming values rather than merging another person’s records', async () => {
    const current = setup();
    const mappings = { 'new.example': { email: 'personal.email' } };
    const changes = [
      ...replacementChanges(current, spouse()),
      ...backupDataChanges({}, mappings, 'replace'),
    ];
    await replaceImportedProfile(current, changes);
    expect(await getLearnedMappings()).toEqual(mappings);
  });
  it('retains only selected incoming fields, never unselected old values', async () => {
    const current = setup();
    const changes = replacementChanges(current, spouse()).map((c) =>
      c.id === 'personal.email' ? { ...c, accepted: false } : c,
    );
    const saved = await replaceImportedProfile(current, changes);
    expect(saved.personal.email).toBeUndefined();
    expect(saved.personal.firstName).toBe('Sam');
  });
  it('does not replace data when the saved profile cannot be read', async () => {
    const current = setup();
    const get = chrome.storage.local.get.bind(chrome.storage.local);
    const read = vi.spyOn(chrome.storage.local, 'get').mockImplementation((...args) => {
      if (args[0] === 'profile') throw new Error('Storage read unavailable');
      return get(...args);
    });
    const write = vi.spyOn(chrome.storage.local, 'set');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      replaceImportedProfile(current, replacementChanges(current, spouse())),
    ).rejects.toThrow('Storage read unavailable');
    expect(write).not.toHaveBeenCalled();
    read.mockRestore();
    expect(await getProfile()).toEqual(current);
  });
  it('does not change anything if the atomic write fails', async () => {
    const current = setup((items) => ('profile' in items ? 'Storage unavailable' : undefined));
    await expect(
      replaceImportedProfile(current, replacementChanges(current, spouse())),
    ).rejects.toThrow('Storage unavailable');
    expect(await getProfile()).toEqual(current);
    expect((await getDriveBackupState()).reviewRequired).toBeUndefined();
  });
  it('refuses replacement after a concurrent save and preserves that newer profile', async () => {
    const current = setup();
    const next = { ...current, address: { city: 'Concurrent city', country: 'US' } } as Profile;
    await saveProfile(next);
    await expect(
      replaceImportedProfile(current, replacementChanges(current, spouse())),
    ).rejects.toThrow(ImportProfileChangedError);
    expect((await getProfile())?.address.city).toBe('Concurrent city');
  });
});
