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
  saveProfile,
} from '@/src/utils/storage';
import { settingsReviewProfile } from '@/src/testing/settingsReviewFixture';
import { stubJsdomLayout } from '@/src/testing/jsdomLayout';

vi.mock('@/src/utils/driveSync', () => import('@/src/preview/driveSync'));
vi.mock('@/src/resume-ai/gemini', () => import('@/src/preview/gemini'));
vi.mock('./ResumeImportSection', () => ({ ResumeImportSection: () => null }));

beforeEach(() => {
  sessionStorage.clear();
  sessionStorage.setItem('jb:ui:section', 'settings');
  vi.stubGlobal('chrome', createPreviewChrome(settingsReviewProfile()));
  vi.stubEnv('VITE_GEMINI_API_KEY', undefined);
  stubJsdomLayout();
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
  expect(screen.queryByText('Import action')).toBeNull();
  expect(screen.queryByRole('radio', { name: /^(Update|Replace) current profile/ })).toBeNull();
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

it('offers explicit choices for a mappings-only import', async () => {
  await mountBase();
  upload(baseProfile(), {
    learnedMappings: { 'new.example': { surname: 'personal.lastName' } },
  });
  fireEvent.click(await screen.findByText('Review Changes'));
  fireEvent.click(screen.getByText('Clear Selection'));
  fireEvent.click(
    within(screen.getByRole('group', { name: 'Learned Mappings' })).getByRole('checkbox'),
  );
  fireEvent.click(importSelected());
  await screen.findByText('Profile imported successfully');
  expect(await getLearnedMappings()).toEqual({ 'new.example': { surname: 'personal.lastName' } });
});

it('ignores unsupported backup metadata without storing it', async () => {
  await mountBase();
  const profile = baseProfile();
  profile.personal.firstName = 'Alex Imported';
  upload(profile, { retiredFeatureData: [{ value: 'not-supported' }] });
  fireEvent.click(await screen.findByText('Import All'));
  await screen.findByText('Profile imported successfully');
  expect((await getProfile())?.personal.firstName).toBe('Alex Imported');
  expect(await new Promise((resolve) => chrome.storage.local.get('retiredFeatureData', resolve))).toEqual({});
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
  await screen.findByText('Select a valid Job Buddy export file.');
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
  expect(await screen.findByText('1 item will be skipped')).toBeTruthy();
  expect(screen.queryByText('Import action')).toBeNull();
  expect(screen.queryByRole('radio', { name: /^(Update|Replace) current profile/ })).toBeNull();
  expect(await getProfile()).toEqual({ id: 'empty-import-test' });
  fireEvent.click(screen.getByText('Import All'));
  await screen.findByText('Profile imported successfully');
  expect(screen.queryByText(/successfully.*skipped/)).toBeNull();
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

it('requires an owner decision, then replaces profile data without retaining the previous person’s details', async () => {
  const current = baseProfile();
  await mountBase(current);
  const incoming = {
    personal: { ...current.personal, firstName: 'Sam', lastName: 'Lee', email: 'sam@example.com' },
  };
  upload(incoming);
  await screen.findByText('This may be another person’s profile');
  expect((screen.getByRole('button', { name: 'Import All' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect(
    (screen.getByRole('button', { name: 'Review Changes' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect((await getProfile())?.id).toBe(current.id);
  fireEvent.click(screen.getByRole('radio', { name: /Replace current profile/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Review Changes' }));
  expect(screen.queryByRole('radio', { name: /Keep Current/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /^Replace Profile/ }));
  await waitFor(async () => expect((await getProfile())?.personal.email).toBe('sam@example.com'));
  const saved = (await getProfile())!;
  expect(saved.id).not.toBe(current.id);
  expect(saved.personal.phone).toEqual(current.personal.phone);
  expect(saved.address).toBeUndefined();
  expect(saved.documents).toBeUndefined();
  expect(saved.workHistory).toBeUndefined();
});

it('asks for review again if the profile changes while replacement is open', async () => {
  const current = baseProfile();
  await mountBase(current);
  upload({
    personal: { ...current.personal, firstName: 'Sam', lastName: 'Lee', email: 'sam@example.com' },
  });
  await screen.findByText('This may be another person’s profile');
  fireEvent.click(screen.getByRole('radio', { name: /Replace current profile/ }));
  await saveProfile({ ...current, address: { city: 'Concurrent city', country: 'US' } });
  fireEvent.click(screen.getByRole('button', { name: 'Replace Profile' }));
  await screen.findByText('Your profile changed in another tab. Review it or import the file again.');
  expect((await getProfile())?.address.city).toBe('Concurrent city');
  expect((await getProfile())?.personal.email).toBe(current.personal.email);
  expect((screen.getByRole('button', { name: 'Import All' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
});

it('imports valid JSON into an empty profile without asking for an import action', async () => {
  vi.stubGlobal('chrome', createPreviewChrome({ id: 'empty-import-test' }));
  render(
    <ToastProvider>
      <App />
    </ToastProvider>,
  );
  await screen.findByText('Choose File');
  upload(baseProfile());
  await screen.findByText('Profile imported successfully');
  expect(screen.queryByText('Import action')).toBeNull();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect((await getProfile())?.personal).toEqual(baseProfile().personal);
});
