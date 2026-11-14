import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IntegrationSimulation as DevSimulation } from '@/src/testing/integrationSimulation';
import { profilePreset } from './profilePresets';
import { sampleResumeText } from '@/src/testing/sampleResume';
import { calculateCompletion } from '@/src/utils/profileCompletion';
import { getProfile, saveProfile, getDriveBackupState } from '@/src/utils/storage';
import {
  connectDrive,
  syncProfileToDrive,
  finishDriveReview,
  retryPendingDriveSync,
} from '@/src/utils/driveSync';
import {
  extractFromResume,
  checkApiKey,
  reviewMappingsWithAI,
  RESUME_REQUEST_TIMEOUT_MS,
} from '@/src/resume-ai/gemini';
import { mappingReviewCatalog, mappingReviewItems } from '@/src/learned-mappings/review';
import { groupMappings } from '@/src/learned-mappings/groups';
import { resumeChanges, resumeFileChange } from '@/src/resume-ai/resumeImport';
import { DEFAULT_GEMINI_MODEL } from '@/src/resume-ai/types';
import { devContext, devLockName } from './context';

let simulation: DevSimulation;
function start(id: string) {
  simulation = new DevSimulation(id, 'test-extension', '1.0');
  vi.stubGlobal('__JB_DEV_CONTEXT__', {
    id: 'test-instance',
    extensionId: 'test-extension',
    version: '1.0',
  });
  vi.stubGlobal('chrome', simulation.chrome);
  vi.stubGlobal('fetch', simulation.fetch.bind(simulation));
  return simulation;
}
beforeEach(() => {
  vi.stubEnv('DEV', true);
});
afterEach(() => {
  simulation?.dispose();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('development isolation', () => {
  it('scopes locks to the simulation and ignores the context in production', () => {
    start('workspace');
    expect(devLockName('job-buddy:drive-backup')).toBe(
      'job-buddy:drive-backup:simulation:test-instance',
    );
    vi.stubEnv('DEV', false);
    expect(devContext()).toBeUndefined();
    expect(devLockName('job-buddy:drive-backup')).toBe('job-buddy:drive-backup');
  });
  it('blocks unexpected external requests instead of falling through to the network', async () => {
    const instance = start('workspace');
    await expect(instance.fetch('https://external.example/profile')).rejects.toThrow('disabled');
  });
  it('simulates failed writes through the normal storage error contract', async () => {
    start('resume-save-failure');
    const profile = (await getProfile())!;
    await expect(
      saveProfile({ ...profile, personal: { ...profile.personal, nickname: 'Changed' } }),
    ).rejects.toThrow('Simulated storage write failure');
    expect((await getProfile())?.personal.nickname).not.toBe('Changed');
    expect(chrome.runtime.lastError).toBeUndefined();
  });
  it('uses distinct valid preset states and a real PDF structure', () => {
    const complete = profilePreset('complete');
    expect(calculateCompletion(profilePreset('empty')).percentage).toBe(0);
    expect(calculateCompletion(profilePreset('required')).percentage).toBe(100);
    expect(calculateCompletion(complete).percentage).toBe(100);
    expect(complete.workHistory?.map((entry) => entry.isCurrent)).toEqual([true, false]);
    expect(complete.education?.map((entry) => entry.isCurrent)).toEqual([true, false]);
    expect(Object.values(complete.links!)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('linkedin.com'),
        expect.stringContaining('github.com'),
        expect.stringContaining('x.com'),
        expect.stringContaining('dribbble.com'),
        expect.stringContaining('behance.net'),
      ]),
    );
    for (const entry of [complete.documents?.cv, complete.documents?.coverLetter, complete.documents?.portfolio]) {
      const pdf = atob(entry!.file!.base64.split(',')[1]);
      expect(pdf).toMatch(/^%PDF-1.4/);
      expect(entry!.file!.size).toBe(pdf.length);
    }
    expect(complete.salary?.expected.map((entry) => entry.currency)).toEqual([
      complete.salary?.current?.currency,
      'EUR',
    ]);
    expect(sampleResumeText()).toContain('xref');
    expect(sampleResumeText()).toMatch(/^%PDF-1.4/);
  });
});

describe('actual Gemini flows with fake responses', () => {
  it('returns a complete simulated assessment for every mapping through the real review parser', async () => {
    start('workspace');
    const profile = (await getProfile())!;
    const items = mappingReviewItems(
      [
        ...groupMappings({
          'audif1.jobs.personio.de': Object.fromEntries(
            Array.from({ length: 8 }, (_, index) => [
              `salary${index}`,
              { path: 'salary.current.amount', count: 2, question: `Expected salary ${index}` },
            ]),
          ),
        }),
      ].flatMap(([domain, groups]) => groups.map((group) => ({ domain, group }))),
    );
    const result = await reviewMappingsWithAI(
      'simulated-key',
      DEFAULT_GEMINI_MODEL,
      items,
      mappingReviewCatalog(profile),
      new AbortController().signal,
    );
    expect(result.assessments).toEqual(
      items.map((item) => ({
        id: item.id,
        verdict: 'uncertain',
        path: null,
        reason: 'Simulated review. Check this mapping before applying changes.',
      })),
    );
  });
  it('uses the real timeout before switching away from a stalled simulated model', async () => {
    vi.useFakeTimers();
    start('ai-timeout');
    const attempts = vi.fn();
    const pending = extractFromResume(
      'simulated-key',
      DEFAULT_GEMINI_MODEL,
      'sample',
      'application/pdf',
      {},
      undefined,
      [],
      attempts,
    );
    await vi.advanceTimersByTimeAsync(RESUME_REQUEST_TIMEOUT_MS + 500);
    expect((await pending).personal?.firstName).toBe('Jane');
    expect(attempts).toHaveBeenLastCalledWith(expect.objectContaining({ reason: 'timeout' }));
  });
  it('produces no changes for the identical-data-and-file scenario', async () => {
    start('resume-identical');
    const profile = (await getProfile())!;
    const extracted = await extractFromResume(
      'simulated-key',
      DEFAULT_GEMINI_MODEL,
      'sample',
      'application/pdf',
      {},
    );
    expect(resumeChanges(profile, extracted).every((change) => change.status === 'unchanged')).toBe(
      true,
    );
    expect(resumeFileChange(profile.documents.cv.file!, profile.documents.cv.file).status).toBe(
      'unchanged',
    );
  });
  it.each(['ai-quota', 'ai-unavailable'])('exercises real fallback for %s', async (id) => {
    start(id);
    const attempts = vi.fn();
    const result = await extractFromResume(
      'simulated-key',
      DEFAULT_GEMINI_MODEL,
      'sample',
      'application/pdf',
      {},
      undefined,
      [],
      attempts,
    );
    expect(result.personal?.firstName).toBe('Jane');
    expect(attempts).toHaveBeenCalledTimes(2);
    expect(attempts.mock.calls[1][0].reason).toBe(id === 'ai-quota' ? 'rate_limit' : 'unavailable');
  });
  it('rejects malformed responses through the real schema validator', async () => {
    start('resume-malformed');
    await expect(
      extractFromResume('simulated-key', DEFAULT_GEMINI_MODEL, 'sample', 'application/pdf', {}),
    ).rejects.toMatchObject({ code: 'parse' });
  });
  it('reports an invalid key without contacting Google', async () => {
    start('ai-invalid');
    expect(await checkApiKey('simulated-key')).toBe('invalid');
  });
  it('keeps missing resume details absent for the normal review to preserve', async () => {
    start('resume-missing');
    const result = await extractFromResume(
      'simulated-key',
      DEFAULT_GEMINI_MODEL,
      'sample',
      'application/pdf',
      {},
    );
    expect(result.education?.[0].startDate).toBe('');
    expect(result.workHistory).toHaveLength(1);
  });
});

describe('actual Drive flows with an in-memory remote', () => {
  it('connects to an empty Drive and stores the full saved profile', async () => {
    const instance = start('drive-empty');
    expect((await connectDrive()).backup).toBeNull();
    expect(await syncProfileToDrive()).toMatchObject({ success: true });
    expect(instance.backup?.profile).toEqual(await getProfile());
    expect((await getDriveBackupState()).pendingSync).toBe(false);
  });
  it('acknowledges an identical backup without rewriting it', async () => {
    const instance = start('drive-identical');
    const result = await connectDrive();
    await finishDriveReview(result.reviewId);
    expect((await getDriveBackupState()).reviewRequired).toBe(false);
    expect(instance.backup?.profile).toEqual(await getProfile());
  });
  it('pauses uploads when an existing backup differs', async () => {
    start('drive-different');
    const result = await connectDrive();
    expect(result.backup?.profile.personal.nickname).toBe('From simulated Drive');
    expect(await syncProfileToDrive()).toMatchObject({
      success: false,
      errorCode: 'review_required',
    });
  });
  it('schedules and runs the normal retry after a simulated upload failure', async () => {
    const instance = start('drive-failure');
    instance.onAlarm = async () => {
      await retryPendingDriveSync();
    };
    expect(await syncProfileToDrive()).toMatchObject({ success: false, errorCode: 'sync_error' });
    expect(instance.pendingAlarms().some((alarm) => alarm.name === 'jb:drive-backup-retry')).toBe(
      true,
    );
    expect((await getDriveBackupState()).retryCount).toBe(1);
    await instance.fireAlarm('jb:drive-backup-retry');
    expect(instance.backup?.profile).toEqual(await getProfile());
    expect((await getDriveBackupState()).pendingSync).toBe(false);
  });
});

it('stops a simulated unrelated document through the real extraction path', async () => {
  start('resume-not-resume');
  await expect(
    extractFromResume('simulated-key', DEFAULT_GEMINI_MODEL, 'sample', 'application/pdf', {}),
  ).rejects.toMatchObject({ code: 'not_resume' });
});
it('delivers uncertainty as transient metadata, not as profile content', async () => {
  start('resume-uncertain');
  const assessment = vi.fn();
  const profile = await extractFromResume(
    'simulated-key',
    DEFAULT_GEMINI_MODEL,
    'sample',
    'application/pdf',
    {},
    undefined,
    [],
    undefined,
    assessment,
  );
  expect(assessment).toHaveBeenCalledWith('uncertain');
  expect(profile.personal?.firstName).toBe('Jane');
  expect(profile).not.toHaveProperty('documentType');
});
