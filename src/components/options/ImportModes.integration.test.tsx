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
  getApplicationHistory,
  saveApplicationHistory,
  saveProfile,
} from '@/src/utils/storage';
import { DevSimulation } from '@/src/devtools/simulation';
import { scenarioById } from '@/src/devtools/scenarios';
import { DEFAULT_GEMINI_MODEL } from '@/src/resume-ai/types';
import { extractFromResume } from '@/src/resume-ai/gemini';

vi.mock('@/src/resume-ai/gemini', () => ({ extractFromResume: vi.fn(), validateApiKey: vi.fn() }));
vi.mock('@/src/resume-ai/extractLinks', () => ({ extractLinks: vi.fn().mockResolvedValue([]) }));
let simulation: DevSimulation | undefined;
beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 0),
  );
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
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
  simulation = new DevSimulation(scenarioById('drive-different')!, 'test-extension', '1.0');
  simulation.backup!.profile = profile;
  vi.stubGlobal('chrome', simulation.chrome);
  vi.stubGlobal('fetch', simulation.fetch.bind(simulation));
  vi.stubGlobal('__JB_DEV_CONTEXT__', {
    scenario: 'drive-different',
    id: 'drive-import-test',
    extensionId: 'test-extension',
    version: '1.0',
  });
  return simulation;
}
it('Drive person mismatch can be cancelled without uploading or changing either profile', async () => {
  const remote = setupDrive();
  const before = structuredClone(remote.backup);
  mount();
  fireEvent.click(await screen.findByText('Connect Google Drive'));
  await screen.findByText('This may be another person’s profile');
  expect((screen.getByRole('button', { name: 'Restore All' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect((await getProfile())?.personal.email).toBe(DEV_PROFILE.personal.email);
  expect(remote.backup).toEqual(before);
  expect((await getDriveBackupState()).reviewRequired).toBe(true);
});
it('Drive replacement adopts only the incoming person and clears unrelated local history', async () => {
  const remote = setupDrive();
  await saveApplicationHistory([
    {
      id: 'old',
      company: 'Old',
      jobTitle: 'Old',
      url: 'https://old.example',
      appliedAt: '2026-01-01',
      status: 'applied',
    },
  ]);
  mount();
  fireEvent.click(await screen.findByText('Connect Google Drive'));
  await screen.findByText('This may be another person’s profile');
  fireEvent.click(screen.getByRole('radio', { name: /Replace current profile/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Replace Profile' }));
  await waitFor(async () => expect((await getProfile())?.personal.email).toBe('sam@example.com'));
  expect((await getProfile())?.address).toBeUndefined();
  expect(await getApplicationHistory()).toEqual([]);
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
    await screen.findByText('Review Resume');
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
  '%s saves only the selected education, work, and language entries',
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
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review Changes' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Languages' }));
    expect(
      (screen.getByRole('checkbox', { name: 'Import Burmese' }) as HTMLInputElement).checked,
    ).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /^(Import|Restore) Selected/ }));
    await waitFor(async () => expect((await getProfile())?.education).toHaveLength(2));
    const saved = (await getProfile())!;
    expect(saved.education.map((row) => row.institution)).toEqual(['School A', 'School C']);
    expect(saved.workHistory.map((row) => row.company)).toEqual(['Company A', 'Company C']);
    expect(saved.languages).toEqual([data.languages[0]]);
  },
);
