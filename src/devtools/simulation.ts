import type { Profile } from '@/src/types/profile';
import type { DriveBackupFile } from '@/src/types/storage';
import { createPreviewChrome } from '@/src/preview/chrome';
import { DEV_PROFILE } from '@/src/utils/devProfile';
import { DEFAULT_GEMINI_MODEL } from '@/src/resume-ai/types';

const json = (data: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
function delay(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

export class DevSimulation {
  readonly chrome;
  backup: DriveBackupFile | null;
  extracted: Partial<Profile>;
  private revision = 1;
  private alarms = new Map<string, { when: number; timer: ReturnType<typeof setTimeout> }>();
  onAlarm?: (name: string) => Promise<void>;

  constructor(
    extensionId: string,
    version: string,
    options: {
      profile?: Partial<Profile>;
      initialData?: Record<string, unknown>;
      noKey?: boolean;
      driveConnected?: boolean;
      failWrite?: (items: Record<string, unknown>) => string | undefined;
    } = {},
  ) {
    const profile = options.profile ?? structuredClone(DEV_PROFILE);
    const sample = structuredClone(DEV_PROFILE);
    const {
      id: _id,
      derived: _derived,
      documents: _documents,
      salary: _salary,
      ...extracted
    } = sample;
    this.extracted = extracted;
    this.backup = null;
    const connected = options.driveConnected ?? false;
    const base = createPreviewChrome(profile, undefined, {
      initialData: {
        devProfileDisabled: true,
        geminiDevDisabled: true,
        ...(!options.noKey
          ? {
              geminiApiKey: 'simulated-key',
              geminiModel: DEFAULT_GEMINI_MODEL,
              geminiSettingsMeta: {
                revision: 'simulation',
                preference: 'auto',
                verifiedAt: Date.now(),
              },
            }
          : {}),
        ...(connected
          ? {
              driveToken: 'simulated-token',
              driveBackupState: {
                fileId: null,
                lastSynced: null,
                pendingSync: false,
                error: null,
                tokenExpiresAt: Date.now() + 3_600_000,
                accountEmail: 'simulation@example.test',
                oauthClientId: 'simulation-client',
              },
            }
          : {}),
        ...options.initialData,
      },
      failWrite: options.failWrite,
    });
    this.chrome = {
      ...base,
      runtime: Object.assign(base.runtime, { id: extensionId, getManifest: () => ({ version }) }),
      identity: {
        getRedirectURL: () => 'https://simulation.invalid/',
        launchWebAuthFlow: (_options: unknown, callback: (url?: string) => void) => {
          queueMicrotask(() =>
            callback('https://simulation.invalid/#access_token=simulated-token&expires_in=3600'),
          );
        },
      },
      alarms: {
        create: async (name: string, info: { when: number }) => {
          this.clearAlarm(name);
          this.alarms.set(name, {
            when: info.when,
            timer: setTimeout(
              () => {
                void this.fireAlarm(name);
              },
              Math.max(1, info.when - Date.now()),
            ),
          });
        },
        clear: async (name: string) => this.clearAlarm(name),
      },
    };
  }

  async setDriveConnected(connected: boolean): Promise<void> {
    if (connected) {
      await new Promise<void>((resolve) =>
        this.chrome.storage.local.set(
          {
            driveToken: 'simulated-token',
            driveBackupState: {
              fileId: this.backup ? 'simulated-backup' : null,
              lastSynced: this.backup?.lastModified ?? null,
              pendingSync: false,
              error: null,
              tokenExpiresAt: Date.now() + 3_600_000,
              accountEmail: 'simulation@example.test',
              oauthClientId: 'simulation-client',
            },
          },
          resolve,
        ),
      );
    } else {
      await new Promise<void>((resolve) =>
        this.chrome.storage.local.remove(['driveToken', 'driveBackupState'], resolve),
      );
      for (const name of this.alarms.keys()) this.clearAlarm(name);
    }
  }

  private clearAlarm(name: string): boolean {
    const alarm = this.alarms.get(name);
    if (alarm) clearTimeout(alarm.timer);
    return this.alarms.delete(name);
  }
  async fireAlarm(name: string) {
    this.clearAlarm(name);
    await this.onAlarm?.(name);
  }
  pendingAlarms() {
    return [...this.alarms].map(([name, alarm]) => ({ name, when: alarm.when }));
  }
  dispose() {
    for (const name of this.alarms.keys()) this.clearAlarm(name);
  }

  async fetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const url = new URL(
      typeof input === 'string' || input instanceof URL ? String(input) : input.url,
    );
    const response =
      url.hostname === 'generativelanguage.googleapis.com'
        ? await this.gemini(url, init)
        : url.hostname === 'www.googleapis.com'
          ? await this.drive(url, init)
          : url.hostname === 'oauth2.googleapis.com'
            ? json({})
            : (() => {
                throw new Error('External requests are disabled in simulations.');
              })();
    return response;
  }

  protected async gemini(url: URL, init: RequestInit): Promise<Response> {
    await delay(300, init.signal);
    if (!url.pathname.includes(':generateContent'))
      return json({ models: [{ name: DEFAULT_GEMINI_MODEL }] });
    const body = JSON.parse(String(init.body ?? '{}'));
    const text =
      body.generationConfig?.maxOutputTokens === 1
        ? 'OK'
        : JSON.stringify({ documentType: 'resume', ...this.extracted });
    return json({ candidates: [{ content: { parts: [{ text }] } }] });
  }

  protected async drive(url: URL, init: RequestInit): Promise<Response> {
    await delay(150, init.signal);
    const method = init.method ?? 'GET';
    if (url.pathname.endsWith('/about'))
      return json({ user: { emailAddress: 'simulation@example.test' } });
    if (method === 'DELETE') {
      this.backup = null;
      return new Response(null, { status: 204 });
    }
    if (url.pathname.includes('/upload/')) {
      const body = String(init.body ?? '');
      const marker = 'Content-Type: application/json\r\n\r\n';
      const payload = body.includes(marker)
        ? body.slice(body.indexOf(marker) + marker.length, body.lastIndexOf('\r\n--'))
        : body;
      this.backup = JSON.parse(payload) as DriveBackupFile;
      this.revision++;
      return json({ id: 'simulated-backup' });
    }
    if (url.searchParams.get('alt') === 'media')
      return this.backup
        ? json(this.backup, 200, { ETag: `simulation-${this.revision}` })
        : json({}, 404);
    return json({
      files: this.backup ? [{ id: 'simulated-backup', name: 'job-buddy-profile.json' }] : [],
    });
  }
}
