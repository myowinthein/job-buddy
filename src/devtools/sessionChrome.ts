import {
  DevelopmentSessionStore,
  DEV_SESSION_KEY,
  DEV_DATA_PREFIX,
  developmentScope,
  registerDevelopmentSession,
  type SessionArea,
  type StorageKeys,
} from './session';
import { DevSimulation } from './simulation';
import { DEV_SAMPLE_API_KEY } from './context';

type StorageListener = Parameters<typeof chrome.storage.onChanged.addListener>[0];
type MessageListener = Parameters<typeof chrome.runtime.onMessage.addListener>[0];

/** Route existing storage consumers through the active development session. */
export async function installDevelopmentSession(
  kind: 'background' | 'content' | 'popup' | 'options',
) {
  if (!import.meta.env.DEV) return;
  const native = globalThis.chrome;
  if (kind === 'background') {
    await native.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });
  } else {
    const ready = await native.runtime.sendMessage({ action: 'JB_DEV_READY' });
    if (!ready) throw new Error('The development session is unavailable');
  }
  const store = new DevelopmentSessionStore(native);
  await store.initialize();
  if (kind === 'options') {
    const params = new URLSearchParams(location.search);
    const requested = params.get('devSession');
    if (!params.has('devEmbedded') && requested && requested === store.scope()) {
      await store.activate(store.active!.preset);
    }
    const url = new URL(location.href);
    for (const key of ['devPreview', 'devPreviewSeed', 'devNoKey', 'devDrive', 'devSession'])
      url.searchParams.delete(key);
    if (store.active?.id) url.searchParams.set('devSession', store.active.id);
    history.replaceState(history.state, '', url);
  }
  const fixed = kind === 'options' || kind === 'popup' ? store.scope() : undefined;
  registerDevelopmentSession(store, fixed);
  const listeners = new Set<StorageListener>();
  let error: { message: string } | undefined;
  const runtimeListeners = new Map<MessageListener, MessageListener>();
  const aiRequests = new Set<AbortController>();
  const scope = () => developmentScope();
  const storage = (area: SessionArea) => ({
    get(keys: StorageKeys = null, callback?: (data: Record<string, unknown>) => void) {
      const result = store.read(scope(), area, keys);
      if (!callback) return result;
      void result.then(callback, (failure) => {
        error = { message: failure instanceof Error ? failure.message : String(failure) };
        try {
          callback({});
        } finally {
          error = undefined;
        }
      });
    },
    set(values: Record<string, unknown>, callback?: () => void) {
      const result = store.write(scope(), area, values);
      if (!callback) return result;
      void result.then(callback, (failure) => {
        error = { message: failure instanceof Error ? failure.message : String(failure) };
        try {
          callback();
        } finally {
          error = undefined;
        }
      });
    },
    remove(keys: string | string[], callback?: () => void) {
      const result = store.remove(scope(), area, typeof keys === 'string' ? [keys] : keys);
      if (!callback) return result;
      void result.then(callback, (failure) => {
        error = { message: failure instanceof Error ? failure.message : String(failure) };
        try {
          callback();
        } finally {
          error = undefined;
        }
      });
    },
    clear(callback?: () => void) {
      const binding = scope();
      const result = store
        .read(binding, area, null)
        .then((values) => store.remove(binding, area, Object.keys(values)));
      if (!callback) return result;
      void result.then(callback, (failure) => {
        error = { message: String(failure) };
        try {
          callback();
        } finally {
          error = undefined;
        }
      });
    },
  });
  const emit = (changes: Record<string, chrome.storage.StorageChange>, area: SessionArea) => {
    if (Object.keys(changes).length) for (const listener of listeners) listener(changes, area);
  };
  native.storage.onChanged.addListener((changes, area) => {
    const binding = scope();
    if (binding !== store.scope()) return;
    if (binding) {
      if (area !== 'session') return;
      for (const target of ['local', 'session'] as const) {
        const prefix = `${DEV_DATA_PREFIX}${binding}:${target}:`;
        emit(
          Object.fromEntries(
            Object.entries(changes)
              .filter(([key]) => key.startsWith(prefix))
              .map(([key, value]) => [key.slice(prefix.length), value]),
          ),
          target,
        );
      }
    } else if (area === 'local' || area === 'session') {
      emit(
        Object.fromEntries(
          Object.entries(changes).filter(
            ([key]) => key !== DEV_SESSION_KEY && !key.startsWith(DEV_DATA_PREFIX),
          ),
        ),
        area,
      );
    }
  });
  const updateContext = () => {
    const meta = store.active;
    globalThis.__JB_DEV_CONTEXT__ = meta?.id
      ? {
          id: meta.id,
          extensionId: native.runtime.id,
          version: native.runtime.getManifest().version,
          quickPreview: meta.preset === 'original' ? 'saved' : meta.preset,
        }
      : undefined;
  };
  updateContext();
  store.subscribe((previous) => {
    if ((previous?.id ?? null) !== store.scope() || store.active?.keyDisabled) {
      aiRequests.forEach((controller) =>
        controller.abort(new DOMException('Development settings changed', 'AbortError')),
      );
    }
    if (fixed === undefined) updateContext();
    void store
      .read(scope(), 'local', null)
      .then((values) => {
        const changed =
          (previous?.id ?? null) === store.scope()
            ? {
                geminiApiKey: values.geminiApiKey,
                geminiModel: values.geminiModel,
                driveToken: values.driveToken,
                geminiDevDisabled: values.geminiDevDisabled,
              }
            : {
                ...values,
                profile: values.profile,
                geminiApiKey: values.geminiApiKey,
                geminiModel: values.geminiModel,
                driveToken: values.driveToken,
              };
        emit(
          Object.fromEntries(
            Object.entries(changed).map(([key, value]) => [key, { newValue: value }]),
          ),
          'local',
        );
      })
      .catch(() => {});
    if (kind === 'popup' && fixed !== store.scope()) location.reload();
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('jb:dev:session-state'));
  });
  const onMessage = {
    addListener(listener: MessageListener) {
      const wrapped: MessageListener = (message, sender, respond) => {
        if (
          message?.__jbDevSession !== undefined &&
          message.__jbDevSession !== scope() &&
          !['CLEAR', 'GET_STATUS', 'AUTOFILL_CANCEL'].includes(message.action)
        ) {
          respond(null);
          return false;
        }
        return listener(message, sender, respond);
      };
      runtimeListeners.set(listener, wrapped);
      native.runtime.onMessage.addListener(wrapped);
    },
    removeListener(listener: MessageListener) {
      const wrapped = runtimeListeners.get(listener);
      if (wrapped) native.runtime.onMessage.removeListener(wrapped);
      runtimeListeners.delete(listener);
    },
    hasListener(listener: MessageListener) {
      return runtimeListeners.has(listener);
    },
  };
  const runtime = new Proxy(native.runtime, {
    get(target, key) {
      if (key === 'lastError') return error ?? target.lastError;
      if (key === 'onMessage') return onMessage;
      if (key === 'sendMessage')
        return (message: Record<string, unknown>, ...args: unknown[]) =>
          Reflect.apply(target.sendMessage, target, [
            { ...message, __jbDevSession: scope() },
            ...args,
          ]);
      return Reflect.get(target, key);
    },
  });
  const identity =
    native.identity &&
    new Proxy(native.identity, {
      get(target, key) {
        if (key === 'removeCachedAuthToken')
          return (details: chrome.identity.InvalidTokenDetails, callback?: () => void) => {
            if (scope()) {
              callback?.();
              return Promise.resolve();
            }
            return callback
              ? target.removeCachedAuthToken(details, callback)
              : target.removeCachedAuthToken(details);
          };
        return Reflect.get(target, key);
      },
    });
  const alarmName = (name: string) => (scope() ? `jb:dev:alarm:${scope()}:${name}` : name);
  const alarms = native.alarms && {
    ...native.alarms,
    create: (name: string, info: chrome.alarms.AlarmCreateInfo) =>
      native.alarms.create(alarmName(name), info),
    clear: (name: string) => native.alarms.clear(alarmName(name)),
    get: (name: string) => native.alarms.get(alarmName(name)),
    onAlarm: {
      addListener(listener: (alarm: chrome.alarms.Alarm) => void) {
        native.alarms.onAlarm.addListener((alarm) => {
          const prefix = `jb:dev:alarm:${scope()}:`;
          if (scope() && alarm.name.startsWith(prefix))
            listener({ ...alarm, name: alarm.name.slice(prefix.length) });
          else if (!scope() && !alarm.name.startsWith('jb:dev:alarm:')) listener(alarm);
        });
      },
    },
  };
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: {
      ...native,
      runtime,
      identity,
      alarms,
      storage: {
        ...native.storage,
        local: storage('local'),
        session: storage('session'),
        onChanged: {
          addListener: (listener: StorageListener) => listeners.add(listener),
          removeListener: (listener: StorageListener) => listeners.delete(listener),
          hasListener: (listener: StorageListener) => listeners.has(listener),
        },
      },
    },
  });
  const nativeFetch = globalThis.fetch.bind(globalThis);
  const samples = new DevSimulation(native.runtime.id, native.runtime.getManifest().version);
  globalThis.fetch = async (input, init = {}) => {
    const binding = scope();
    store.assertScope(binding);
    const source = input instanceof Request ? input : undefined;
    const method = (init.method ?? source?.method ?? 'GET').toUpperCase();
    const signal = init.signal ?? source?.signal;
    const url = new URL(
      typeof input === 'string' || input instanceof URL ? String(input) : input.url,
      typeof location === 'undefined' ? undefined : location.href,
    );
    if (url.hostname === 'generativelanguage.googleapis.com') {
      if (store.active?.keyDisabled) throw new Error('AI is disabled by the development bar');
      const controller = new AbortController();
      const abort = () => controller.abort(signal?.reason);
      if (signal?.aborted) abort();
      else signal?.addEventListener('abort', abort, { once: true });
      aiRequests.add(controller);
      try {
        const request = { ...init, signal: controller.signal };
        const response =
          new Headers(init.headers ?? source?.headers).get('x-goog-api-key') === DEV_SAMPLE_API_KEY
            ? await samples.fetch(input, request)
            : await nativeFetch(input, request);
        const body = await response.arrayBuffer();
        controller.signal.throwIfAborted();
        store.assertScope(binding);
        return new Response([204, 205, 304].includes(response.status) ? null : body, {
          status: response.status,
          headers: response.headers,
        });
      } finally {
        aiRequests.delete(controller);
        signal?.removeEventListener('abort', abort);
      }
    }
    if (
      binding &&
      ['www.googleapis.com', 'oauth2.googleapis.com'].includes(url.hostname) &&
      !['GET', 'HEAD'].includes(method)
    ) {
      if (method === 'DELETE') return new Response(null, { status: 204 });
      return Response.json({ id: `dev-${binding}`, modifiedTime: new Date().toISOString() });
    }
    const response = await nativeFetch(input, init);
    store.assertScope(binding);
    return response;
  };
  return store;
}
