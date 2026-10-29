// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from '@/entrypoints/options/App';
import { ToastProvider } from '@/src/components/ui/Toast';
import { createPreviewChrome } from '@/src/preview/chrome';
import { calculateDerivedFields } from '@/src/utils/derivedFields';
import {
  getProfile,
  getLearnedMappings,
  getApplicationHistory,
  saveProfile,
  saveLearnedMappings,
  saveApplicationHistory,
  saveGeminiApiKey,
  getGeminiApiKey,
} from '@/src/utils/storage';
import {
  settingsReviewProfile,
  SETTINGS_REVIEW_HISTORY,
  SETTINGS_REVIEW_MAPPINGS,
} from './settingsReviewFixture';

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

const value = (id: string) => (document.getElementById(id) as HTMLInputElement).value;
function dateValues(id: string) {
  return Array.from(
    document.getElementById(id)!.parentElement!.parentElement!.querySelectorAll('select, input'),
  ).map((input) => (input as HTMLInputElement).value);
}
function expandEntries() {
  screen.getAllByRole('button', { name: 'Expand' }).forEach((button) => fireEvent.click(button));
}

it('exports every saved field, resets immediately, and restores the downloaded JSON into all nine editors', async () => {
  const profile = settingsReviewProfile();
  profile.derived = calculateDerivedFields(profile);
  await saveProfile(profile);
  await saveLearnedMappings(SETTINGS_REVIEW_MAPPINGS);
  await saveApplicationHistory(SETTINGS_REVIEW_HISTORY);
  await saveGeminiApiKey('synthetic-key-not-exported');
  const createUrl = vi.fn((_blob: Blob) => 'blob:settings-review');
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = createUrl;
      static revokeObjectURL = vi.fn();
    },
  );
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  render(
    <ToastProvider>
      <App />
    </ToastProvider>,
  );
  fireEvent.click(await screen.findByText('Download File'));
  await waitFor(() => expect(createUrl).toHaveBeenCalledTimes(1));
  const json = await createUrl.mock.calls[0][0].text();
  const backup = JSON.parse(json);
  expect(backup.profile).toEqual(profile);
  expect(backup.learnedMappings).toEqual(SETTINGS_REVIEW_MAPPINGS);
  expect(backup.applicationHistory).toEqual(SETTINGS_REVIEW_HISTORY);
  expect(Object.keys(backup).sort()).toEqual([
    '_comment',
    'applicationHistory',
    'exportedAt',
    'learnedMappings',
    'profile',
    'profileId',
    'version',
  ]);
  expect(json).not.toContain('synthetic-key-not-exported');

  fireEvent.click(screen.getByText('Reset Now'));
  await screen.findByRole('dialog', { name: 'Reset All Data' });
  fireEvent.change(screen.getByPlaceholderText('DELETE'), { target: { value: 'DELETE' } });
  fireEvent.click(screen.getByRole('button', { name: 'Reset All Data' }));
  await screen.findByRole('heading', { name: 'Personal' });
  expect(value('field-firstName')).toBe('');
  expect(value('field-email')).toBe('');
  expect(await getProfile()).toBeNull();
  expect(await new Promise((resolve) => chrome.storage.local.get('profile', resolve))).toEqual({});
  expect(await getLearnedMappings()).toEqual({});
  expect(await getApplicationHistory()).toEqual([]);
  expect(await getGeminiApiKey()).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  const file = new File([json], 'downloaded-backup.json', { type: 'application/json' });
  fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });
  await screen.findByText('Profile imported successfully');
  await waitFor(async () => expect(await getProfile()).toEqual(profile));
  expect(await getLearnedMappings()).toEqual(SETTINGS_REVIEW_MAPPINGS);
  expect(await getApplicationHistory()).toEqual(SETTINGS_REVIEW_HISTORY);

  fireEvent.click(screen.getByRole('button', { name: 'Personal' }));
  for (const key of ['firstName', 'lastName', 'nickname', 'email'] as const)
    expect(value(`field-${key}`)).toBe(profile.personal[key]);
  expect(screen.getByLabelText('Phone number').getAttribute('value')).toBe(
    profile.personal.phone.number,
  );
  expect(screen.getByLabelText('Select country calling code').textContent).toContain('+66');
  fireEvent.click(screen.getByText('Background details'));
  expect(value('field-dateOfBirth')).toBe('15');
  expect((screen.getByLabelText('Month') as HTMLSelectElement).value).toBe('6');
  expect((screen.getByLabelText('Year') as HTMLInputElement).value).toBe('1992');
  for (const key of ['gender', 'ethnicity', 'veteranStatus', 'disabilityStatus'] as const)
    expect(value(`field-${key}`)).toBe(profile.personal[key]);

  fireEvent.click(screen.getByRole('button', { name: 'Address' }));
  for (const key of ['city', 'street', 'state', 'postalCode'] as const)
    expect(value(`field-${key}`)).toBe(profile.address[key]);
  expect(document.getElementById('field-country')!.textContent).toContain('United States');

  fireEvent.click(screen.getByRole('button', { name: 'Work Authorization' }));
  profile.workAuthorization.forEach((row, i) =>
    expect(value(`field-workAuthorization-${i}-status`)).toBe(row.status),
  );
  expect(document.getElementById('field-workAuthorization-0-country')!.textContent).toContain(
    'United States',
  );
  expect(document.getElementById('field-workAuthorization-1-country')!.textContent).toContain(
    'Singapore',
  );
  expect((screen.getByLabelText('Visa type') as HTMLInputElement).value).toBe('Sample visa');
  expect((screen.getByLabelText('Visa expiry date') as HTMLInputElement).value).toBe('2029-06-30');

  fireEvent.click(screen.getByRole('button', { name: 'Work History' }));
  expect(value('field-summary')).toBe(profile.professional.summary);
  expect((screen.getByLabelText('Available Later') as HTMLInputElement).checked).toBe(true);
  expect(value('field-noticeValue')).toBe('2');
  expect(screen.getByDisplayValue('months')).toBeTruthy();
  expandEntries();
  for (const row of profile.workHistory)
    for (const text of [row.company, row.title, row.description!, row.location!.city!])
      expect(screen.getAllByDisplayValue(text).length).toBeGreaterThan(0);
  expect(dateValues('field-workHistory-1-startDate')).toEqual(['07', '2018']);
  expect(dateValues('field-workHistory-1-endDate')).toEqual(['02', '2021']);
  profile.workHistory.forEach((row, i) => {
    const card = within(document.getElementById(`entry-workHistory-${i}`)!);
    expect(document.getElementById(`field-workHistory-${i}-location`)!.textContent).toContain(
      i === 0 ? 'United States' : 'Singapore',
    );
    expect(
      (card.getByLabelText(new RegExp(`^${row.arrangement}$`, 'i')) as HTMLInputElement).checked,
    ).toBe(true);
    expect((card.getByLabelText('I currently work here') as HTMLInputElement).checked).toBe(
      row.isCurrent,
    );
    expect(dateValues(`field-workHistory-${i}-startDate`)).toEqual(
      row.startDate.split('-').reverse(),
    );
  });

  fireEvent.click(screen.getByRole('button', { name: 'Education' }));
  expandEntries();
  screen.getAllByText('Grade and coursework').forEach((summary) => fireEvent.click(summary));
  for (const row of profile.education)
    for (const text of [
      row.institution,
      row.degree,
      row.fieldOfStudy,
      row.grade!,
      row.description!,
    ])
      expect(screen.getAllByDisplayValue(text).length).toBeGreaterThan(0);
  expect(dateValues('field-education-1-endDate')).toEqual(['06', '2028']);
  profile.education.forEach((row, i) => {
    const card = within(document.getElementById(`entry-education-${i}`)!);
    expect((card.getByLabelText(/currently studying here/) as HTMLInputElement).checked).toBe(
      row.isCurrent,
    );
    expect(dateValues(`field-education-${i}-startDate`)).toEqual(
      row.startDate.split('-').reverse(),
    );
    expect(dateValues(`field-education-${i}-endDate`)).toEqual(row.endDate!.split('-').reverse());
  });

  fireEvent.click(screen.getByRole('button', { name: 'Languages' }));
  profile.languages.forEach((row, i) =>
    expect(value(`field-languages-${i}-proficiency`)).toBe(row.proficiency),
  );
  expect(document.getElementById('field-languages-0-language')!.textContent).toContain('English');
  expect(document.getElementById('field-languages-1-language')!.textContent).toContain('Spanish');

  fireEvent.click(screen.getByRole('button', { name: 'Links' }));
  for (const key of ['linkedin', 'portfolio', 'github', 'twitter', 'dribbble', 'behance'] as const)
    expect(value(`field-${key}`)).toBe(profile.links[key]);
  for (const row of profile.links.custom!) {
    expect(screen.getByDisplayValue(row.label)).toBeTruthy();
    expect(screen.getByDisplayValue(row.url)).toBeTruthy();
  }

  fireEvent.click(screen.getByRole('button', { name: 'Documents' }));
  expect(value('field-cv')).toBe(profile.documents.cv.url);
  expect(screen.getByText('sample-cv.pdf')).toBeTruthy();
  fireEvent.click(screen.getByText(/Cover letter/, { selector: 'summary' }));
  expect(value('field-coverLetter')).toBe(profile.documents.coverLetter!.url);
  expect(screen.getByText('sample-cover.pdf')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Salary' }));
  expect(value('field-currentAmount')).toBe('90000');
  expect(document.getElementById('field-currentCurrency')!.textContent).toContain('USD');
  profile.salary.expected.forEach((row, i) => {
    expect(value(`field-expected-${i}-amount`)).toBe(String(row.amount));
    expect(document.getElementById(`field-expected-${i}-currency`)!.textContent).toContain(
      row.currency,
    );
  });
  expect(
    screen.getAllByRole('combobox').map((select) => (select as HTMLSelectElement).value),
  ).toEqual(['annual', 'monthly', 'annual']);
  expect(await getProfile()).toEqual(profile);
});
