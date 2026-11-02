import { beforeEach, expect, it, vi } from 'vitest';
import { createPreviewChrome } from '@/src/preview/chrome';
import { clearAllStorage, getProfile, replaceProfileData, saveProfile } from '@/src/utils/storage';
import type { FrameFillLog } from '@/src/autofill/fillLog';
import {
  clearRetainedFillLog,
  readRetainedFillLog,
  retainFrameFillLog,
  RETAINED_FILL_DETAILS,
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
it('updates manual changes and Undo in the same retained frame', async () => {
  const report = log();
  await retainFrameFillLog(sender(), report, 'profile');
  report.fields[0].outcome = 'manual';
  report.fields[0].source = 'manual';
  await retainFrameFillLog(sender(), report, 'profile');
  expect((await readRetainedFillLog())?.frames[0].log.fields[0].outcome).toBe('manual');
  await retainFrameFillLog(sender(), { ...report, status: 'undone' }, 'profile');
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
