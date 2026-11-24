// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Profile } from '@/src/types/profile';
import App from '@/entrypoints/options/App';
import { ToastProvider } from '@/src/components/ui/Toast';
import { createPreviewChrome } from '@/src/preview/chrome';
import { getProfile, saveProfile } from '@/src/utils/storage';
import { stubJsdomLayout } from '@/src/testing/jsdomLayout';
import { feedback } from '@/src/ui/feedback';

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
  stubJsdomLayout();
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

it.each(['read', 'migration'] as const)(
  'preserves stored data after a profile %s failure and recovers it on Retry',
  async (failure) => {
    const saved = (await getProfile())!;
    if (failure === 'migration') saved.id = '';
    let blocked = true;
    const preview = createPreviewChrome(saved, undefined, {
      initialData: { learnedMappings: {}, untouched: 'keep this value' },
      failWrite: () => (failure === 'migration' && blocked ? 'synthetic write failure' : undefined),
    });
    vi.stubGlobal('chrome', preview);
    const originalGet = preview.storage.local.get;
    vi.spyOn(preview.storage.local, 'get').mockImplementation((key, callback) => {
      if (failure !== 'read' || key !== 'profile' || !blocked) return originalGet(key, callback);
      queueMicrotask(() => {
        preview.runtime.lastError = { message: 'synthetic read failure' };
        try {
          callback({});
        } finally {
          preview.runtime.lastError = undefined;
        }
      });
    });
    const readStored = () =>
      new Promise<Record<string, unknown>>((resolve) => {
        originalGet(null, resolve);
      });
    const before = await readStored();
    const remove = vi.spyOn(preview.storage.local, 'remove');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ToastProvider>
        <App />
      </ToastProvider>,
    );

    expect((await screen.findByRole('alert')).textContent).toContain(feedback.profileLoadFailed);
    expect(screen.queryByRole('textbox', { name: /First Name/ })).toBeNull();
    expect(await readStored()).toEqual(before);
    expect(remove).not.toHaveBeenCalled();

    blocked = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    const firstName = await screen.findByRole('textbox', { name: /First Name/ });
    expect((firstName as HTMLInputElement).value).toBe(saved.personal.firstName);
    expect(screen.queryByRole('alert')).toBeNull();
    const after = await readStored();
    expect((after.profile as Profile).personal).toEqual(saved.personal);
    expect((after.profile as Profile).documents).toEqual(saved.documents);
    expect(after.learnedMappings).toEqual(before.learnedMappings);
    expect(after.untouched).toBe(before.untouched);
    expect(remove).not.toHaveBeenCalled();
  },
);

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
  ['Salary', 'field-expected-0-amount', (p) => ({ ...p, salary: { ...p.salary, expected: [] } })],
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
    personal: {
      ...stored.personal,
      phone: { countryCode: 'US', callingCode: '+1', number: '' },
      dateOfBirth: '', gender: '', ethnicity: '', veteranStatus: '', disabilityStatus: '',
    },
  });
  await openPersonal();
  const phone = screen.getByRole('textbox', { name: 'Phone number' });
  act(() => phone.focus());
  const summary = screen.getByText('Background details').closest('summary')!;
  expect(fireEvent.mouseDown(summary)).toBe(false);
  expect(document.activeElement).toBe(phone);
  fireEvent.click(summary);
  expect(screen.getByText('Enter your phone number')).toBeTruthy();
  expect(summary.closest('details')?.open).toBe(true);
  expect(document.activeElement).toBe(summary);
});

it('protects partial dates and clears the navigation guard when a reused experience is empty', async () => {
  const stored = (await getProfile())!;
  await saveProfile({ ...stored, workHistory: [] });
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  await openPersonal();
  fireEvent.click(screen.getByRole('button', { name: 'Work History' }));
  fireEvent.click(screen.getByRole('button', { name: '+ Add Entry' }));
  const month = screen.getAllByLabelText('Month')[0];
  act(() => month.focus());
  fireEvent.change(month, { target: { value: '06' } });
  fireEvent.blur(month);
  expect(screen.getByText('Unsaved changes')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Address' }));
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('heading', { name: 'Work History' })).toBeTruthy();
  fireEvent.change(month, { target: { value: '' } });
  expect(screen.queryByText('Unsaved changes')).toBeNull();
  fireEvent.click(screen.getAllByRole('button', { name: 'Remove entry' }).at(-1)!);
  expect(screen.queryByText('Unsaved changes')).toBeNull();
});

it('protects a draft on navigation and closing, then clears the guard after saving', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const name = await openPersonal();
  act(() => name.focus());
  fireEvent.change(name, { target: { value: 'Draft Jane' } });
  expect(screen.queryByText('Unsaved changes')).toBeNull();
  expect(
    (screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled,
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
    screen.getByText('Unsaved changes').parentElement?.contains(screen.getByText('Save')),
  ).toBe(true);

  fireEvent.click(screen.getByText('Save'));
  await screen.findByText('Profile saved.');
  await waitFor(() => expect(screen.queryByText('Unsaved changes')).toBeNull());
  expect((await getProfile())?.personal.firstName).toBe('Draft Jane');
  await waitFor(() => {
    const savedClosing = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(savedClosing);
    expect(savedClosing.defaultPrevented).toBe(false);
  });
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
  fireEvent.click(screen.getByText('Save'));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(screen.queryByText('Saved')).toBeNull();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(screen.queryByText('Saved')).toBeNull();
});

it('hides saved feedback as soon as another edit begins and waits for blur again', async () => {
  const name = await openPersonal();
  fireEvent.change(name, { target: { value: 'First edit' } });
  fireEvent.click(screen.getByText('Save'));
  await screen.findByText('Profile saved.');
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
  fireEvent.click(screen.getByText('Save'));
  await waitFor(() => expect(document.activeElement).toBe(name));
  expect(name.getAttribute('aria-invalid')).toBe('true');
  const error = document.getElementById(name.getAttribute('aria-describedby')!);
  expect(error?.textContent).toBe('Enter your first name');
});

it('merges a section save with newer stored changes from another Options tab', async () => {
  const name = await openPersonal();
  const stored = (await getProfile())!;
  await saveProfile({ ...stored, address: { ...stored.address, city: 'Updated elsewhere' } });
  fireEvent.change(name, { target: { value: 'Local Jane' } });
  fireEvent.click(screen.getByText('Save'));
  await screen.findByText('Profile saved.');
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
  fireEvent.click(screen.getByText('Save'));
  await screen.findByText('Could not save your profile. Try again.');
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
  fireEvent.click(screen.getByText('Save'));
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
  fireEvent.change(name, { target: { value: 'Old draft' } });
  await act(async () => {
    await saveProfile(replacement);
  });
  expect((name as HTMLInputElement).value).toBe('Old draft');
  fireEvent.blur(name);
  fireEvent.click(screen.getByText('Save'));
  await screen.findByRole('heading', { name: 'Review Unsaved Changes' });
  expect((await getProfile())?.personal.firstName).toBe('Sam');
  expect((await getProfile())?.id).toBe('replacement-person');
  expect(screen.queryByText('Saved')).toBeNull();
  expect(screen.getByText('Unsaved changes')).toBeTruthy();
});

it('refreshes clean editors and completion after another tab changes the saved profile', async () => {
  const original = (await getProfile())!;
  await openPersonal();
  await act(async () => {
    await saveProfile({
      ...original,
      personal: { ...original.personal, firstName: 'Fresh name', email: '' },
    });
  });
  await waitFor(() =>
    expect((screen.getByRole('textbox', { name: /First Name/ }) as HTMLInputElement).value).toBe(
      'Fresh name',
    ),
  );
  expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('90');
  fireEvent.click(screen.getByRole('button', { name: 'Address' }));
  fireEvent.click(screen.getByRole('button', { name: 'Personal' }));
  expect((screen.getByRole('textbox', { name: /First Name/ }) as HTMLInputElement).value).toBe(
    'Fresh name',
  );
});

it('preserves a dirty draft and reviews a same-profile conflict without reverting untouched saved details', async () => {
  const original = (await getProfile())!;
  const name = await openPersonal();
  fireEvent.change(name, { target: { value: 'My draft' } });
  await act(async () => {
    await saveProfile({
      ...original,
      personal: { ...original.personal, nickname: 'Saved elsewhere' },
    });
  });
  expect((name as HTMLInputElement).value).toBe('My draft');
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByRole('heading', { name: 'Review Unsaved Changes' });
  expect((await getProfile())?.personal).toMatchObject({
    firstName: original.personal.firstName,
    nickname: 'Saved elsewhere',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Select All' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save Selected (1)' }));
  await waitFor(() =>
    expect(screen.queryByRole('heading', { name: 'Review Unsaved Changes' })).toBeNull(),
  );
  expect((await getProfile())?.personal).toMatchObject({
    firstName: 'My draft',
    nickname: 'Saved elsewhere',
  });
});
