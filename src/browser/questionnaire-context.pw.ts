import { test, expect, geminiResponse, autofillRequest } from './fixtures';
import { buildFixtureScript } from './buildFixture';
import type { Profile } from '../types/profile';

let script: string;
test.beforeAll(async () => {
  script = await buildFixtureScript({
    entry: 'src/browser/fixtures/questionnaire.tsx',
    name: 'QuestionnaireFixture',
    missingChunkMessage: 'Missing questionnaire fixture',
    minify: false,
  });
});
for (const universityAsked of [false, true]) {
  test(`fills deferred degree, English and contextual salary/grade answers: university asked ${universityAsked}`, async ({
    page,
    context,
    extension,
  }) => {
    await extension.worker.evaluate(async () => {
      const { profile } = await chrome.storage.local.get<{ profile: Profile }>('profile');
      profile.education = [
        {
          institution: 'Example University',
          degree: 'Bachelor of Science (Honours)',
          fieldOfStudy: 'Computing',
          startDate: '2014',
          grade: 'First Class Honours',
        },
      ];
      profile.languages = [
        { language: 'Burmese', proficiency: 'native_bilingual' },
        { language: 'English', proficiency: 'full_professional' },
      ];
      profile.salary.current = { amount: 66000, currency: 'USD', period: 'annual' };
      await chrome.storage.local.set({ profile });
    });
    await context.route('https://generativelanguage.googleapis.com/**', (route) =>
      route.fulfill({
        json: geminiResponse(
          JSON.stringify(
            autofillRequest(route).fields.flatMap((field) => {
              const path = /Highest Education/i.test(field.label)
                ? 'education.0.degree'
                : /GPA/i.test(field.label)
                  ? 'education.0.grade'
                  : /salary in your previous/i.test(field.label)
                    ? 'salary.current.amount'
                    : undefined;
              return path
                ? [{ fieldId: field.fieldId, profilePath: path, confidence: 'high' }]
                : [];
            }),
          ),
        ),
      }),
    );
    await page.evaluate(() => {
      document.body.innerHTML = '<div id="root"></div>';
    });
    await page.addScriptTag({ content: script });
    await expect(page.locator('#english')).toBeVisible();
    if (universityAsked)
      await page
        .locator('form')
        .evaluate((form) =>
          form.insertAdjacentHTML(
            'beforeend',
            '<label>College/University<input id="university"></label>',
          ),
        );
    await extension.send('AUTOFILL_SCAN');
    await extension.send('AUTOFILL_FILL', 'overwrite');
    await expect(page.locator('button[data-menu-id]')).toHaveText('College - Bachelor of Science');
    await expect(page.locator('#english')).toHaveValue('Fluent');
    await expect(page.locator('#salary')).toHaveValue('66,000 USD');
    await expect(page.locator('#grade')).toHaveValue(
      universityAsked ? 'First Class Honours' : 'First Class Honours — Example University',
    );
    await expect(page.locator('#certifications')).toHaveValue('');
    expect(
      await page.locator('form').evaluate((form) => (form as HTMLFormElement).checkValidity()),
    ).toBe(true);
  });
}
