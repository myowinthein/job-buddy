// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  vi.useRealTimers();
});

async function openPersonal() {
  render(
    <ToastProvider>
      <App />
    </ToastProvider>,
  );
  return await screen.findByRole('textbox', { name: /First Name/ });
}

const categoryFocusCases: [string, string, (profile: Profile) => Profile][] = [
  ['Personal', 'field-firstName', (p) => ({ ...p, personal: { ...p.personal, email: '' } })],
  [
    'Address',
    'field-country',
    (p) => ({ ...p, address: { ...p.address, city: '', postalCode: '' } }),
  ],
  [
    'Work Authorization',
    'field-workAuthorization-0-country',
    (p) => ({
      ...p,
      workAuthorization: [...p.workAuthorization, { country: '', status: 'citizen_or_pr' }],
    }),
  ],
  [
    'Work History',
    'field-summary',
    (p) => ({ ...p, professional: { ...p.professional, noticePeriod: undefined } }),
  ],
  [
    'Education',
    'field-education-0-institution',
    (p) => ({ ...p, education: [...p.education, { ...p.education[0], institution: '' }] }),
  ],
  [
    'Languages',
    'field-languages-0-language',
    (p) => ({
      ...p,
      languages: [...p.languages, { language: '', proficiency: 'full_professional' }],
    }),
  ],
  ['Links', 'field-linkedin', (p) => ({ ...p, links: { linkedin: '', custom: [] } })],
  ['Documents', 'field-cv', (p) => ({ ...p, documents: { cv: {} } })],
  ['Salary', 'field-currentAmount', (p) => ({ ...p, salary: { ...p.salary, expected: [] } })],
];

it.each(categoryFocusCases)(
  'focuses the first field from the %s completion category, including populated fields and dropdowns',
  async (label, target, prepare) => {
    await saveProfile(prepare((await getProfile())!));
    await openPersonal();
    fireEvent.click(screen.getByRole('button', { name: /required remaining|more details/i }));
    const popup = screen.getByRole('region', { name: /Missing details|More details/ });
    fireEvent.click(within(popup).getByRole('button', { name: label }));
    await waitFor(() => expect(document.activeElement?.id).toBe(target));
    expect(screen.queryByRole('region', { name: /Missing details|More details/ })).toBeNull();
    if (label === 'Education')
      expect(
        document
          .getElementById('entry-education-0')
          ?.querySelector('button')
          ?.getAttribute('aria-expanded'),
      ).toBe('true');
  },
);

it('focuses a missing field directly and returns to the first field when its category is clicked on the same section', async () => {
  const stored = (await getProfile())!;
  await saveProfile({ ...stored, address: { ...stored.address, city: '', postalCode: '' } });
  await openPersonal();
  fireEvent.click(screen.getByRole('button', { name: /required remaining/i }));
  fireEvent.click(
    within(screen.getByRole('region', { name: 'Missing details' })).getByRole('button', {
      name: 'City',
    }),
  );
  await waitFor(() => expect(document.activeElement?.id).toBe('field-city'));
  fireEvent.click(screen.getByRole('button', { name: /required remaining/i }));
  fireEvent.click(
    within(screen.getByRole('region', { name: 'Missing details' })).getByRole('button', {
      name: 'Address',
    }),
  );
  await waitFor(() => expect(document.activeElement?.id).toBe('field-country'));
});

it('opens Background details on the first click when phone blur adds a validation error', async () => {
  const stored = (await getProfile())!;
  await saveProfile({
    ...stored,
    personal: { ...stored.personal, phone: { countryCode: 'US', callingCode: '+1', number: '' } },
  });
  await openPersonal();
  const phone = screen.getByRole('textbox', { name: 'Phone number' });
  act(() => phone.focus());
  const summary = screen.getByText('Background details');
  expect(fireEvent.mouseDown(summary)).toBe(false);
  expect(document.activeElement).toBe(phone);
  fireEvent.click(summary);
  expect(screen.getByText('Phone number is required')).toBeTruthy();
  expect(summary.closest('details')?.open).toBe(true);
  expect(document.activeElement).toBe(summary);
});

it('protects partial date inputs even when the section value is still empty', async () => {
  const stored = (await getProfile())!;
  await saveProfile({ ...stored, workHistory: [] });
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  await openPersonal();
  fireEvent.click(screen.getByRole('button', { name: 'Work History' }));
  const month = screen.getAllByLabelText('Month')[0];
  act(() => month.focus());
  fireEvent.change(month, { target: { value: '06' } });
  expect(screen.queryByText('Unsaved changes')).toBeNull();
  fireEvent.blur(month);
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
  act(() => name.focus());
  fireEvent.change(name, { target: { value: 'Draft Jane' } });
  expect(screen.queryByText('Unsaved changes')).toBeNull();
  expect(
    (screen.getByRole('button', { name: 'Save Personal' }) as HTMLButtonElement).disabled,
  ).toBe(false);
  const closing = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(closing);
  expect(closing.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Address' }));
  expect(confirm).toHaveBeenCalledTimes(1);
  expect((name as HTMLInputElement).value).toBe('Draft Jane');
  expect(screen.getByRole('heading', { name: 'Personal' })).toBeTruthy();
  fireEvent.blur(name);
  expect(screen.getByText('Unsaved changes').closest('main')).not.toBeNull();
  expect(
    screen.getByText('Unsaved changes').parentElement?.contains(screen.getByText('Save Personal')),
  ).toBe(true);

  fireEvent.click(screen.getByText('Save Personal'));
  await screen.findByText('Saved');
  expect(screen.queryByText('Unsaved changes')).toBeNull();
  expect((await getProfile())?.personal.firstName).toBe('Draft Jane');
  const savedClosing = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(savedClosing);
  expect(savedClosing.defaultPrevented).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Address' }));
  expect(screen.getByRole('heading', { name: 'Address' })).toBeTruthy();
  expect(confirm).toHaveBeenCalledTimes(1);
});

it('keeps save feedback quiet during editing and clears the saved message after a short time', async () => {
  const name = await openPersonal();
  act(() => name.focus());
  fireEvent.blur(name);
  expect(screen.queryByText('Unsaved changes')).toBeNull();
  vi.useFakeTimers();
  fireEvent.change(name, { target: { value: 'Saved Jane' } });
  fireEvent.click(screen.getByText('Save Personal'));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(screen.getByText('Saved')).toBeTruthy();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(screen.queryByText('Saved')).toBeNull();
});

it('hides saved feedback as soon as another edit begins and waits for blur again', async () => {
  const name = await openPersonal();
  fireEvent.change(name, { target: { value: 'First edit' } });
  fireEvent.click(screen.getByText('Save Personal'));
  await screen.findByText('Saved');
  act(() => name.focus());
  fireEvent.change(name, { target: { value: 'Second edit' } });
  expect(screen.queryByText('Saved')).toBeNull();
  expect(screen.queryByText('Unsaved changes')).toBeNull();
  fireEvent.blur(name);
  expect(screen.getByText('Unsaved changes')).toBeTruthy();
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
  fireEvent.click(screen.getByText('Save Personal'));
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
  fireEvent.click(screen.getByText('Save Personal'));
  await screen.findByText('Saved');
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
  act(() => name.focus());
  fireEvent.change(name, { target: { value: 'Cannot save' } });
  fireEvent.blur(name);
  fireEvent.click(screen.getByText('Save Personal'));
  await screen.findByText('Failed to save: storage may be full.');
  expect(screen.getByText('Unsaved changes')).toBeTruthy();
  expect(screen.queryByText('Saved')).toBeNull();
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
    'At least one valid entry',
    'field-workAuthorization-0-status',
    (p: Profile) => {
      p.workAuthorization[0].status = '' as Profile['workAuthorization'][0]['status'];
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
  expect(progress.getAttribute('aria-valuenow')).toBe('90');
  fireEvent.click(screen.getByRole('button', { name: /required remaining/ }));
  fireEvent.click(screen.getByRole('button', { name: label }));
  await waitFor(() => expect(document.activeElement?.id).toBe(id));
  expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('90');
});

it('reveals and focuses an optional field in a later collapsed entry', async () => {
  const profile = (await getProfile())!;
  profile.workHistory = [
    profile.workHistory[0],
    { ...profile.workHistory[0], location: undefined },
  ];
  await saveProfile(profile);
  await openPersonal();
  fireEvent.click(screen.getByRole('button', { name: /more details/i }));
  fireEvent.click(screen.getByRole('button', { name: 'Location' }));
  await waitFor(() => expect(document.activeElement?.id).toBe('field-workHistory-1-location'));
});

it('updates required progress only after a successful section save', async () => {
  const profile = (await getProfile())!;
  profile.personal.firstName = '';
  await saveProfile(profile);
  const name = await openPersonal();
  fireEvent.change(name, { target: { value: 'Jane' } });
  expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('90');
  fireEvent.click(screen.getByText('Save Personal'));
  await waitFor(() =>
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100'),
  );
  expect(screen.queryByRole('button', { name: /required remaining/ })).toBeNull();
});

it('does not resurrect an old person’s editor data after another tab replaces the profile', async () => {
  const name = await openPersonal();
  const current = (await getProfile())!;
  const replacement = {
    ...current,
    id: 'replacement-person',
    personal: { ...current.personal, firstName: 'Sam', email: 'sam@example.com' },
  };
  await saveProfile(replacement);
  fireEvent.change(name, { target: { value: 'Old draft' } });
  fireEvent.blur(name);
  fireEvent.click(screen.getByText('Save Personal'));
  await screen.findByText('Your profile was replaced in another tab. Reload before saving.');
  expect((await getProfile())?.personal.firstName).toBe('Sam');
  expect((await getProfile())?.id).toBe('replacement-person');
  expect(screen.queryByText('Saved')).toBeNull();
  expect(screen.getByText('Unsaved changes')).toBeTruthy();
});
