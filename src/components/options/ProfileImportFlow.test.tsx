// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from '@/entrypoints/options/App';
import { ToastProvider } from '@/src/components/ui/Toast';
import { createPreviewChrome } from '@/src/preview/chrome';
import { generateDiff } from '@/src/resume-ai/parser';
import { validateImportedProfile } from '@/src/utils/profileValidator';
import * as previewDrive from '@/src/utils/driveSync';
import {
  getProfile,
  getLearnedMappings,
  getApplicationHistory,
  saveProfile,
  saveApplicationHistory,
} from '@/src/utils/storage';
import { settingsReviewProfile, SETTINGS_REVIEW_HISTORY } from './settingsReviewFixture';

vi.mock('@/src/utils/driveSync', () => import('@/src/preview/driveSync'));
vi.mock('@/src/resume-ai/gemini', () => import('@/src/preview/gemini'));
vi.mock('./ResumeImportSection', () => ({ ResumeImportSection: () => null }));

beforeEach(() => {
  sessionStorage.clear();
  sessionStorage.setItem('jb:ui:section', 'settings');
  vi.stubGlobal('chrome', createPreviewChrome(settingsReviewProfile()));
  vi.stubEnv('VITE_GEMINI_API_KEY', undefined);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(0), 0),
  );
  vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
});
afterEach(async () => {
  cleanup();
  await act(async () => {
    await Promise.resolve();
  });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function baseProfile() {
  const profile = settingsReviewProfile();
  delete profile.personal.nickname;
  return profile;
}
function incomingProfile() {
  const profile = baseProfile();
  profile.personal.firstName = 'Alex Imported';
  profile.personal.nickname = 'Lex Imported';
  profile.professional.summary = 'Incoming summary';
  profile.professional.noticePeriod = { immediate: false, value: 6, unit: 'month' };
  return profile;
}
async function mountBase(profile = baseProfile()) {
  await saveProfile(profile);
  render(
    <ToastProvider>
      <App />
    </ToastProvider>,
  );
  await screen.findByText('Choose File');
}
function upload(profile: unknown, extras: object = {}) {
  fireEvent.change(document.querySelector('input[type="file"]')!, {
    target: {
      files: [
        new File([JSON.stringify({ profile, ...extras })], 'backup.json', {
          type: 'application/json',
        }),
      ],
    },
  });
}
const importSelected = () => screen.getByRole('button', { name: /^Import Selected/ });

it('shows summary and notice period and saves only the one selected detail', async () => {
  await mountBase();
  upload(incomingProfile(), { exportedAt: '2026-10-29T12:12:23Z' });
  await screen.findByText('Review Changes');
  expect(screen.queryByText(/backup.json|Exported/)).toBeNull();
  fireEvent.click(screen.getByText('Review Changes'));
  expect(screen.queryByText(/backup.json|Exported/)).toBeNull();
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Work History' }));
  expect(screen.getByRole('group', { name: 'Career Summary' })).toBeTruthy();
  expect(screen.getByRole('group', { name: 'Notice Period' })).toBeTruthy();
  fireEvent.click(screen.getByText('Clear Selection'));
  expect((importSelected() as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Personal' }));
  fireEvent.click(
    within(screen.getByRole('group', { name: 'First Name' })).getByRole('radio', {
      name: /^Imported/,
    }),
  );
  fireEvent.click(importSelected());
  await screen.findByText('Profile imported successfully');
  const saved = await getProfile();
  expect(saved?.personal.firstName).toBe('Alex Imported');
  expect(saved?.personal.nickname).toBeUndefined();
  expect(saved?.professional.summary).toBe(baseProfile().professional.summary);
  expect(saved?.professional.noticePeriod?.value).toBe(2);
  await waitFor(() => expect(document.activeElement).toBe(screen.getByText('Choose File')));
});

it('preserves review choices after Back then Review', async () => {
  await mountBase();
  upload(incomingProfile());
  fireEvent.click(await screen.findByText('Review Changes'));
  fireEvent.click(screen.getByText('Clear Selection'));
  fireEvent.click(
    within(screen.getByRole('group', { name: 'First Name' })).getByRole('radio', {
      name: /^Imported/,
    }),
  );
  fireEvent.click(screen.getByText('Back'));
  fireEvent.click(screen.getByText('Review Changes'));
  expect(screen.getByText('1 of 4 selected')).toBeTruthy();
  expect(
    (
      within(screen.getByRole('group', { name: 'First Name' })).getByRole('radio', {
        name: /^Imported/,
      }) as HTMLInputElement
    ).checked,
  ).toBe(true);
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Work History' }));
  expect(
    (
      within(screen.getByRole('group', { name: 'Notice Period' })).getByRole('radio', {
        name: /^Keep Current/,
      }) as HTMLInputElement
    ).checked,
  ).toBe(true);
});

it('Import All applies every update even after the review draft was cleared', async () => {
  await mountBase();
  upload(incomingProfile());
  fireEvent.click(await screen.findByText('Review Changes'));
  fireEvent.click(screen.getByText('Clear Selection'));
  fireEvent.click(screen.getByText('Back'));
  fireEvent.click(screen.getByText('Import All'));
  await screen.findByText('Profile imported successfully');
  expect((await getProfile())?.personal.firstName).toBe('Alex Imported');
  expect((await getProfile())?.personal.nickname).toBe('Lex Imported');
  expect((await getProfile())?.professional.noticePeriod?.value).toBe(6);
});

it('offers explicit choices for a mappings/history-only import', async () => {
  await mountBase();
  upload(baseProfile(), {
    learnedMappings: { 'new.example': { surname: 'personal.lastName' } },
    applicationHistory: SETTINGS_REVIEW_HISTORY,
  });
  fireEvent.click(await screen.findByText('Review Changes'));
  fireEvent.click(screen.getByText('Clear Selection'));
  fireEvent.click(
    within(screen.getByRole('group', { name: 'Learned Mappings' })).getByRole('checkbox'),
  );
  fireEvent.click(importSelected());
  await screen.findByText('Profile imported successfully');
  expect(await getLearnedMappings()).toEqual({ 'new.example': { surname: 'personal.lastName' } });
  expect(await getApplicationHistory()).toEqual([]);
});

it('does not erase application history when a backup contains an empty list', async () => {
  await mountBase();
  await saveApplicationHistory(SETTINGS_REVIEW_HISTORY);
  const profile = baseProfile();
  profile.personal.firstName = 'Alex Imported';
  upload(profile, { applicationHistory: [] });
  fireEvent.click(await screen.findByText('Import All'));
  await screen.findByText('Profile imported successfully');
  expect((await getProfile())?.personal.firstName).toBe('Alex Imported');
  expect(await getApplicationHistory()).toEqual(SETTINGS_REVIEW_HISTORY);
});

it('rejects invalid profile roots without reporting success or writing a profile', async () => {
  vi.stubGlobal('chrome', createPreviewChrome({ id: 'empty-import-test' }));
  render(
    <ToastProvider>
      <App />
    </ToastProvider>,
  );
  await screen.findByText('Choose File');
  upload(null);
  await screen.findByText('This file does not contain a valid profile.');
  expect(await getProfile()).toEqual({ id: 'empty-import-test' });
  expect(screen.queryByText('Profile imported successfully')).toBeNull();
});

it('shows skipped fields before importing a partly invalid backup into an empty profile', async () => {
  vi.stubGlobal('chrome', createPreviewChrome({ id: 'empty-import-test' }));
  render(
    <ToastProvider>
      <App />
    </ToastProvider>,
  );
  await screen.findByText('Choose File');
  const profile = incomingProfile();
  profile.personal.email = 'invalid-email';
  upload(profile);
  expect(await screen.findByText('1 invalid item will be skipped')).toBeTruthy();
  expect(await getProfile()).toEqual({ id: 'empty-import-test' });
  fireEvent.click(screen.getByText('Import All'));
  await screen.findByText('Profile imported successfully (1 item skipped)');
  expect((await getProfile())?.personal.firstName).toBe('Alex Imported');
  expect((await getProfile())?.personal.email).toBeUndefined();
});

it('exposes details behind changed visa, work, education, and document values', () => {
  const profile = baseProfile();
  const incoming = structuredClone(profile);
  incoming.workAuthorization[0].expiryDate = '2030-06-30';
  incoming.workHistory[0].description = 'Different description';
  incoming.education[0].grade = '4.0 GPA';
  incoming.documents.cv.file!.base64 += 'different';
  const changes = generateDiff(profile, incoming);
  expect(changes.find((c) => c.id === 'workAuthorization')?.displaySuggested).toContain(
    '2030-06-30',
  );
  expect(changes.find((c) => c.id === 'workHistory')?.displaySuggested).toContain(
    'Different description',
  );
  expect(changes.find((c) => c.id === 'education')?.displaySuggested).toContain('4.0 GPA');
  expect(changes.find((c) => c.id === 'documents.cv.file')?.note).toBe('File contents differ.');
});

it('does not confuse reordered object properties with changed values', () => {
  const profile = baseProfile();
  const sanitized = validateImportedProfile(profile).sanitized;
  expect(sanitized).toEqual(profile);
  expect(generateDiff(profile, sanitized).every((c) => c.status === 'unchanged')).toBe(true);
});

it('shows Done for identical profile data and keeps the stored profile', async () => {
  await mountBase();
  upload(baseProfile());
  await screen.findByRole('dialog', { name: 'No Changes Found' });
  expect(screen.queryByText('Import All')).toBeNull();
  fireEvent.click(screen.getByText('Done'));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(screen.getByText('Choose File'));
  expect((await getProfile())?.personal.firstName).toBe('Alex');
});

it.each(['Escape', 'backdrop'])(
  'dismisses the shared Drive summary via %s without uploading local data',
  async (action) => {
    vi.spyOn(previewDrive, 'isDriveConfigured').mockReturnValue(true);
    vi.spyOn(previewDrive, 'connectDrive').mockResolvedValue({
      token: 'synthetic-token',
      fileId: 'synthetic-id',
      backup: {
        profile: incomingProfile(),
        learnedMappings: {},
        lastModified: '2026-10-29T12:00:00Z',
      },
    });
    const uploadLocal = vi.spyOn(previewDrive, 'overwriteDriveWithLocal');
    await mountBase();
    fireEvent.click(screen.getByText('Connect Google Drive'));
    const dialog = await screen.findByRole('dialog', { name: 'Restore Drive Backup' });
    if (action === 'Escape') fireEvent.keyDown(window, { key: 'Escape' });
    else fireEvent.click(dialog.parentElement!);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(uploadLocal).not.toHaveBeenCalled();
  },
);

it('preserves unrelated profile edits made while the import review is open', async () => {
  await mountBase();
  const incoming = baseProfile();
  incoming.personal.firstName = 'Alex Imported';
  upload(incoming);
  fireEvent.click(await screen.findByText('Review Changes'));
  const latest = baseProfile();
  latest.links.portfolio = 'https://example.com/new-portfolio';
  await saveProfile(latest);
  fireEvent.click(importSelected());
  await screen.findByText('Profile imported successfully');
  expect((await getProfile())?.personal.firstName).toBe('Alex Imported');
  expect((await getProfile())?.links.portfolio).toBe('https://example.com/new-portfolio');
});
