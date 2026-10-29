// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Profile } from '@/src/types/profile';
import App from '@/entrypoints/options/App';
import { ToastProvider } from '@/src/components/ui/Toast';
import { createPreviewChrome } from '@/src/preview/chrome';
import { getProfile, saveProfile } from '@/src/utils/storage';

vi.mock('@/src/components/options/SettingsSection', () => ({ SettingsSection: () => null }));
vi.mock('@/src/components/options/ResumeImportSection', () => ({
  ResumeImportSection: () => null,
}));
vi.mock('@/src/components/options/LearnedMappingsSection', () => ({
  LearnedMappingsSection: () => null,
}));
vi.mock('@/src/utils/driveSync', () => ({
  syncProfileToDrive: vi.fn().mockResolvedValue({ success: true }),
}));

beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal('chrome', createPreviewChrome());
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
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function openPersonal() {
  render(
    <ToastProvider>
      <App />
    </ToastProvider>,
  );
  return await screen.findByRole('textbox', { name: /First Name/ });
}

it('protects partial date inputs even when the section value is still empty', async () => {
  const stored = (await getProfile())!;
  await saveProfile({ ...stored, workHistory: [] });
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  await openPersonal();
  fireEvent.click(screen.getByRole('button', { name: 'Work History' }));
  const month = screen.getAllByLabelText('Month')[0];
  fireEvent.change(month, { target: { value: '06' } });
  expect(screen.getByText('Unsaved changes')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Address' }));
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('heading', { name: 'Work History' })).toBeTruthy();
  fireEvent.change(month, { target: { value: '' } });
  expect(screen.queryByText('Unsaved changes')).toBeNull();
});

it('protects a draft on navigation and closing, then clears the guard after saving', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const name = await openPersonal();
  fireEvent.change(name, { target: { value: 'Draft Jane' } });
  expect(screen.getByText('Unsaved changes')).toBeTruthy();
  const closing = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(closing);
  expect(closing.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Address' }));
  expect(confirm).toHaveBeenCalledTimes(1);
  expect((name as HTMLInputElement).value).toBe('Draft Jane');
  expect(screen.getByRole('heading', { name: 'Personal Information' })).toBeTruthy();

  fireEvent.click(screen.getByText('Save Personal Information'));
  await waitFor(() => expect(screen.queryByText('Unsaved changes')).toBeNull());
  expect((await getProfile())?.personal.firstName).toBe('Draft Jane');
  const savedClosing = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(savedClosing);
  expect(savedClosing.defaultPrevented).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Address' }));
  expect(screen.getByRole('heading', { name: 'Address' })).toBeTruthy();
  expect(confirm).toHaveBeenCalledTimes(1);
});

it('discards a draft only after the user confirms leaving', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  fireEvent.change(await openPersonal(), { target: { value: 'Discarded' } });
  fireEvent.click(screen.getByRole('button', { name: 'Address' }));
  fireEvent.click(screen.getByRole('button', { name: 'Personal' }));
  expect((screen.getByRole('textbox', { name: /First Name/ }) as HTMLInputElement).value).toBe(
    'Jane',
  );
  expect(screen.queryByText('Unsaved changes')).toBeNull();
});

it('focuses the first invalid field and associates its error text', async () => {
  const name = await openPersonal();
  fireEvent.change(name, { target: { value: '' } });
  fireEvent.click(screen.getByText('Save Personal Information'));
  await waitFor(() => expect(document.activeElement).toBe(name));
  expect(name.getAttribute('aria-invalid')).toBe('true');
  const error = document.getElementById(name.getAttribute('aria-describedby')!);
  expect(error?.textContent).toBe('First name is required');
});

it('merges a section save with newer stored changes from another Options tab', async () => {
  const name = await openPersonal();
  const stored = (await getProfile())!;
  await saveProfile({ ...stored, address: { ...stored.address, city: 'Updated elsewhere' } });
  fireEvent.change(name, { target: { value: 'Local Jane' } });
  fireEvent.click(screen.getByText('Save Personal Information'));
  await waitFor(() => expect(screen.queryByText('Unsaved changes')).toBeNull());
  expect((await getProfile())?.address.city).toBe('Updated elsewhere');
  expect((await getProfile())?.personal.firstName).toBe('Local Jane');
});

it('retains the unsaved guard when local persistence fails', async () => {
  const preview = createPreviewChrome();
  vi.stubGlobal('chrome', preview);
  vi.spyOn(preview.storage.local, 'set').mockImplementation(() => {
    throw new Error('storage full');
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const name = await openPersonal();
  fireEvent.change(name, { target: { value: 'Cannot save' } });
  fireEvent.click(screen.getByText('Save Personal Information'));
  await screen.findByText('Failed to save: storage may be full.');
  expect(screen.getByText('Unsaved changes')).toBeTruthy();
  expect((await getProfile())?.personal.firstName).toBe('Jane');
});

it.each([
  [
    'Email',
    'field-email',
    (p: Profile) => {
      p.personal.email = 'invalid';
    },
  ],
  [
    'Current Salary Currency',
    'field-currentCountry',
    (p: Profile) => {
      p.salary.current.currency = '';
      delete p.salary.current.country;
    },
  ],
  [
    'At least one valid entry',
    'field-workAuthorization-0-status',
    (p: Profile) => {
      p.workAuthorization[0].status = '' as Profile['workAuthorization'][0]['status'];
    },
  ],
  [
    'At least one complete entry',
    'field-workHistory-0-endDate',
    (p: Profile) => {
      p.workHistory[0].isCurrent = false;
      delete p.workHistory[0].endDate;
    },
  ],
  [
    'At least one complete entry',
    'field-education-0-endDate',
    (p: Profile) => {
      p.education[0].isCurrent = false;
      delete p.education[0].endDate;
    },
  ],
  [
    'At least one language',
    'field-languages-0-language',
    (p: Profile) => {
      p.languages = [];
    },
  ],
  [
    'Notice Period',
    'field-noticePeriod',
    (p: Profile) => {
      delete p.professional.noticePeriod;
    },
  ],
  [
    'CV / Résumé',
    'field-cv',
    (p: Profile) => {
      p.documents.cv = {};
    },
  ],
] as const)('takes the required checklist item %s to input %s', async (label, id, change) => {
  const profile = (await getProfile())!;
  change(profile);
  await saveProfile(profile);
  await openPersonal();
  const progress = screen.getByRole('progressbar');
  expect(progress.getAttribute('aria-valuenow')).toBe('93');
  fireEvent.click(screen.getByRole('button', { name: /required remaining/ }));
  fireEvent.click(screen.getByRole('button', { name: label }));
  await waitFor(() => expect(document.activeElement?.id).toBe(id));
  expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('93');
});

it('reveals and focuses an optional field in a later collapsed entry', async () => {
  const profile = (await getProfile())!;
  profile.workHistory = [
    profile.workHistory[0],
    { ...profile.workHistory[0], location: undefined },
  ];
  await saveProfile(profile);
  await openPersonal();
  fireEvent.click(screen.getByRole('button', { name: /optional details/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Location' }));
  await waitFor(() => expect(document.activeElement?.id).toBe('field-workHistory-1-location'));
});

it('updates required progress only after a successful section save', async () => {
  const profile = (await getProfile())!;
  profile.personal.firstName = '';
  await saveProfile(profile);
  const name = await openPersonal();
  fireEvent.change(name, { target: { value: 'Jane' } });
  expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('93');
  fireEvent.click(screen.getByText('Save Personal Information'));
  await waitFor(() =>
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100'),
  );
  expect(screen.queryByRole('button', { name: /required remaining/ })).toBeNull();
});
