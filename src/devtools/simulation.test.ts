import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DevSimulation } from './simulation';
import { profilePreset, scenarioById, SCENARIOS, sampleResumeText } from './scenarios';
import { calculateCompletion } from '@/src/utils/profileCompletion';
import { getProfile, saveProfile, getDriveBackupState } from '@/src/utils/storage';
import {
  connectDrive,
  syncProfileToDrive,
  finishDriveReview,
  retryPendingDriveSync,
} from '@/src/utils/driveSync';
import { extractFromResume, checkApiKey, RESUME_REQUEST_TIMEOUT_MS } from '@/src/resume-ai/gemini';
import { resumeChanges, resumeFileChange } from '@/src/resume-ai/resumeImport';
import { DEFAULT_GEMINI_MODEL } from '@/src/resume-ai/types';
import { devContext, devLockName } from './context';
import { inspectProfile, readDevSnapshot } from './inspect';
import { clearDevEvents, getDevEvents, recordDevEvent } from './diagnostics';

let simulation: DevSimulation;
function start(id: string) {
  simulation = new DevSimulation(scenarioById(id)!, 'test-extension', '1.0');
  vi.stubGlobal('__JB_DEV_CONTEXT__', {
    scenario: id,
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
  clearDevEvents();
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
    expect(new Set(SCENARIOS.map((scenario) => scenario.id)).size).toBe(SCENARIOS.length);
    expect(calculateCompletion(profilePreset('profile-empty')).percentage).toBe(0);
    expect(calculateCompletion(profilePreset('profile-minimum')).percentage).toBe(100);
    expect(calculateCompletion(profilePreset('profile-complete')).percentage).toBe(100);
    expect(sampleResumeText()).toContain('xref');
    expect(sampleResumeText()).toMatch(/^%PDF-1.4/);
  });
});

describe('actual Gemini flows with fake responses', () => {
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
    expect(simulation.lastResponseText).toContain('Jane');
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

describe('inspection and diagnostics', () => {
  it('keeps malformed stored data inspectable without calculating a misleading completion value', async () => {
    start('workspace');
    await new Promise<void>((resolve) =>
      chrome.storage.local.set(
        { profile: { personal: { firstName: 42 }, documents: { cv: { file: 'invalid' } } } },
        resolve,
      ),
    );
    const snapshot = await readDevSnapshot();
    expect(snapshot.completion).toBeNull();
    expect(snapshot.profile.personal?.firstName).toBe(42);
  });
  it('omits credentials and bytes without mutating the stored profile', async () => {
    start('resume-identical');
    const profile = (await getProfile())!;
    const redacted = inspectProfile({ ...profile, geminiApiKey: 'private', driveToken: 'private' });
    expect(redacted.documents?.cv.file).not.toHaveProperty('base64');
    expect(profile.documents.cv.file?.base64).toMatch(/^data:/);
    const snapshot = await readDevSnapshot();
    expect(JSON.stringify(snapshot)).not.toContain('simulated-key');
    expect(JSON.stringify(snapshot)).not.toContain('simulated-token');
    expect(JSON.stringify(snapshot)).not.toContain('data:application/pdf');
    expect(snapshot.completion?.percentage).toBe(100);
  });
  it('logs allowlisted fields only', () => {
    recordDevEvent({
      operation: 'storage',
      keys: ['profile', 'geminiApiKey', 'driveToken'],
      model: 'secret key',
      status: 200,
      durationMs: 15,
      ...{ body: 'private PDF bytes', token: 'secret' },
    });
    const log = JSON.stringify(getDevEvents());
    expect(log).toContain('profile');
    expect(log).not.toMatch(/geminiApiKey|driveToken|private|secret|body/);
  });
});
