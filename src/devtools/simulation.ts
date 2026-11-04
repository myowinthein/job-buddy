import type { Profile } from '@/src/types/profile';
import type { DriveBackupFile, LearnedMappings } from '@/src/types/storage';
import { createPreviewChrome } from '@/src/preview/chrome';
import { DEV_PROFILE } from '@/src/utils/devProfile';
import { DEFAULT_GEMINI_MODEL } from '@/src/resume-ai/types';
import { profilePreset, sampleResumeText, type Scenario } from './scenarios';
import { recordDevEvent } from './diagnostics';

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
  readonly initialProfile: Partial<Profile>;
  lastResponseText: string | null = null;
  private revision = 1;
  private generations = 0;
  private uploads = 0;
  private alarms = new Map<string, { when: number; timer: ReturnType<typeof setTimeout> }>();
  onAlarm?: (name: string) => Promise<void>;

  constructor(
    readonly scenario: Scenario,
    extensionId: string,
    version: string,
  ) {
    const profile = profilePreset(scenario.id);
    // Temporary sample data for the Learned Mappings pagination review.
    const learnedMappings: LearnedMappings = {};
    if (scenario.id === 'learned-mappings-pagination') {
      const fields = [
        ['First name', 'personal.firstName'],
        ['Email address', 'personal.email'],
        ['Last name', 'personal.lastName'],
        ['Preferred name', 'personal.nickname'],
        ['Phone number', 'personal.phone.full'],
        ['Street address', 'address.street'],
        ['City of residence', 'address.city'],
        ['State or province', 'address.state'],
        ['Postal code', 'address.postalCode'],
        ['Country', 'address.country'],
        ['LinkedIn profile', 'links.linkedin'],
        ['GitHub profile', 'links.github'],
        ['Portfolio website', 'links.portfolio'],
        ['Career summary', 'professional.summary'],
        ['Notice period', 'professional.noticePeriod.formatted'],
        ['Current employer', 'workHistory.0.company'],
        ['Job title', 'workHistory.0.title'],
        ['Institution', 'education.0.institution'],
        ['Degree', 'education.0.degree'],
        ['Language', 'languages.0.language'],
        ['Proficiency', 'languages.0.proficiency'],
        ['Resume URL', 'documents.cv.url'],
      ];
      for (let site = 0; site < 8; site++) {
        learnedMappings[`careers${site + 1}.example.test`] = Object.fromEntries(
          (site === 0 ? fields : fields.slice(0, 2)).map(([label, path], index) => [
            `question_${index + 1}`,
            {
              path,
              label,
              question: label,
              count: index % 3 === 1 ? 1 : 2,
              scope: 'field' as const,
              ...(index % 7 === 6 ? { inactive: true as const } : {}),
            },
          ]),
        );
      }
    }
    const sample = structuredClone(DEV_PROFILE);
    const {
      id: _id,
      derived: _derived,
      documents: _documents,
      salary: _salary,
      ...extracted
    } = sample;
    this.extracted = extracted;
    if (scenario.id === 'resume-conflicts') {
      this.extracted.personal!.nickname = 'Jane from resume';
      this.extracted.workHistory![0].description =
        'A new achievement extracted from the sample resume.';
    }
    if (scenario.id === 'resume-missing') {
      this.extracted.education![0].startDate = '';
      this.extracted.workHistory = this.extracted.workHistory!.slice(0, 1);
    }
    if (scenario.id === 'resume-identical')
      profile.documents = {
        ...profile.documents,
        cv: {
          ...profile.documents?.cv,
          file: {
            name: 'sample-resume.pdf',
            size: sampleResumeText().length,
            base64: `data:application/pdf;base64,${btoa(sampleResumeText())}`,
          },
        },
      };
    this.initialProfile = structuredClone(profile);
    const hasBackup = [
      'drive-identical',
      'drive-different',
      'drive-pending',
      'drive-reconnect',
    ].includes(scenario.id);
    this.backup = hasBackup
      ? {
          profile: structuredClone(profile) as Profile,
          learnedMappings: {},
          lastModified: new Date(Date.now() - 60_000).toISOString(),
        }
      : null;
    if (scenario.id === 'drive-different')
      this.backup!.profile.personal.nickname = 'From simulated Drive';
    const connected = [
      'drive-syncing',
      'drive-pending',
      'drive-reconnect',
      'drive-failure',
    ].includes(scenario.id);
    const base = createPreviewChrome(profile, undefined, {
      initialData: {
        devProfileDisabled: true,
        geminiDevDisabled: true,
        ...(scenario.id === 'learned-mappings-pagination' ? { learnedMappings } : {}),
        ...(scenario.id !== 'ai-no-key'
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
                fileId: this.backup ? 'simulated-backup' : null,
                lastSynced: this.backup?.lastModified ?? null,
                pendingSync: scenario.id === 'drive-pending',
                error: scenario.id === 'drive-reconnect' ? 'token_expired' : null,
                tokenExpiresAt:
                  Date.now() + (scenario.id === 'drive-reconnect' ? -1_000 : 3_600_000),
                accountEmail: 'simulation@example.test',
                oauthClientId: 'simulation-client',
              },
            }
          : {}),
      },
      failWrite: (items) =>
        scenario.id === 'resume-save-failure' && 'profile' in items
          ? 'Simulated storage write failure'
          : undefined,
    });
    this.chrome = {
      ...base,
      runtime: Object.assign(base.runtime, { id: extensionId, getManifest: () => ({ version }) }),
      identity: {
        getRedirectURL: () => 'https://simulation.invalid/',
        launchWebAuthFlow: (_options: unknown, callback: (url?: string) => void) => {
          recordDevEvent({ operation: 'oauth', status: 200 });
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
          if (name.includes('retry')) recordDevEvent({ operation: 'retry' });
        },
        clear: async (name: string) => this.clearAlarm(name),
      },
    };
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
    const start = performance.now();
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
    if (url.hostname !== 'generativelanguage.googleapis.com')
      recordDevEvent({
        operation:
          url.hostname === 'oauth2.googleapis.com'
            ? 'oauth'
            : init.method === 'DELETE'
              ? 'drive-delete'
              : ['POST', 'PATCH'].includes(init.method ?? '')
                ? 'drive-upload'
                : 'drive-read',
        status: response.status,
        durationMs: performance.now() - start,
      });
    return response;
  }

  private async gemini(url: URL, init: RequestInit): Promise<Response> {
    await delay(this.scenario.id === 'ai-checking' ? 3_000 : 300, init.signal);
    if (this.scenario.id === 'ai-invalid')
      return json({ error: { details: [{ reason: 'API_KEY_INVALID' }] } }, 400);
    if (!url.pathname.includes(':generateContent'))
      return json({ models: [{ name: DEFAULT_GEMINI_MODEL }] });
    const body = JSON.parse(String(init.body ?? '{}'));
    if (body.generationConfig?.maxOutputTokens === 1)
      return json({ candidates: [{ content: { parts: [{ text: 'OK' }] } }] });
    const attempt = ++this.generations;
    if (attempt === 1 && this.scenario.id === 'ai-quota') return json({}, 429);
    if (attempt === 1 && this.scenario.id === 'ai-unavailable') return json({}, 503);
    if (attempt === 1 && this.scenario.id === 'ai-timeout') await delay(60_000, init.signal);
    if (this.scenario.id === 'resume-cancel') await delay(12_000, init.signal);
    const text =
      this.scenario.id === 'resume-malformed'
        ? '{"education":"invalid"}'
        : this.scenario.id === 'resume-not-resume'
          ? JSON.stringify({ documentType: 'other' })
          : JSON.stringify({ documentType: this.scenario.id === 'resume-uncertain' ? 'uncertain' : 'resume', ...this.extracted });
    this.lastResponseText = text;
    return json({ candidates: [{ content: { parts: [{ text }] } }] });
  }

  private async drive(url: URL, init: RequestInit): Promise<Response> {
    await delay(150, init.signal);
    const method = init.method ?? 'GET';
    if (url.pathname.endsWith('/about'))
      return json({ user: { emailAddress: 'simulation@example.test' } });
    if (method === 'DELETE') {
      this.backup = null;
      return new Response(null, { status: 204 });
    }
    if (url.pathname.includes('/upload/')) {
      if (++this.uploads === 1 && this.scenario.id === 'drive-failure')
        return json({ error: { message: 'Simulated service failure' } }, 503);
      if (this.scenario.id === 'drive-syncing') await delay(10_000, init.signal);
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
