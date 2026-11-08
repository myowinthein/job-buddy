// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from '@/entrypoints/options/App';
import { ToastProvider } from '@/src/components/ui/Toast';
import { createPreviewChrome } from '@/src/preview/chrome';
import { DEV_PROFILE } from '@/src/utils/devProfile';
import {
  getProfile,
  getDriveBackupState,
  saveProfile,
  getLearnedMappings,
} from '@/src/utils/storage';
import { IntegrationSimulation as DevSimulation } from '@/src/testing/integrationSimulation';
import { DEFAULT_GEMINI_MODEL } from '@/src/resume-ai/types';
import { extractFromResume } from '@/src/resume-ai/gemini';
import { stubJsdomLayout } from '@/src/testing/jsdomLayout';

vi.mock('@/src/resume-ai/gemini', () => ({ extractFromResume: vi.fn(), validateApiKey: vi.fn() }));
vi.mock('@/src/resume-ai/validateResumeFile', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/src/resume-ai/validateResumeFile')>()),
  validateResumeFile: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/src/resume-ai/extractLinks', () => ({ extractLinks: vi.fn().mockResolvedValue([]) }));
let simulation: DevSimulation | undefined;
beforeEach(() => {
  sessionStorage.clear();
  stubJsdomLayout();
});
afterEach(async () => {
  cleanup();
  simulation?.dispose();
  simulation = undefined;
  await act(async () => {
    await Promise.resolve();
  });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const mount = () =>
  render(
    <ToastProvider>
      <App />
    </ToastProvider>,
  );
const incoming = () => ({
  personal: {
    ...DEV_PROFILE.personal,
    firstName: 'Sam',
    lastName: 'Lee',
    email: 'sam@example.com',
  },
  workHistory: [
    { company: 'Sam Company', title: 'Engineer', startDate: '2020-01', isCurrent: true },
  ],
});

it.each(['update', 'replace'] as const)(
  'resume %s uses the right base instead of mixing ownership silently',
  async (mode) => {
    sessionStorage.setItem('jb:ui:section', 'resume');
    vi.stubGlobal(
      'chrome',
      createPreviewChrome(DEV_PROFILE, undefined, {
        initialData: {
          geminiApiKey: 'test-key',
          geminiModel: DEFAULT_GEMINI_MODEL,
          geminiDevDisabled: true,
        },
      }),
    );
    vi.mocked(extractFromResume).mockResolvedValue(incoming());
    mount();
    await screen.findByText(/Drop your resume here/);
    fireEvent.change(document.querySelector('input[type="file"]')!, {
      target: { files: [new File(['%PDF-test'], 'sam.pdf', { type: 'application/pdf' })] },
    });
    fireEvent.click(screen.getByText('Analyze Resume'));
    await screen.findByText('This may be another person’s profile');
    expect((screen.getByRole('button', { name: 'Import All' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.click(
      screen.getByRole('radio', {
        name: mode === 'replace' ? /Replace current profile/ : /Update current profile/,
      }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: mode === 'replace' ? 'Replace Profile' : 'Import All' }),
    );
    await screen.findByText('Import Complete');
    const saved = (await getProfile())!;
    expect(saved.personal.email).toBe('sam@example.com');
    expect(saved.documents.cv.file?.name).toBe('sam.pdf');
    if (mode === 'replace') {
      expect(saved.id).not.toBe(DEV_PROFILE.id);
      expect(saved.address).toBeUndefined();
      expect(saved.workHistory).toHaveLength(1);
      expect(saved.documents.cv.url).toBeUndefined();
    } else {
      expect(saved.id).toBe(DEV_PROFILE.id);
      expect(saved.workHistory).toHaveLength(DEV_PROFILE.workHistory.length + 1);
      expect(saved.address).toEqual(DEV_PROFILE.address);
    }
  },
);

function setupDrive(profile = incoming() as typeof DEV_PROFILE) {
  sessionStorage.setItem('jb:ui:section', 'settings');
  simulation = new DevSimulation('drive-different', 'test-extension', '1.0');
  simulation.backup!.profile = profile;
  vi.stubGlobal('chrome', simulation.chrome);
  vi.stubGlobal('fetch', simulation.fetch.bind(simulation));
  vi.stubGlobal('__JB_DEV_CONTEXT__', {
    id: 'drive-import-test',
    extensionId: 'test-extension',
    version: '1.0',
  });
  return simulation;
}

it.each(['conflict', 'newer-count', 'local-only'] as const)(
  'reconciles %s learned mappings before Drive reports an unchanged profile current', async difference => {
    const remote = setupDrive(DEV_PROFILE);
    const local = { 'example.test': { name: { path: 'personal.firstName', count: 3 } } };
    remote.backup!.learnedMappings = difference === 'local-only' ? {} : {
      'example.test': { name: { path: difference === 'conflict' ? 'personal.lastName' : 'personal.firstName', count: 1 } },
    };
    await new Promise<void>(resolve => remote.chrome.storage.local.set({ learnedMappings: local }, resolve));
    mount();
    fireEvent.click(await screen.findByText('Connect Google Drive'));
    await waitFor(() => expect(remote.backup!.learnedMappings).toEqual(local));
    expect(await getLearnedMappings()).toEqual(local);
    expect((await getDriveBackupState()).reviewRequired).toBe(false);
  },
);

it('JSON review respects mapping deletions made in another tab before Import All', async () => {
  sessionStorage.setItem('jb:ui:section', 'settings');
  const local = { 'local.test': { name: 'personal.firstName' } };
  const incomingMappings = { 'new.test': { email: { path: 'personal.email', count: 1 } } };
  const preview = createPreviewChrome(DEV_PROFILE, undefined, { initialData: { learnedMappings: local } });
  vi.stubGlobal('chrome', preview);
  mount();
  await screen.findByText('Choose File');
  fireEvent.change(document.querySelector('input[accept=".json"]')!, { target: { files: [
    new File([JSON.stringify({ profile: DEV_PROFILE, learnedMappings: incomingMappings })], 'mappings.json', { type: 'application/json' }),
  ] } });
  const submit = await screen.findByRole('button', { name: 'Import All' });
  await new Promise<void>(resolve => preview.storage.local.set({ learnedMappings: {} }, resolve));
  fireEvent.click(submit);
  await screen.findByText('Profile imported successfully');
  expect(await getLearnedMappings()).toEqual(incomingMappings);
});

it('Drive Update keeps concurrent local corrections and uploads the final merged mappings', async () => {
  const remote = setupDrive({ ...DEV_PROFILE, professional: { ...DEV_PROFILE.professional, summary: 'Updated summary' } });
  const local = { 'local.test': { name: { path: 'personal.firstName', count: 2 } } };
  const incomingMappings = { 'local.test': { name: { path: 'personal.lastName', count: 20 } }, 'new.test': { email: 'personal.email' } };
  remote.backup!.learnedMappings = incomingMappings;
  await new Promise<void>(resolve => remote.chrome.storage.local.set({ learnedMappings: local }, resolve));
  mount();
  fireEvent.click(await screen.findByText('Connect Google Drive'));
  const restore = await screen.findByRole('button', { name: 'Restore All' });
  const fresh = { 'local.test': { name: { path: 'personal.email', count: 2 } } };
  await new Promise<void>(resolve => remote.chrome.storage.local.set({ learnedMappings: fresh }, resolve));
  fireEvent.click(restore);
  await screen.findByText('Profile restored from Google Drive.');
  const merged = { ...fresh, 'new.test': incomingMappings['new.test'] };
  expect(await getLearnedMappings()).toEqual(merged);
  await waitFor(() => expect(remote.backup!.learnedMappings).toEqual(merged));
});

it.each(['json-update', 'json-replace', 'drive-empty', 'drive-replace'] as const)(
  '%s preserves mapping provenance when validation removes a raw entry', async flow => {
    const replace = flow.endsWith('replace');
    const profile = {
      ...DEV_PROFILE,
      personal: replace ? { ...DEV_PROFILE.personal, firstName: 'Sam', lastName: 'Lee', email: 'sam@example.com' } : DEV_PROFILE.personal,
      education: [
        { institution: 'Dropped school', degree: 123, fieldOfStudy: 'Design', startDate: '2010', endDate: '2014' },
        { institution: 'Kept school', degree: 'BSc', fieldOfStudy: 'Computing', startDate: '2015', endDate: '2019' },
      ],
    };
    const mappings = { 'example.test': {
      dropped: { path: 'education.0.institution', count: 2, scope: 'entry' as const },
      kept: { path: 'education.1.institution', count: 2, scope: 'entry' as const },
    } };
    if (flow.startsWith('drive')) {
      const remote = setupDrive(profile as unknown as typeof DEV_PROFILE);
      remote.backup!.learnedMappings = mappings;
      if (flow === 'drive-empty') await saveProfile({ id: 'empty' } as typeof DEV_PROFILE);
    } else {
      sessionStorage.setItem('jb:ui:section', 'settings');
      vi.stubGlobal('chrome', createPreviewChrome(DEV_PROFILE, undefined, { initialData: { learnedMappings: {} } }));
    }
    mount();
    if (flow.startsWith('drive')) fireEvent.click(await screen.findByText('Connect Google Drive'));
    else {
      await screen.findByText('Choose File');
      fireEvent.change(document.querySelector('input[accept=".json"]')!, { target: { files: [
        new File([JSON.stringify({ profile, learnedMappings: mappings })], 'validated.json', { type: 'application/json' }),
      ] } });
    }
    if (replace) fireEvent.click(await screen.findByRole('radio', { name: /Replace current profile/ }));
    fireEvent.click(await screen.findByRole('button', { name: replace ? 'Replace Profile' : flow.startsWith('drive') ? 'Restore All' : 'Import All' }));
    await waitFor(async () => expect((await getLearnedMappings())['example.test']?.kept).toMatchObject({ path: 'education.0.institution' }));
    expect((await getLearnedMappings())['example.test'].dropped).toMatchObject({ inactive: true });
    expect((await getProfile())?.education.map(row => row.institution)).toEqual(['Kept school']);
  },
);
it('Drive person mismatch can be cancelled without uploading or changing either profile', async () => {
  const remote = setupDrive();
  const before = structuredClone(remote.backup);
  mount();
  fireEvent.click(await screen.findByText('Connect Google Drive'));
  await screen.findByText('This may be another person’s profile');
  expect((screen.getByRole('button', { name: 'Restore All' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  const description = 'Restore this backup or upload your saved profile.';
  expect(screen.getByText(description)).toBeTruthy();
  fireEvent.click(screen.getByRole('radio', { name: /Update current profile/ }));
  expect(screen.getByText(description)).toBeTruthy();
  fireEvent.click(screen.getByRole('radio', { name: /Replace current profile/ }));
  expect(screen.getByText(description)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect((await getProfile())?.personal.email).toBe(DEV_PROFILE.personal.email);
  expect(remote.backup).toEqual(before);
  expect((await getDriveBackupState()).reviewRequired).toBe(true);
});
it('Drive replacement adopts only the incoming person', async () => {
  const remote = setupDrive();
  mount();
  fireEvent.click(await screen.findByText('Connect Google Drive'));
  await screen.findByText('This may be another person’s profile');
  fireEvent.click(screen.getByRole('radio', { name: /Replace current profile/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Replace Profile' }));
  await waitFor(async () => expect((await getProfile())?.personal.email).toBe('sam@example.com'));
  expect((await getProfile())?.address).toBeUndefined();
  expect((await getDriveBackupState()).reviewRequired).toBe(false);
  expect(remote.backup?.profile.personal.email).toBe('sam@example.com');
});

it.each(['empty', 'matching'] as const)(
  'resume import skips the action choice for an %s profile',
  async (state) => {
    sessionStorage.setItem('jb:ui:section', 'resume');
    vi.stubGlobal(
      'chrome',
      createPreviewChrome(state === 'empty' ? { id: 'empty-resume' } : DEV_PROFILE, undefined, {
        initialData: {
          geminiApiKey: 'test-key',
          geminiModel: DEFAULT_GEMINI_MODEL,
          geminiDevDisabled: true,
        },
      }),
    );
    vi.mocked(extractFromResume).mockResolvedValue({
      ...incoming(),
      personal: DEV_PROFILE.personal,
    });
    mount();
    await screen.findByText(/Drop your resume here/);
    fireEvent.change(document.querySelector('input[type="file"]')!, {
      target: { files: [new File(['%PDF-test'], 'updated.pdf', { type: 'application/pdf' })] },
    });
    fireEvent.click(screen.getByText('Analyze Resume'));
    await screen.findByRole('heading', { name: 'Import Resume' });
    expect(screen.queryByText('Import action')).toBeNull();
    expect(screen.queryByRole('radio', { name: /^(Update|Replace) current profile/ })).toBeNull();
    expect((screen.getByRole('button', { name: 'Import All' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Import All' }));
    await screen.findByText('Import Complete');
    const saved = (await getProfile())!;
    expect(saved.personal.email).toBe(DEV_PROFILE.personal.email);
    expect(saved.workHistory).toHaveLength(
      state === 'empty' ? 1 : DEV_PROFILE.workHistory.length + 1,
    );
    expect(saved.address).toEqual(state === 'empty' ? undefined : DEV_PROFILE.address);
  },
);

it.each(['empty', 'matching'] as const)(
  'Drive import skips the action choice for an %s profile',
  async (state) => {
    setupDrive({
      ...DEV_PROFILE,
      professional: { ...DEV_PROFILE.professional, summary: 'Updated Drive summary' },
    });
    if (state === 'empty') await saveProfile({ id: 'empty-drive' } as typeof DEV_PROFILE);
    const before = (await getProfile())!;
    mount();
    fireEvent.click(await screen.findByText('Connect Google Drive'));
    await screen.findByRole('button', { name: 'Restore All' });
    expect(screen.queryByText('Import action')).toBeNull();
    expect(screen.queryByRole('radio', { name: /^(Update|Replace) current profile/ })).toBeNull();
    expect(
      (screen.getByRole('button', { name: 'Restore All' }) as HTMLButtonElement).disabled,
    ).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Restore All' }));
    await screen.findByText('Profile restored from Google Drive.');
    const saved = (await getProfile())!;
    expect(saved.professional.summary).toBe('Updated Drive summary');
    expect(saved.personal.email).toBe(DEV_PROFILE.personal.email);
    if (state === 'matching') expect(saved.id).toBe(before.id);
  },
);

it.each(['resume', 'json', 'drive'] as const)(
  '%s saves only the selected education, work, language, and custom link entries',
  async (source) => {
    const data = {
      personal: DEV_PROFILE.personal,
      workHistory: ['A', 'B', 'C'].map((company) => ({
        company: `Company ${company}`,
        title: 'Designer',
        startDate: '2024-01',
        isCurrent: true,
      })),
      education: ['A', 'B', 'C'].map((institution) => ({
        institution: `School ${institution}`,
        degree: 'BA',
        fieldOfStudy: 'Design',
        startDate: '2020',
        endDate: '2024',
      })),
      links: {
        linkedin: '',
        custom: ['A', 'B', 'C'].map((label) => ({
          label: `Link ${label}`,
          url: `https://example.com/${label.toLowerCase()}`,
        })),
      },
      languages: [
        { language: 'en', proficiency: 'full_professional' as const },
        { language: 'my', proficiency: 'native_bilingual' as const },
      ],
    };
    const base = {
      id: 'entry-choice-profile',
      personal: DEV_PROFILE.personal,
    } as typeof DEV_PROFILE;
    if (source === 'drive') {
      setupDrive(data as typeof DEV_PROFILE);
      await saveProfile(base);
    } else {
      sessionStorage.setItem('jb:ui:section', source === 'resume' ? 'resume' : 'settings');
      vi.stubGlobal(
        'chrome',
        createPreviewChrome(base, undefined, {
          initialData: {
            geminiApiKey: 'test-key',
            geminiModel: DEFAULT_GEMINI_MODEL,
            geminiDevDisabled: true,
          },
        }),
      );
    }
    vi.mocked(extractFromResume).mockResolvedValue(data);
    mount();
    if (source === 'drive') fireEvent.click(await screen.findByText('Connect Google Drive'));
    else {
      if (source === 'resume') await screen.findByText(/Drop your resume here/);
      else await screen.findByText('Choose File');
      fireEvent.change(document.querySelector('input[type="file"]')!, {
        target: {
          files: [
            source === 'resume'
              ? new File(['%PDF-test'], 'selected.pdf', { type: 'application/pdf' })
              : new File([JSON.stringify({ profile: data })], 'selected.json', {
                  type: 'application/json',
                }),
          ],
        },
      });
      if (source === 'resume') fireEvent.click(screen.getByText('Analyze Resume'));
    }
    fireEvent.click(await screen.findByRole('button', { name: 'Review Changes' }));
    const workSection = within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Work History',
    });
    if (workSection.getAttribute('aria-expanded') !== 'true') fireEvent.click(workSection);
    fireEvent.click(screen.getByRole('button', { name: 'Next entry' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Import Company B' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Education' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next entry' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Import School B' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Languages' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Import Burmese' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Links' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Import Link B' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review Changes' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Languages' }));
    expect(
      (screen.getByRole('checkbox', { name: 'Import Burmese' }) as HTMLInputElement).checked,
    ).toBe(false);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Links' }));
    expect(
      (screen.getByRole('checkbox', { name: 'Import Link B' }) as HTMLInputElement).checked,
    ).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /^(Import|Restore) Selected/ }));
    await waitFor(async () => expect((await getProfile())?.education).toHaveLength(2));
    const saved = (await getProfile())!;
    expect(saved.education.map((row) => row.institution)).toEqual(['School A', 'School C']);
    expect(saved.workHistory.map((row) => row.company)).toEqual(['Company A', 'Company C']);
    expect(saved.languages).toEqual([data.languages[0]]);
    expect(saved.links.custom).toEqual([data.links.custom[0], data.links.custom[2]]);
  },
);
