import type { Profile } from '@/src/types/profile';
import { profilePreset } from './profilePresets';
import type { PreviewPreset } from './quickPreview';

export const DEV_SESSION_KEY = 'jb:dev:active-session';
export const DEV_DATA_PREFIX = 'jb:dev:data:';
export type DevProfileMode = PreviewPreset | 'original';
export interface DevelopmentSession {
  id: string | null;
  preset: DevProfileMode;
  keyDisabled: boolean;
  driveDisabled: boolean;
  sampleAI: boolean;
}
export type StorageKeys = string | string[] | Record<string, unknown> | null;
export type SessionArea = 'local' | 'session';
export const SESSION_ENDED = 'The development session changed. Try the action again.';
const copiedKeys = [
  'profile',
  'learnedMappings',
  'themePreference',
  'quickFillPreferences',
  'geminiApiKey',
  'geminiModel',
  'geminiSettingsMeta',
  'driveToken',
  'driveBackupState',
];
function storedSession(value: unknown): DevelopmentSession | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object') throw new Error('Invalid development session');
  const session = value as DevelopmentSession;
  if (
    (session.id !== null && typeof session.id !== 'string') ||
    !['original', 'saved', 'empty', 'required', 'complete'].includes(session.preset) ||
    typeof session.keyDisabled !== 'boolean' ||
    typeof session.driveDisabled !== 'boolean' ||
    typeof session.sampleAI !== 'boolean'
  )
    throw new Error('Invalid development session');
  return session;
}

/** One browser-session store shared by the extension's development contexts. */
export class DevelopmentSessionStore {
  active: DevelopmentSession | null = null;
  private controls: Promise<unknown> = Promise.resolve();
  private listeners = new Set<(previous: DevelopmentSession | null) => void>();
  constructor(readonly native: typeof chrome) {}

  private async control<T>(operation: () => Promise<T>): Promise<T> {
    const action = async () => {
      this.active = storedSession(
        (await this.native.storage.session.get(DEV_SESSION_KEY))[DEV_SESSION_KEY],
      );
      return operation();
    };
    if (typeof navigator !== 'undefined' && navigator.locks?.request)
      return await navigator.locks.request('jb:dev:session-controls', action);
    const task = this.controls.then(action, action);
    this.controls = task.catch(() => {});
    return task;
  }
  async initialize() {
    this.active = storedSession(
      (await this.native.storage.session.get(DEV_SESSION_KEY))[DEV_SESSION_KEY],
    );
    this.native.storage.onChanged.addListener((changes, area) => {
      if (area !== 'session' || !changes[DEV_SESSION_KEY]) return;
      const previous = this.active;
      this.active = storedSession(changes[DEV_SESSION_KEY].newValue);
      this.listeners.forEach((listener) => listener(previous));
    });
  }
  subscribe(listener: (previous: DevelopmentSession | null) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  scope() {
    return this.active?.id ?? null;
  }
  assertScope(scope: string | null) {
    if (scope !== this.scope()) throw new Error(SESSION_ENDED);
  }
  private prefix(scope: string, area: SessionArea) {
    return `${DEV_DATA_PREFIX}${scope}:${area}:`;
  }

  async read(
    scope: string | null,
    area: SessionArea,
    keys: StorageKeys,
  ): Promise<Record<string, unknown>> {
    this.assertScope(scope);
    const defaults = keys && typeof keys === 'object' && !Array.isArray(keys) ? keys : {};
    const names =
      keys === null
        ? null
        : typeof keys === 'string'
          ? [keys]
          : Array.isArray(keys)
            ? keys
            : Object.keys(keys);
    let result: Record<string, unknown>;
    if (scope) {
      const prefix = this.prefix(scope, area);
      const values = await this.native.storage.session.get(
        names?.map((key) => prefix + key) ?? null,
      );
      result = {
        ...defaults,
        ...Object.fromEntries(
          Object.entries(values)
            .filter(([key]) => key.startsWith(prefix))
            .map(([key, value]) => [key.slice(prefix.length), value]),
        ),
      };
    } else {
      result = await this.native.storage[area].get(keys);
      if (area === 'session')
        result = Object.fromEntries(
          Object.entries(result).filter(
            ([key]) => key !== DEV_SESSION_KEY && !key.startsWith(DEV_DATA_PREFIX),
          ),
        );
    }
    this.assertScope(scope);
    if (area === 'local') {
      if (this.active?.keyDisabled) {
        delete result.geminiApiKey;
        delete result.geminiModel;
        if (names === null || names.includes('geminiDevDisabled')) result.geminiDevDisabled = true;
      } else if (this.active?.sampleAI && !scope) {
        if (names === null || names.includes('geminiApiKey')) result.geminiApiKey = 'simulated-key';
        if (names === null || names.includes('geminiModel'))
          result.geminiModel = 'gemini-3.8-flash';
      }
      if (this.active?.driveDisabled) delete result.driveToken;
    }
    return result;
  }
  async write(scope: string | null, area: SessionArea, values: Record<string, unknown>) {
    this.assertScope(scope);
    if (scope) {
      const prefix = this.prefix(scope, area);
      await this.native.storage.session.set(
        Object.fromEntries(Object.entries(values).map(([key, value]) => [prefix + key, value])),
      );
    } else await this.native.storage[area].set(values);
    if (area === 'local' && ('geminiApiKey' in values || 'driveToken' in values) && this.active) {
      this.assertScope(scope);
      const meta = {
        ...this.active,
        ...('geminiApiKey' in values && {
          keyDisabled: false,
          sampleAI: values.geminiApiKey === 'simulated-key',
        }),
        ...('driveToken' in values && { driveDisabled: false }),
      };
      await this.native.storage.session.set({ [DEV_SESSION_KEY]: meta });
      this.active = meta;
    }
  }
  async remove(scope: string | null, area: SessionArea, keys: string[]) {
    this.assertScope(scope);
    if (scope)
      await this.native.storage.session.remove(keys.map((key) => this.prefix(scope, area) + key));
    else await this.native.storage[area].remove(keys);
    if (area === 'local' && keys.includes('geminiApiKey') && this.active) {
      this.assertScope(scope);
      const meta = { ...this.active, sampleAI: false };
      await this.native.storage.session.set({ [DEV_SESSION_KEY]: meta });
      this.active = meta;
    }
  }
  activate(preset: DevProfileMode, keepOverrides = true) {
    return this.control(() => this.activateLocked(preset, keepOverrides));
  }
  private async activateLocked(preset: DevProfileMode, keepOverrides: boolean) {
    const original = await this.native.storage.local.get(copiedKeys);
    const previous = this.active;
    const temporary = preset !== 'original';
    const id = temporary ? crypto.randomUUID() : null;
    const meta: DevelopmentSession = {
      id,
      preset,
      keyDisabled: keepOverrides && !!previous?.keyDisabled,
      driveDisabled: keepOverrides && !!previous?.driveDisabled,
      sampleAI: temporary && !original.geminiApiKey,
    };
    const values: Record<string, unknown> = { [DEV_SESSION_KEY]: meta };
    if (id) {
      const profile =
        preset === 'saved'
          ? (structuredClone(original.profile ?? { id }) as Partial<Profile>)
          : profilePreset(preset as 'empty' | 'required' | 'complete');
      profile.id = `dev-${id}`;
      const initial = {
        ...original,
        profile,
        learnedMappings: structuredClone(original.learnedMappings ?? {}),
        devProfileDisabled: true,
        geminiDevDisabled: true,
        ...(!original.geminiApiKey
          ? { geminiApiKey: 'simulated-key', geminiModel: 'gemini-3.8-flash' }
          : {}),
      };
      for (const [key, value] of Object.entries(initial))
        values[this.prefix(id, 'local') + key] = value;
    }
    await this.native.storage.session.set(values);
    // The active pointer changes before retiring old data, so late writers fail closed.
    this.active = meta;
    const all = await this.native.storage.session.get(null);
    const obsolete = Object.keys(all).filter(
      (key) =>
        key.startsWith(DEV_DATA_PREFIX) && (!id || !key.startsWith(`${DEV_DATA_PREFIX}${id}:`)),
    );
    if (obsolete.length) await this.native.storage.session.remove(obsolete);
    if (this.native.alarms) {
      const alarms = await this.native.alarms.getAll();
      await Promise.all(
        alarms
          .filter(
            (alarm) =>
              alarm.name.startsWith('jb:dev:alarm:') &&
              (!id || !alarm.name.startsWith(`jb:dev:alarm:${id}:`)),
          )
          .map((alarm) => this.native.alarms.clear(alarm.name)),
      );
    }
    return meta;
  }
  setEnabled(feature: 'key' | 'drive', enabled: boolean) {
    return this.control(() => this.setEnabledLocked(feature, enabled));
  }
  private async setEnabledLocked(feature: 'key' | 'drive', enabled: boolean) {
    const meta: DevelopmentSession = {
      ...(this.active ?? {
        id: null,
        preset: 'original',
        keyDisabled: false,
        driveDisabled: false,
        sampleAI: false,
      }),
      [feature === 'key' ? 'keyDisabled' : 'driveDisabled']: !enabled,
    };
    if (feature === 'key' && enabled) {
      const original = await this.native.storage.local.get([
        'geminiApiKey',
        'geminiModel',
        'geminiSettingsMeta',
      ]);
      if (meta.id) {
        const prefix = this.prefix(meta.id, 'local');
        const saved = await this.native.storage.session.get(prefix + 'geminiApiKey');
        meta.sampleAI =
          (saved[prefix + 'geminiApiKey'] ?? original.geminiApiKey ?? 'simulated-key') ===
          'simulated-key';
        if (!saved[prefix + 'geminiApiKey'])
          await this.native.storage.session.set(
            Object.fromEntries(
              Object.entries(
                original.geminiApiKey
                  ? original
                  : { geminiApiKey: 'simulated-key', geminiModel: 'gemini-3.8-flash' },
              ).map(([key, value]) => [prefix + key, value]),
            ),
          );
      }
      if (!meta.id) meta.sampleAI = !original.geminiApiKey;
    }
    if (feature === 'drive' && enabled && meta.id) {
      const prefix = this.prefix(meta.id, 'local');
      const saved = await this.native.storage.session.get(prefix + 'driveToken');
      if (!saved[prefix + 'driveToken']) {
        const connection = await this.native.storage.local.get(['driveToken', 'driveBackupState']);
        await this.native.storage.session.set(
          Object.fromEntries(
            Object.entries(connection).map(([key, value]) => [prefix + key, value]),
          ),
        );
      }
    }
    await this.native.storage.session.set({ [DEV_SESSION_KEY]: meta });
    this.active = meta;
  }
}

let currentStore: DevelopmentSessionStore | undefined;
let boundScope: string | null | undefined;
export const developmentSession = () => (import.meta.env.DEV ? currentStore : undefined);
export const developmentScope = () =>
  currentStore ? (boundScope === undefined ? currentStore.scope() : boundScope) : null;
export function registerDevelopmentSession(
  store: DevelopmentSessionStore,
  fixedScope?: string | null,
) {
  currentStore = store;
  boundScope = fixedScope;
}
/** Keep delayed work from crossing a development session boundary. */
export function captureDevelopmentScope() {
  const store = developmentSession();
  const scope = developmentScope();
  return () => store?.assertScope(scope);
}
