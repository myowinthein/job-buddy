import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import type { LearnedMappings } from '../types/storage';
import type { Profile } from '../types/profile';
import { RULE_PROFILE } from '../autofill/ruleMatching.fixture';
import { settingsReviewProfile } from '../components/options/settingsReviewFixture';

const domain = '127.0.0.1';
const first = {
  path: 'personal.firstName',
  count: 2,
  label: 'Applicant response',
  question: 'Applicant response',
  scope: 'field' as const,
};
const mappings: LearnedMappings = {
  [domain]: {
    applicantresponse: first,
    q7: { ...first },
    city: {
      path: 'address.city',
      count: 1,
      label: 'City of residence',
      question: 'City of residence',
      scope: 'field',
    },
    inactive: {
      path: 'workHistory.9.company',
      count: 2,
      label: 'Current employer',
      question: 'Current employer',
      inactive: true,
    },
    linkedin: { path: 'links.linkedin', count: 2, label: 'LinkedIn URL', question: 'LinkedIn URL' },
    zschool: {
      path: 'education.1.institution',
      count: 2,
      label: 'Name of school',
      question: 'Name of school',
      scope: 'entry',
    },
  },
  'jobs.example.test': {
    email: { path: 'personal.email', count: 2, label: 'Email', question: 'Email' },
  },
};
async function show(options: Page) {
  await options.getByRole('button', { name: 'Learned Mappings', exact: true }).click();
  await expect(
    options.getByRole('heading', { name: 'Learned Mappings', exact: true }),
  ).toBeVisible();
  await options.getByRole('button', { name: /^127\.0\.0\.1/ }).click();
}
const row = (page: Page, title: string) => page.getByRole('group', { name: title, exact: true });

test('shows readable chooser previews and a persistent selected category across layouts', async ({
  context,
  extension,
}, info) => {
  await extension.worker.evaluate(async (profile) => {
    await chrome.storage.local.set({
      profile,
      learnedMappings: {
        '127.0.0.1': {
          gender: { path: 'personal.gender', count: 2, label: 'Gender', question: 'Gender' },
        },
      },
    });
  }, settingsReviewProfile());
  const options = await context.newPage();
  await options.setViewportSize({ width: 1280, height: 1000 });
  await options.goto(new URL('options.html', extension.worker.url()).href);
  await show(options);
  await row(options, 'Gender')
    .getByRole('button', { name: /^Edit / })
    .click();
  await options.getByRole('button', { name: /^Profile field:/ }).click();
  const list = options.getByRole('listbox', { name: 'Profile fields' });
  const selected = list.getByRole('option', { selected: true });
  await expect(selected).toContainText('Other');
  await expect(selected.locator('svg')).toBeVisible();
  const search = options.getByRole('combobox', { name: 'Search profile fields' });
  const personal = list.getByRole('button', { name: /^Personal/ });
  const firstName = list.getByRole('option').filter({ hasText: 'First Name' });
  const lastName = list.getByRole('option').filter({ hasText: 'Last Name' });
  await options.mouse.move(0, 0);
  await expect(personal).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(firstName).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  expect(await search.getAttribute('aria-activedescendant')).toBeNull();
  const selectedBackground = await selected.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  await search.press('ArrowDown');
  await expect(firstName).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(search).toHaveAttribute(
    'aria-activedescendant',
    (await firstName.getAttribute('id'))!,
  );
  await lastName.hover();
  await expect(firstName).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  expect(await search.getAttribute('aria-activedescendant')).toBeNull();
  await expect(lastName).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await options.mouse.move(0, 0);
  await expect(lastName).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(selected).toHaveCSS('background-color', selectedBackground);
  const color = await personal.evaluate((element) => getComputedStyle(element).color);
  await personal.click();
  await expect(personal).toHaveAttribute('aria-expanded', 'false');
  expect((await personal.boundingBox())!.height).toBeGreaterThanOrEqual(36);
  expect(await personal.evaluate((element) => getComputedStyle(element).color)).toBe(color);
  await personal.click();
  await selected.scrollIntoViewIfNeeded();
  await options.mouse.move(0, 0);
  await options.screenshot({ path: info.outputPath('chooser-selected-dark.png') });
  for (const [query, value] of [
    ['Veteran', 'No'],
    ['Disability', 'Prefer not to say'],
    ['Work Authorization Country', 'United States'],
    ['Salary Current Period', 'Annual'],
    ['Salary Expected Period', 'Monthly'],
  ]) {
    await search.fill(query);
    await expect(list.getByRole('option').filter({ hasText: value }).first()).toBeVisible();
  }
  await search.fill('Salary Current Period');
  await search.press('Enter');
  await expect(list).toHaveCount(0);
  const trigger = options.getByRole('button', { name: /^Profile field:/ });
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(selected).toContainText('Annual');
  await options.setViewportSize({ width: 375, height: 1000 });
  await expect
    .poll(() =>
      options.locator('aside').evaluate((element) => element.getBoundingClientRect().width),
    )
    .toBe(64);
  await expect(selected).toBeVisible();
  await selected.scrollIntoViewIfNeeded();
  const box = await list.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  await options.screenshot({ path: info.outputPath('chooser-selected-narrow.png') });
  await extension.worker.evaluate(async () =>
    chrome.storage.local.set({ themePreference: 'light' }),
  );
  await options.reload();
  await options.getByRole('button', { name: /^127\.0\.0\.1/ }).click();
  await row(options, 'Gender')
    .getByRole('button', { name: /^Edit / })
    .click();
  await options.getByRole('button', { name: /^Profile field:/ }).click();
  await expect(options.locator('html')).not.toHaveClass(/dark/);
  await expect(selected).toContainText('Other');
  await selected.scrollIntoViewIfNeeded();
  await options.screenshot({ path: info.outputPath('chooser-selected-light.png') });
});

test('renders catalog-backed salary periods and opens missing city and education details', async ({
  context,
  extension,
}) => {
  const destinations = [
    ['Work city', 'workHistory.1.location.city', 'field-workHistory-1-locationCity'],
    ['Education grade', 'education.1.grade', 'field-education-1-grade'],
    ['Education description', 'education.1.description', 'field-education-1-description'],
    ['Custom URL', 'links.custom.1.url', 'field-customLink-1-url'],
  ];
  const profile = settingsReviewProfile();
  profile.workHistory[1].location!.city = '';
  profile.education[1].grade = '';
  profile.education[1].description = '';
  profile.links.custom![1].url = '';
  await extension.worker.evaluate(
    async ({ profile, destinations }) => {
      await chrome.storage.local.set({
        profile,
        learnedMappings: {
          '127.0.0.1': Object.fromEntries(
            destinations.map(([label, path], index) => [
              `question${index}`,
              { path, count: 2, label, question: label, scope: 'entry' },
            ]),
          ),
        },
      });
    },
    { profile, destinations },
  );
  const options = await context.newPage();
  await options.goto(new URL('options.html', extension.worker.url()).href);
  await options.getByRole('button', { name: 'Salary', exact: true }).click();
  await expect(options.locator('#field-currentPeriod')).toHaveValue('annual');
  await expect(options.locator('#field-expected-1-period')).toHaveValue('monthly');
  for (const [label, , id] of destinations) {
    await options.getByRole('button', { name: 'Learned Mappings', exact: true }).click();
    const site = options.getByRole('button', { name: /^127\.0\.0\.1/ });
    if ((await site.getAttribute('aria-expanded')) !== 'true') await site.click();
    await row(options, label).getByRole('button', { name: 'Open profile', exact: true }).click();
    await expect(options.locator(`#${id}`)).toBeFocused();
  }
});

async function choose(page: Page, query: string) {
  await page.getByRole('button', { name: /^Profile field:|^Choose a profile field/ }).click();
  await page.getByRole('combobox', { name: 'Search profile fields' }).fill(query);
  await page.getByRole('combobox').press('Enter');
}
test.beforeEach(async ({ extension }) => {
  await extension.worker.evaluate(
    async ({ profile, mappings }) => {
      await chrome.storage.local.set({
        profile,
        learnedMappings: mappings,
        themePreference: 'dark',
      });
    },
    {
      profile: {
        ...RULE_PROFILE,
        personal: { ...RULE_PROFILE.personal, nickname: 'Lex' },
        links: { ...RULE_PROFILE.links, linkedin: '' },
      },
      mappings,
    },
  );
});

test('groups aliases, keeps the editor visible, preserves metadata, and uses the correction on a real form', async ({
  context,
  page,
  extension,
}, info) => {
  const options = await context.newPage();
  await options.setViewportSize({ width: 1280, height: 1000 });
  await options.goto(new URL('options.html', extension.worker.url()).href);
  await show(options);
  await expect(options.getByText('6 mappings across 2 sites')).toBeVisible();
  await expect(row(options, 'Applicant response')).toHaveCount(1);
  await expect(options.getByText('Personal → First Name', { exact: true })).toBeVisible();
  await options
    .getByRole('searchbox', { name: 'Search mappings' })
    .fill('New University institution');
  await expect(row(options, 'Name of school')).toBeVisible();
  await expect(row(options, 'Applicant response')).toHaveCount(0);
  await options.getByRole('searchbox').fill('');
  await expect(row(options, 'Applicant response')).toBeVisible();
  await options.getByRole('button', { name: 'Learning (1)', exact: true }).click();
  await expect(row(options, 'City of residence')).toBeVisible();
  await expect(row(options, 'Applicant response')).toHaveCount(0);
  await options.getByRole('button', { name: 'All (6)', exact: true }).click();
  const school = row(options, 'Name of school');
  await school.getByRole('button', { name: /^Edit / }).click();
  await options.getByRole('button', { name: /^Profile field:/ }).click();
  const list = options.getByRole('listbox', { name: 'Profile fields' });
  await expect(list).toBeVisible();
  expect(
    await list.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + 20, r.bottom - 10);
      return !!hit && el.contains(hit);
    }),
  ).toBe(true);
  const box = await list.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(1000);
  await options.screenshot({ path: info.outputPath('learned-mappings-editor-dark.png') });
  await options.getByRole('combobox').press('Escape');
  await school.getByRole('button', { name: 'Cancel', exact: true }).click();
  const applicant = row(options, 'Applicant response');
  await applicant.getByRole('button', { name: /^Edit / }).click();
  await choose(options, 'Preferred name');
  await applicant.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(options.getByText('Mapping updated.', { exact: true })).toBeVisible();
  const edited = await extension.worker.evaluate(
    async () =>
      (await chrome.storage.local.get<{ learnedMappings: LearnedMappings }>('learnedMappings'))
        .learnedMappings['127.0.0.1'],
  );
  for (const key of ['applicantresponse', 'q7'])
    expect(edited[key]).toEqual({ ...first, path: 'personal.nickname', count: 2, scope: 'entry' });
  await page.locator('body').evaluate((body) => {
    body.innerHTML =
      '<form><h1>Job application</h1><label>Applicant response<input id="q7" name="q7" required></label></form>';
    const input = body.querySelector('input')!;
    input.addEventListener('input', () => (input.dataset.observed = 'yes'));
  });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await expect(page.locator('#q7')).toHaveValue('Lex');
  await expect(page.locator('#q7')).toHaveAttribute('data-observed', 'yes');
  expect(await page.locator('#q7').evaluate((el) => (el as HTMLInputElement).checkValidity())).toBe(
    true,
  );
  await options.bringToFront();
  await options.screenshot({ path: info.outputPath('learned-mappings-desktop-dark.png') });
  await extension.worker.evaluate(async () =>
    chrome.storage.local.set({ themePreference: 'light' }),
  );
  await options.reload();
  await options.getByRole('button', { name: /^127\.0\.0\.1/ }).click();
  await expect(options.locator('html')).not.toHaveClass(/dark/);
  await options.screenshot({ path: info.outputPath('learned-mappings-desktop-light.png') });
  await extension.worker.evaluate(async () =>
    chrome.storage.local.set({ themePreference: 'dark' }),
  );
  await options.reload();
  await options.getByRole('button', { name: /^127\.0\.0\.1/ }).click();
  await options.setViewportSize({ width: 375, height: 1100 });
  await expect
    .poll(() => options.locator('aside').evaluate((el) => el.getBoundingClientRect().width))
    .toBe(64);
  await row(options, 'Applicant response')
    .getByRole('button', { name: /^Edit / })
    .click();
  await options.getByRole('button', { name: /^Profile field:/ }).click();
  const narrow = await options.getByRole('listbox').boundingBox();
  expect(narrow!.x).toBeGreaterThanOrEqual(0);
  expect(narrow!.x + narrow!.width).toBeLessThanOrEqual(375);
  await options.getByRole('combobox').fill('Last Name');
  await options.getByRole('combobox').press('Enter');
  await expect(
    row(options, 'Applicant response').getByText('Current value:', { exact: false }),
  ).toBeVisible();
  expect(await options.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  await options.screenshot({ path: info.outputPath('learned-mappings-narrow-dark.png') });
});

test('follows profile changes, preserves failed drafts and supports scoped keyboard deletion', async ({
  context,
  extension,
}) => {
  const options = await context.newPage();
  await options.goto(new URL('options.html', extension.worker.url()).href);
  await show(options);
  const linkedin = row(options, 'LinkedIn URL');
  await expect(linkedin.getByText('No saved profile data.')).toBeVisible();
  await extension.worker.evaluate(async () => {
    const { profile } = await chrome.storage.local.get<{ profile: Profile }>('profile');
    profile.links.linkedin = 'https://www.linkedin.com/in/sample/';
    await chrome.storage.local.set({ profile });
  });
  await expect(linkedin.getByText('No saved profile data.')).toHaveCount(0);
  await row(options, 'Applicant response')
    .getByRole('button', { name: /^Edit / })
    .click();
  await choose(options, 'Preferred name');
  await options.evaluate(() => {
    const original = chrome.storage.local.set.bind(chrome.storage.local);
    (window as Window & { failMappingSave?: boolean }).failMappingSave = true;
    chrome.storage.local.set = ((items: Record<string, unknown>, ...args: unknown[]) => {
      if (
        (window as Window & { failMappingSave?: boolean }).failMappingSave &&
        'learnedMappings' in items
      )
        throw new Error('Simulated storage failure');
      return original(items, ...(args as []));
    }) as typeof chrome.storage.local.set;
  });
  await options.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    options.getByText('Failed to save. Please try again.', { exact: true }),
  ).toBeVisible();
  await expect(
    options.getByRole('button', { name: 'Profile field: Personal → Preferred name', exact: true }),
  ).toBeVisible();
  await options.evaluate(() => {
    (window as Window & { failMappingSave?: boolean }).failMappingSave = false;
  });
  await options.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(options.getByText('Mapping updated.', { exact: true })).toBeVisible();
  const employer = row(options, 'Current employer');
  await employer.getByRole('button', { name: /^Delete mapping / }).click();
  await expect(employer.getByText(/Delete this mapping/)).toBeVisible();
  await employer.getByRole('button', { name: 'Cancel', exact: true }).press('Escape');
  await expect(employer.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
  await options
    .getByRole('button', { name: 'Delete all mappings for jobs.example.test', exact: true })
    .click();
  await options.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(options.getByText('Mappings deleted for this site.', { exact: true })).toBeVisible();
  expect(
    await extension.worker.evaluate(async () =>
      Object.keys(
        (await chrome.storage.local.get<{ learnedMappings: LearnedMappings }>('learnedMappings'))
          .learnedMappings,
      ),
    ),
  ).toEqual(['127.0.0.1']);
});

test('distinguishes read failure from empty data and deep-links to the missing profile input', async ({
  context,
  extension,
}) => {
  const options = await context.newPage();
  await options.addInitScript(() => {
    const original = chrome.storage.local.get.bind(chrome.storage.local);
    (window as Window & { failMappingRead?: boolean }).failMappingRead = true;
    chrome.storage.local.get = ((keys: unknown, ...args: unknown[]) => {
      if (
        keys === 'learnedMappings' &&
        (window as Window & { failMappingRead?: boolean }).failMappingRead
      )
        throw new Error('Simulated read failure');
      return (original as (keys: unknown, ...args: unknown[]) => unknown)(keys, ...args);
    }) as typeof chrome.storage.local.get;
  });
  await options.goto(new URL('options.html', extension.worker.url()).href);
  await options.getByRole('button', { name: 'Learned Mappings', exact: true }).click();
  await expect(options.getByRole('alert')).toContainText(
    'Could not load learned mappings. Try again.',
  );
  await expect(options.getByText(/No learned mappings yet/)).toHaveCount(0);
  await options.evaluate(() => {
    (window as Window & { failMappingRead?: boolean }).failMappingRead = false;
  });
  await options.getByRole('button', { name: 'Retry', exact: true }).click();
  await options.getByRole('button', { name: /^127\.0\.0\.1/ }).click();
  await row(options, 'LinkedIn URL')
    .getByRole('button', { name: 'Open profile', exact: true })
    .click();
  await expect(options.getByRole('heading', { name: 'Links', exact: true })).toBeVisible();
  await expect(options.locator('#field-linkedin')).toBeFocused();
});

test('paginates sites and reveals large mapping lists without hiding search results', async ({
  context,
  extension,
}, info) => {
  await extension.worker.evaluate(async () => {
    const learnedMappings = Object.fromEntries(
      Array.from({ length: 7 }, (_, site) => [
        `jobs${site + 1}.example.test`,
        Object.fromEntries(
          Array.from({ length: site === 0 ? 45 : 1 }, (_, i) => [
            `question${String(i).padStart(2, '0')}`,
            {
              path: 'personal.firstName',
              count: site === 6 ? 1 : 2,
              label: `Question ${i + 1}`,
              question: `Question ${i + 1}`,
            },
          ]),
        ),
      ]),
    );
    await chrome.storage.local.set({ learnedMappings });
  });
  const options = await context.newPage();
  await options.setViewportSize({ width: 1280, height: 1000 });
  await options.goto(new URL('options.html', extension.worker.url()).href);
  await options.getByRole('button', { name: 'Learned Mappings', exact: true }).click();
  const nav = options.getByRole('navigation', { name: 'Learned mapping sites' });
  await expect(nav).toContainText('Sites 1–5 of 7');
  await options.screenshot({
    path: info.outputPath('learned-mappings-pagination-desktop.png'),
    animations: 'disabled',
  });
  await nav.getByRole('button', { name: 'Next page' }).click();
  await expect(nav).toContainText('Sites 6–7 of 7');
  await expect(nav.getByRole('button', { name: 'Next page' })).toBeDisabled();
  await options.getByRole('searchbox').fill('jobs1.example.test Question 45');
  await expect(row(options, 'Question 45')).toBeVisible();
  await expect(nav).toHaveCount(0);
  await options.getByRole('searchbox').fill('');
  await expect(nav).toContainText('Sites 1–5 of 7');
  await options.getByRole('button', { name: /^jobs1.example.test/ }).click();
  const bulk = options.getByRole('region', { name: 'Mappings for jobs1.example.test' });
  await expect(bulk.getByRole('group', { name: /^Question / })).toHaveCount(20);
  await expect(bulk.getByText('25 remaining')).toBeVisible();
  await bulk.getByRole('button', { name: /^Show 20 more/ }).click();
  await expect(row(options, 'Question 21')).toBeFocused();
  await expect(bulk.getByRole('group', { name: /^Question / })).toHaveCount(40);
  await bulk.getByRole('button', { name: /^Show 5 more/ }).click();
  await expect(row(options, 'Question 41')).toBeFocused();
  await expect(bulk.getByRole('group', { name: /^Question / })).toHaveCount(45);
  await nav.getByRole('button', { name: 'Next page' }).click();
  await options.getByRole('button', { name: 'Learning (1)' }).click();
  await expect(
    options.getByRole('region', { name: 'Mappings for jobs7.example.test' }),
  ).toBeVisible();
  await options.getByRole('button', { name: 'All (51)' }).click();
  await expect(nav).toContainText('Sites 1–5 of 7');
  await options.setViewportSize({ width: 375, height: 1100 });
  await nav.scrollIntoViewIfNeeded();
  await options.screenshot({
    path: info.outputPath('learned-mappings-pagination-narrow.png'),
    animations: 'disabled',
  });
  expect(await options.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
});

test('refreshes the chooser from saved Profile edits and fills an individually selected proficiency', async ({
  context,
  page,
  extension,
}) => {
  const options = await context.newPage();
  await options.goto(new URL('options.html', extension.worker.url()).href);
  await show(options);
  const applicant = row(options, 'Applicant response');
  await applicant.getByRole('button', { name: /^Edit / }).click();
  await options.getByRole('button', { name: /^Profile field:/ }).click();
  const search = options.getByRole('combobox', { name: 'Search profile fields' });
  await search.fill('English proficiency');
  await expect(options.getByRole('option')).toHaveText('ProficiencyNative');
  await extension.worker.evaluate(async () => {
    const { profile } = await chrome.storage.local.get<{ profile: Profile }>('profile');
    profile.languages[0].proficiency = 'elementary';
    await chrome.storage.local.set({ profile });
  });
  await expect(options.getByRole('option')).toHaveText('ProficiencyBasic');
  await search.press('Enter');
  await expect(
    options.getByRole('button', {
      name: 'Profile field: Languages → English → Proficiency',
    }),
  ).toBeVisible();
  await applicant.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(options.getByText('Mapping updated.', { exact: true })).toBeVisible();
  await page.locator('body').evaluate((body) => {
    body.innerHTML =
      '<form><h1>Job application</h1><label>Applicant response<input id="q7" name="q7" required></label></form>';
    const input = body.querySelector('input')!;
    input.addEventListener('input', () => (input.dataset.observed = 'yes'));
  });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await expect(page.locator('#q7')).toHaveValue('Basic');
  await expect(page.locator('#q7')).toHaveAttribute('data-observed', 'yes');
  expect(
    await page.locator('#q7').evaluate((element) => (element as HTMLInputElement).checkValidity()),
  ).toBe(true);
});
