import { beforeEach, expect, it } from 'vitest';
import { DevelopmentSessionStore, SESSION_ENDED, DEV_SESSION_KEY } from './session';

function memoryChrome(localData: Record<string, unknown>) {
  const listeners = new Set<
    (changes: Record<string, chrome.storage.StorageChange>, area: string) => void
  >();
  const area = (name: string, initial: Record<string, unknown>) => {
    const data = structuredClone(initial);
    return {
      async get(keys: string | string[] | Record<string, unknown> | null) {
        const names =
          keys === null
            ? Object.keys(data)
            : typeof keys === 'string'
              ? [keys]
              : Array.isArray(keys)
                ? keys
                : Object.keys(keys);
        return structuredClone(
          Object.fromEntries(names.filter((key) => key in data).map((key) => [key, data[key]])),
        );
      },
      async set(values: Record<string, unknown>) {
        const changes: Record<string, chrome.storage.StorageChange> = {};
        for (const [key, value] of Object.entries(values)) {
          changes[key] = { oldValue: data[key], newValue: structuredClone(value) };
          data[key] = structuredClone(value);
        }
        listeners.forEach((listener) => listener(changes, name));
      },
      async remove(keys: string | string[]) {
        const changes: Record<string, chrome.storage.StorageChange> = {};
        for (const key of typeof keys === 'string' ? [keys] : keys) {
          changes[key] = { oldValue: data[key] };
          delete data[key];
        }
        listeners.forEach((listener) => listener(changes, name));
      },
    };
  };
  return {
    storage: {
      local: area('local', localData),
      session: area('session', {}),
      onChanged: {
        addListener: (listener: Parameters<typeof listeners.add>[0]) => listeners.add(listener),
      },
    },
  } as unknown as typeof chrome;
}
let native: typeof chrome;
let store: DevelopmentSessionStore;
const original = {
  profile: { id: 'original', personal: { firstName: 'Saved', email: 'saved@example.test' } },
  learnedMappings: { 'jobs.example': { email: { path: 'personal.email', count: 2 } } },
  themePreference: 'dark',
  quickFillPreferences: { enabled: false, fillMode: 'merge', disabledSites: ['hidden.example'] },
  geminiApiKey: 'original-synthetic-key',
  geminiModel: 'gemini-3.8-flash',
  geminiSettingsMeta: { revision: 'original' },
  driveToken: 'original-synthetic-token',
  driveBackupState: { accountEmail: 'saved@example.test' },
};
beforeEach(async () => {
  native = memoryChrome(original);
  store = new DevelopmentSessionStore(native);
  await store.initialize();
});

it('temporarily disables and restores Original integrations while profile saves remain permanent', async () => {
  await store.setEnabled('key', false);
  await store.setEnabled('drive', false);
  expect(await store.read(null, 'local', ['geminiApiKey', 'driveToken'])).toEqual({});
  await store.write(null, 'local', {
    profile: { id: 'original', personal: { firstName: 'Permanent' } },
  });
  await store.setEnabled('key', true);
  await store.setEnabled('drive', true);
  expect(await store.read(null, 'local', ['geminiApiKey', 'driveToken'])).toEqual({
    geminiApiKey: original.geminiApiKey,
    driveToken: original.driveToken,
  });
  expect((await native.storage.local.get('profile')).profile).toMatchObject({
    personal: { firstName: 'Permanent' },
  });
});

it('shares temporary profile, settings, mappings and reports across contexts while preserving Original', async () => {
  const other = new DevelopmentSessionStore(native);
  await other.initialize();
  await native.storage.session.set({ 'jb:last-fill-details': { original: true } });
  const session = await store.activate('complete');
  expect(other.scope()).toBe(session.id);
  expect(
    await other.read(session.id, 'local', [
      'geminiApiKey',
      'themePreference',
      'quickFillPreferences',
      'learnedMappings',
    ]),
  ).toEqual({
    geminiApiKey: original.geminiApiKey,
    themePreference: 'dark',
    quickFillPreferences: original.quickFillPreferences,
    learnedMappings: original.learnedMappings,
  });
  await other.write(session.id, 'local', {
    profile: { id: 'temporary' },
    learnedMappings: { 'new.example': { name: 'personal.firstName' } },
    themePreference: 'light',
  });
  await other.write(session.id, 'session', { 'jb:last-fill-details': { temporary: true } });
  expect(await store.read(session.id, 'session', 'jb:last-fill-details')).toEqual({
    'jb:last-fill-details': { temporary: true },
  });
  expect(await native.storage.local.get(null)).toEqual(original);
  await store.activate('original', false);
  expect(await store.read(null, 'session', 'jb:last-fill-details')).toEqual({
    'jb:last-fill-details': { original: true },
  });
});

it('recreates a temporary preset on refresh and rejects writes from the expired session', async () => {
  const first = await store.activate('required');
  await store.write(first.id, 'local', { profile: { id: 'edited' }, themePreference: 'light' });
  await store.activate('required');
  expect(store.scope()).not.toBe(first.id);
  expect((await store.read(store.scope(), 'local', 'themePreference')).themePreference).toBe(
    'dark',
  );
  await expect(store.write(first.id, 'local', { profile: { id: 'stale' } })).rejects.toThrow(
    SESSION_ENDED,
  );
  await store.activate('original', false);
  expect(await native.storage.local.get(null)).toEqual(original);
});

it('keeps a reset inside the temporary store and restores its preset on refresh', async () => {
  const meta = await store.activate('empty');
  const keys = Object.keys(await store.read(meta.id, 'local', null));
  await store.remove(meta.id, 'local', keys);
  expect(await store.read(meta.id, 'local', null)).toEqual({});
  expect(await native.storage.local.get(null)).toEqual(original);
  await store.activate('empty');
  expect((await store.read(store.scope(), 'local', 'profile')).profile).toEqual({
    id: `dev-${store.scope()}`,
  });
});

it('restores the previous temporary key after toggling and accepts temporary key replacements', async () => {
  const meta = await store.activate('complete');
  await store.write(meta.id, 'local', { geminiApiKey: 'temporary-real-key' });
  await store.setEnabled('key', false);
  expect(await store.read(meta.id, 'local', 'geminiApiKey')).toEqual({});
  await store.setEnabled('key', true);
  expect(await store.read(meta.id, 'local', 'geminiApiKey')).toEqual({
    geminiApiKey: 'temporary-real-key',
  });
  expect((await native.storage.local.get('geminiApiKey')).geminiApiKey).toBe(original.geminiApiKey);
});

it('uses sample AI when a key is absent and stops sample responses after a real temporary key is saved', async () => {
  await native.storage.local.remove('geminiApiKey');
  const meta = await store.activate('complete');
  expect(meta.sampleAI).toBe(true);
  expect(await store.read(meta.id, 'local', 'geminiApiKey')).toEqual({
    geminiApiKey: 'simulated-key',
  });
  await store.write(meta.id, 'local', { geminiApiKey: 'temporary-real-key' });
  expect(store.active?.sampleAI).toBe(false);
  await store.remove(meta.id, 'local', ['geminiApiKey']);
  expect(await store.read(meta.id, 'local', 'geminiApiKey')).toEqual({});
  await store.setEnabled('key', true);
  expect(await store.read(meta.id, 'local', 'geminiApiKey')).toEqual({
    geminiApiKey: 'simulated-key',
  });
});

it('can restore the original Drive connection after a temporary disconnect', async () => {
  const meta = await store.activate('complete');
  await store.remove(meta.id, 'local', ['driveToken', 'driveBackupState']);
  await store.setEnabled('drive', false);
  await store.setEnabled('drive', true);
  expect(await store.read(meta.id, 'local', 'driveToken')).toEqual({
    driveToken: original.driveToken,
  });
  expect(await native.storage.local.get('driveToken')).toEqual({ driveToken: original.driveToken });
});

it('starts with Original after a browser restart clears session storage', async () => {
  await store.activate('complete');
  const restarted = new DevelopmentSessionStore(memoryChrome(await native.storage.local.get(null)));
  await restarted.initialize();
  expect(restarted.scope()).toBeNull();
  expect(await restarted.read(null, 'local', null)).toEqual(original);
});

it('rejects corrupt session metadata instead of opening a saved-data surface', async () => {
  await expect(native.storage.session.set({ [DEV_SESSION_KEY]: { id: 7 } })).rejects.toThrow(
    'Invalid development session',
  );
});

it('serializes rapid preset changes and preserves only the final session data', async () => {
  const [first, last] = await Promise.all([store.activate('empty'), store.activate('complete')]);
  expect(store.scope()).toBe(last.id);
  expect((await store.read(last.id, 'local', 'profile')).profile).toMatchObject({
    id: `dev-${last.id}`,
    personal: { firstName: 'Jane' },
  });
  await expect(store.read(first.id, 'local', 'profile')).rejects.toThrow(SESSION_ENDED);
  expect(await native.storage.local.get(null)).toEqual(original);
});

it('allows a new temporary Drive connection after its access was toggled off', async () => {
  const meta = await store.activate('complete');
  await store.setEnabled('drive', false);
  await store.write(meta.id, 'local', { driveToken: 'temporary-new-connection' });
  expect(await store.read(meta.id, 'local', 'driveToken')).toEqual({
    driveToken: 'temporary-new-connection',
  });
  expect((await native.storage.local.get('driveToken')).driveToken).toBe(original.driveToken);
});
