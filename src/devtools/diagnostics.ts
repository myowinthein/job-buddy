export interface DevEvent {
  time: string;
  event: string;
  operation?: string;
  status?: number;
  durationMs?: number;
  model?: string;
  keys?: string[];
  section?: string;
  outcome?: 'success' | 'error' | 'timeout' | 'cancelled';
}
const operations = new Set([
  'key-check',
  'model-request',
  'drive-read',
  'drive-upload',
  'drive-delete',
  'oauth',
  'retry',
  'storage',
  'profile-save',
]);
const storageKeys = new Set([
  'profile',
  'learnedMappings',
  'themePreference',
  'geminiSettingsMeta',
  'driveBackupState',
]);
let events: DevEvent[] = [];
let installed = false;
let dispose = () => {};
const listeners = new Set<() => void>();
export const getDevEvents = () => events;
export function subscribeDevEvents(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function clearDevEvents() {
  events = [];
  listeners.forEach((listener) => listener());
}
export function recordDevEvent(input: Partial<DevEvent>) {
  // Export only allowlisted diagnostics, never request bodies, URLs, or settings values.
  const event: DevEvent = { time: new Date().toISOString(), event: 'State updated' };
  if (input.operation && operations.has(input.operation)) event.operation = input.operation;
  if (typeof input.status === 'number' && input.status >= 100 && input.status <= 599)
    event.status = input.status;
  if (typeof input.durationMs === 'number' && Number.isFinite(input.durationMs))
    event.durationMs = Math.max(0, Math.round(input.durationMs));
  if (typeof input.model === 'string' && /^gemini-[a-z0-9.-]{1,60}$/.test(input.model))
    event.model = input.model;
  if (
    typeof input.section === 'string' &&
    [
      'personal',
      'address',
      'salary',
      'workAuthorization',
      'workHistory',
      'education',
      'languages',
      'links',
      'documents',
      'resume',
      'settings',
    ].includes(input.section)
  )
    event.section = input.section;
  if (input.outcome && ['success', 'error', 'timeout', 'cancelled'].includes(input.outcome))
    event.outcome = input.outcome;
  if (Array.isArray(input.keys)) event.keys = input.keys.filter((key) => storageKeys.has(key));
  event.event =
    event.operation === 'profile-save'
      ? event.status === 200
        ? 'Profile saved'
        : 'Profile save failed'
      : event.operation === 'storage'
        ? 'Storage updated'
        : event.operation === 'retry'
          ? 'Retry scheduled'
          : event.outcome === 'timeout'
            ? 'Request timed out'
            : event.outcome === 'cancelled'
              ? 'Request cancelled'
              : event.outcome === 'error'
                ? 'Request failed'
                : 'Request completed';
  events = [...events.slice(-199), event];
  listeners.forEach((listener) => listener());
}

export function installDevDiagnostics() {
  if (installed) return dispose;
  installed = true;
  const storageChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    const keys = Object.keys(changes).filter((key) => storageKeys.has(key));
    if (area === 'local' && keys.length) recordDevEvent({ operation: 'storage', keys });
  };
  const requestCompleted = (event: Event) => {
    const detail: unknown = (event as CustomEvent).detail;
    if (detail && typeof detail === 'object') recordDevEvent(detail as Partial<DevEvent>);
  };
  const changes = chrome.storage.onChanged;
  changes.addListener(storageChanged);
  window.addEventListener('jb:dev:request', requestCompleted);
  dispose = () => {
    changes.removeListener(storageChanged);
    window.removeEventListener('jb:dev:request', requestCompleted);
    installed = false;
  };
  return dispose;
}
