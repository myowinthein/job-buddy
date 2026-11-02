import { beforeEach, expect, it, vi } from 'vitest';
import { createPreviewChrome } from '@/src/preview/chrome';
import { clearAllStorage, getProfile, replaceProfileData, saveProfile } from '@/src/utils/storage';
import type { FrameFillLog } from '@/src/autofill/fillLog';
import {
  clearRetainedFillLog,
  readRetainedFillLog,
  retainFrameFillLog,
  RETAINED_FILL_DETAILS,
  selectRetainedFillLog,
  fillDetailsClearedAt,
} from './retention';

const sender = (tabId = 10, frameId = 0): chrome.runtime.MessageSender => ({
  id: 'jb',
  tab: { id: tabId } as chrome.tabs.Tab,
  frameId,
});
const log = (runId = 'first', startedAt = 1): FrameFillLog => ({
  version: 1,
  runId,
  startedAt,
  completedAt: startedAt + 1,
  origin: 'https://form.test',
  status: 'completed',
  fields: [
    {
      id: 'first',
      label: 'First name',
      kind: 'text',
      outcome: 'high_confidence',
      source: 'rules',
      rule: { outcome: 'filled' },
      ai: { outcome: 'not_sent' },
    },
  ],
});
beforeEach(async () => {
  const preview = createPreviewChrome({ id: 'profile' });
  Object.assign(preview.runtime, { id: 'jb' });
  vi.stubGlobal('chrome', preview);
});

it('keeps only one run, combines its frames, and ignores old updates and empty sandboxes', async () => {
  await retainFrameFillLog(sender(), log(), 'profile');
  await retainFrameFillLog(sender(10, 5), log(), 'profile');
  expect((await readRetainedFillLog())?.frames).toHaveLength(2);
  await retainFrameFillLog(sender(), { ...log(), modifiedAt: 3 }, 'profile');
  expect((await readRetainedFillLog())?.frames.map((frame) => frame.frameId)).toEqual([0, 5]);
  await retainFrameFillLog(sender(20), { ...log('sandbox', 5), fields: [] }, 'profile');
  expect((await readRetainedFillLog())?.tabId).toBe(10);
  await retainFrameFillLog(sender(20), log('second', 10), 'profile');
  await retainFrameFillLog(sender(), log(), 'profile');
  expect(await readRetainedFillLog()).toMatchObject({
    tabId: 20,
    frames: [{ log: { runId: 'second' } }],
  });
  expect((await readRetainedFillLog())?.frames).toHaveLength(1);
});
it('explicitly selects an older form, ignores edits on other forms and follows the next autofill', async () => {
  await retainFrameFillLog(sender(), log('A', 1), 'profile');
  const a = (await readRetainedFillLog())!;
  await retainFrameFillLog(sender(20), log('B', 5), 'profile');
  await selectRetainedFillLog(a, 10);
  expect((await readRetainedFillLog())?.tabId).toBe(10);
  await retainFrameFillLog(sender(20), { ...log('B', 5), modifiedAt: 11 }, 'profile');
  expect((await readRetainedFillLog())?.tabId).toBe(10);
  await retainFrameFillLog(sender(), { ...log('A', 1), modifiedAt: 12 }, 'profile');
  expect((await readRetainedFillLog())?.frames[0].log.modifiedAt).toBe(12);
  await retainFrameFillLog(sender(20), log('B-new', 15), 'profile');
  expect((await readRetainedFillLog())?.tabId).toBe(20);
  await selectRetainedFillLog(a, 14);
  expect((await readRetainedFillLog())?.tabId).toBe(20);
});
it('retains required markers, real modification times and a sanitized job-form URL', async () => {
  const report = { ...log(), modifiedAt: 4, url: 'https://form.test/apply/1?token=private' };
  report.fields[0].required = true;
  await retainFrameFillLog(
    {
      ...sender(),
      frameId: 5,
      tab: {
        id: 10,
        url: 'https://jobs.test/apply/1?source=test&token=private',
      } as chrome.tabs.Tab,
    },
    report,
    'profile',
  );
  expect(await readRetainedFillLog()).toMatchObject({
    pageUrl: 'https://jobs.test/apply/1?source=test',
    frames: [
      { log: { modifiedAt: 4, url: 'https://form.test/apply/1', fields: [{ required: true }] } },
    ],
  });
});
it('keeps a completed report during a retry and accepts completion on the explicitly selected form', async () => {
  await retainFrameFillLog(sender(), log('A', 1), 'profile');
  await selectRetainedFillLog(
    { tabId: 10, frames: [{ frameId: 0, log: { ...log('A-retry', 5), status: 'scanning' } }] },
    10,
  );
  expect((await readRetainedFillLog())?.frames[0].log.runId).toBe('A');
  await retainFrameFillLog(sender(), log('A-retry', 5), 'profile');
  expect(await readRetainedFillLog()).toMatchObject({
    selectedAt: 10,
    frames: [{ log: { runId: 'A-retry' } }],
  });
  await retainFrameFillLog(sender(20), log('older-B', 9), 'profile');
  expect((await readRetainedFillLog())?.tabId).toBe(10);
});
it('keeps the reset cutoff when an empty older report is explicitly opened', async () => {
  await clearRetainedFillLog();
  const cutoff = await fillDetailsClearedAt();
  await selectRetainedFillLog({ tabId: 10, frames: [{ frameId: 0, log: log() }] }, cutoff + 1);
  expect((await readRetainedFillLog())?.frames).toEqual([]);
  expect(await fillDetailsClearedAt()).toBe(cutoff);
  await retainFrameFillLog(sender(), log(), 'profile');
  expect((await readRetainedFillLog())?.frames).toEqual([]);
});
it('updates manual changes and Undo in the same retained frame', async () => {
  const report = log();
  await retainFrameFillLog(sender(), report, 'profile');
  report.fields[0].outcome = 'manual';
  report.fields[0].source = 'manual';
  report.modifiedAt = 10;
  await retainFrameFillLog(sender(), report, 'profile');
  expect((await readRetainedFillLog())?.frames[0].log.fields[0].outcome).toBe('manual');
  await retainFrameFillLog(sender(), { ...log(), modifiedAt: 9 }, 'profile');
  expect((await readRetainedFillLog())?.frames[0].log.fields[0].outcome).toBe('manual');
  await retainFrameFillLog(sender(), { ...report, modifiedAt: 11, status: 'undone' }, 'profile');
  await retainFrameFillLog(sender(), { ...report, modifiedAt: 12 }, 'profile');
  expect((await readRetainedFillLog())?.frames[0].log.status).toBe('undone');
});
it('projects metadata and drops values, debug details, credentials and unknown properties', async () => {
  const report = log();
  Object.assign(report, {
    profile: { email: 'private@example.test' },
    apiKey: 'secret',
    debug: 'private',
  });
  Object.assign(report.fields[0], { value: 'Jane', options: ['private'] });
  Object.assign(report.fields[0].ai, { aiResult: 'private' });
  await retainFrameFillLog(sender(), report, 'profile');
  const stored = JSON.stringify(await readRetainedFillLog());
  for (const value of ['private', 'secret', 'Jane', 'apiKey', 'aiResult', 'options'])
    expect(stored).not.toContain(value);
});
it('rejects invalid senders and malformed or incomplete reports', async () => {
  await retainFrameFillLog({ ...sender(), id: 'other' }, log(), 'profile');
  await retainFrameFillLog({ ...sender(), frameId: undefined }, log(), 'profile');
  await retainFrameFillLog(sender(), { ...log(), status: 'scanning' }, 'profile');
  await retainFrameFillLog(sender(), { ...log(), fields: [{ value: 'private' }] }, 'profile');
  expect(await readRetainedFillLog()).toBeNull();
});
it('cannot restore reports after reset or a profile replacement', async () => {
  await retainFrameFillLog(sender(), log(), 'profile');
  await clearRetainedFillLog();
  await retainFrameFillLog(sender(), log(), 'profile');
  expect(await readRetainedFillLog()).toBeNull();
  await new Promise<void>((resolve) =>
    chrome.storage.local.set({ profile: { id: 'replacement' } }, resolve),
  );
  await retainFrameFillLog(sender(), log(), 'profile');
  expect(await readRetainedFillLog()).toBeNull();
  await new Promise<void>((resolve) => chrome.storage.local.remove('profile', resolve));
  await retainFrameFillLog(sender(), log('second', 2), 'replacement');
  expect(await readRetainedFillLog()).toBeNull();
});
it('stores the report in session storage only', async () => {
  await retainFrameFillLog(sender(), log(), 'profile');
  const stored = await new Promise<Record<string, unknown>>((resolve) =>
    chrome.storage.local.get(null, (result) => resolve(result)),
  );
  expect(stored).not.toHaveProperty(RETAINED_FILL_DETAILS);
  await clearRetainedFillLog();
  expect(await readRetainedFillLog()).toBeNull();
});

it('Reset All Data removes the retained report and rejects late form updates', async () => {
  await retainFrameFillLog(sender(), log(), 'profile');
  await clearAllStorage();
  expect(await readRetainedFillLog()).toBeNull();
  await retainFrameFillLog(sender(), log(), 'profile');
  expect(await readRetainedFillLog()).toBeNull();
});

it('replacing a profile clears its report while ordinary profile saves preserve it', async () => {
  const profile = (await getProfile())!;
  await retainFrameFillLog(sender(), log(), profile.id);
  await saveProfile({ ...profile, personal: { ...profile.personal, firstName: 'Edited' } });
  expect(await readRetainedFillLog()).not.toBeNull();
  const current = (await getProfile())!;
  await replaceProfileData({ ...current, id: 'new-person' }, current, {});
  expect(await readRetainedFillLog()).toBeNull();
  await retainFrameFillLog(sender(), log(), profile.id);
  expect(await readRetainedFillLog()).toBeNull();
});
