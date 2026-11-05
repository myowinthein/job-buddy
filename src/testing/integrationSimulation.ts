import { DevSimulation } from '@/src/devtools/simulation';
import { profilePreset } from '@/src/devtools/profilePresets';
import type { Profile } from '@/src/types/profile';
import type { DriveBackupFile } from '@/src/types/storage';
import { sampleResumeText } from './sampleResume';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

async function delay(ms: number, signal?: AbortSignal | null) {
  await new Promise<void>((resolve, reject) => {
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

/** Failure injection belongs to automated integration tests, outside the dev bar. */
export class IntegrationSimulation extends DevSimulation {
  private attempts = 0;
  private uploads = 0;

  constructor(
    private readonly fixture: string,
    extensionId: string,
    version: string,
  ) {
    const profile = profilePreset('complete');
    if (fixture === 'resume-identical')
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
    const backup: DriveBackupFile | null = ['drive-identical', 'drive-different'].includes(fixture)
      ? {
          profile: structuredClone(profile) as Profile,
          learnedMappings: {},
          lastModified: new Date(Date.now() - 60_000).toISOString(),
        }
      : null;
    if (fixture === 'drive-different') backup!.profile.personal.nickname = 'From simulated Drive';
    super(extensionId, version, {
      profile,
      driveConnected: fixture === 'drive-failure',
      failWrite: (items) =>
        fixture === 'resume-save-failure' && 'profile' in items
          ? 'Simulated storage write failure'
          : undefined,
    });
    this.backup = backup;
    if (fixture === 'resume-missing') {
      this.extracted.education![0].startDate = '';
      this.extracted.workHistory = this.extracted.workHistory!.slice(0, 1);
    }
  }

  protected override async gemini(url: URL, init: RequestInit): Promise<Response> {
    if (this.fixture === 'ai-invalid')
      return json({ error: { details: [{ reason: 'API_KEY_INVALID' }] } }, 400);
    const body = JSON.parse(String(init.body ?? '{}'));
    if (url.pathname.includes(':generateContent') && body.generationConfig?.maxOutputTokens !== 1) {
      const attempt = ++this.attempts;
      if (attempt === 1 && this.fixture === 'ai-quota') return json({}, 429);
      if (attempt === 1 && this.fixture === 'ai-unavailable') return json({}, 503);
      if (attempt === 1 && this.fixture === 'ai-timeout') await delay(60_000, init.signal);
      const text =
        this.fixture === 'resume-malformed'
          ? '{"education":"invalid"}'
          : this.fixture === 'resume-not-resume'
            ? JSON.stringify({ documentType: 'other' })
            : this.fixture === 'resume-uncertain'
              ? JSON.stringify({ documentType: 'uncertain', ...this.extracted })
              : null;
      if (text !== null) return json({ candidates: [{ content: { parts: [{ text }] } }] });
    }
    return super.gemini(url, init);
  }

  protected override async drive(url: URL, init: RequestInit): Promise<Response> {
    if (url.pathname.includes('/upload/')) {
      if (++this.uploads === 1 && this.fixture === 'drive-failure')
        return json({ error: { message: 'Simulated service failure' } }, 503);
    }
    return super.drive(url, init);
  }
}
