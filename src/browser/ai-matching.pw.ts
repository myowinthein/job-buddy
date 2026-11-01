import { test, expect } from './fixtures';
import type { AIFieldPayload, AIFieldResponse } from '../resume-ai/types';
import { RULE_PROFILE } from '../autofill/ruleMatching.fixture';

test.beforeEach(async ({ page, extension }) => {
  const profile = structuredClone(RULE_PROFILE);
  profile.personal.gender = 'synthetic-background-value';
  await extension.worker.evaluate(async (profile) => {
    await chrome.storage.local.set({ profile, learnedMappings: {} });
  }, profile);
  await page.evaluate(() => {
    document.body.innerHTML = '<form><h1>Job application</h1></form>';
  });
});

for (const path of ['id', 'documents.cv.file.base64', 'personal.gender']) {
  test(`rejects an AI response naming excluded data: ${path}`, async ({
    page,
    context,
    extension,
  }) => {
    await page.locator('form').evaluate((form) => {
      form.innerHTML += '<label>Custom reference<input id="target"></label>';
    });
    await context.route('https://generativelanguage.googleapis.com/**', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify([
                      { fieldId: 'field_001', profilePath: path, confidence: 'high' },
                    ]),
                  },
                ],
              },
            },
          ],
        }),
      }),
    );
    await extension.send('AUTOFILL_SCAN');
    const result = await extension.send('AUTOFILL_FILL', 'overwrite');
    await expect(page.locator('#target')).toHaveValue('');
    expect(result.every((item) => item.noReview === 0)).toBe(true);
  });
}

test('uses field-aware salary/date values and real browser events for AI answers', async ({
  page,
  context,
  extension,
}) => {
  await page.locator('form').evaluate((form) => {
    form.innerHTML +=
      '<label>How much compensation would you like per annum in USD?<input id="annual" type="number" required></label><label>Date for assignment phase<input id="month" type="month" required></label>';
  });
  const sent: AIFieldPayload[] = [];
  await context.route('https://generativelanguage.googleapis.com/**', (route) => {
    const prompt = route.request().postDataJSON().contents[0].parts[0].text as string;
    const { fields } = JSON.parse(prompt.slice(prompt.lastIndexOf('\n\n{') + 2)) as {
      fields: AIFieldPayload[];
    };
    sent.push(...fields);
    const answers = fields.map((field) => ({
      fieldId: field.fieldId,
      profilePath: field.label.includes('compensation')
        ? 'salary.expected.0.amount'
        : 'workHistory.1.startDate.formatted',
      confidence: 'high',
    }));
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(answers) }] } }],
      }),
    });
  });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await expect(page.locator('#annual')).toHaveValue('72000');
  await expect(page.locator('#month')).toHaveValue('2020-01');
  expect(sent).toHaveLength(2);
  expect(sent.find((field) => field.inputType === 'month')).toBeTruthy();
  expect(
    await page.locator('form').evaluate((form) => (form as HTMLFormElement).checkValidity()),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => (window as unknown as { events: { type: string; inputEvent: boolean }[] }).events,
    ),
  ).toContainEqual(expect.objectContaining({ type: 'input', inputEvent: true }));
});

test('rejects fuzzy opposites and ambiguous option strings while accepting option IDs', async ({
  page,
  context,
  extension,
}) => {
  await page.locator('form').evaluate((form) => {
    form.innerHTML +=
      '<fieldset><legend>Work authorization</legend><label><input id="authorized" type="radio" name="auth" value="a">Authorized</label><label><input type="radio" name="auth" value="s">Requires sponsorship</label></fieldset><fieldset><legend>Level</legend><label><input id="one" type="radio" name="level" value="0">1</label><label><input id="two" type="radio" name="level" value="1">2</label></fieldset>';
  });
  let useId = false;
  await context.route('https://generativelanguage.googleapis.com/**', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify([
                    { fieldId: 'field_001', selectedOption: 'Not authorized', confidence: 'high' },
                    {
                      fieldId: 'field_002',
                      selectedOption: useId ? 'option_001' : '1',
                      confidence: 'high',
                    },
                  ]),
                },
              ],
            },
          },
        ],
      }),
    }),
  );
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  expect(await page.locator('input:checked').count()).toBe(0);
  useId = true;
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await expect(page.locator('#one')).toBeChecked();
  await expect(page.locator('#two')).not.toBeChecked();
  await expect(page.locator('#authorized')).not.toBeChecked();
});

test('replaces checkbox selections and supports an explicit empty selection', async ({
  page,
  context,
  extension,
}) => {
  await page.locator('form').evaluate((form) => {
    form.innerHTML +=
      '<fieldset><legend>Languages</legend><label><input id="old" type="checkbox" name="langs" value="French" checked>French</label><label><input id="new" type="checkbox" name="langs" value="English">English</label></fieldset>';
  });
  let selectedOptions = ['option_002'];
  await context.route('https://generativelanguage.googleapis.com/**', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify([
                    { fieldId: 'field_001', selectedOptions, confidence: 'high' },
                  ]),
                },
              ],
            },
          },
        ],
      }),
    }),
  );
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await expect(page.locator('#old')).not.toBeChecked();
  await expect(page.locator('#new')).toBeChecked();
  selectedOptions = [];
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  expect(await page.locator('input:checked').count()).toBe(0);
});

for (const action of ['manual-choice', 'changed-question', 'profile-replacement']) {
  test(`protects an in-flight answer after ${action}`, async ({ page, context, extension }) => {
    await page.locator('form').evaluate((form, action) => {
      form.innerHTML +=
        action === 'manual-choice'
          ? '<fieldset><legend>Custom decision</legend><label><input type="radio" name="choice" value="A">A</label><label><input id="manual" type="radio" name="choice" value="B">B</label></fieldset>'
          : '<label id="question">Custom reference<input id="target"></label>';
    }, action);
    let started!: () => void, release!: () => void;
    const requested = new Promise<void>((resolve) => {
      started = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await context.route('https://generativelanguage.googleapis.com/**', async (route) => {
      started();
      await gate;
      const answer: AIFieldResponse =
        action === 'manual-choice'
          ? { fieldId: 'field_001', selectedOption: 'option_001', confidence: 'high' }
          : { fieldId: 'field_001', profilePath: 'personal.firstName', confidence: 'high' };
      await route
        .fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            candidates: [{ content: { parts: [{ text: JSON.stringify([answer]) }] } }],
          }),
        })
        .catch(() => {}); // Replacement intentionally aborts this request.
    });
    await extension.send('AUTOFILL_SCAN');
    const pending = extension.send('AUTOFILL_FILL', 'overwrite');
    await requested;
    if (action === 'manual-choice') await page.locator('#manual').check();
    else if (action === 'changed-question')
      await page.locator('#question').evaluate((label) => {
        label.firstChild!.textContent = 'Emergency contact name';
      });
    else
      await extension.worker.evaluate(async () => {
        const data = await chrome.storage.local.get('profile');
        const profile = data.profile as typeof RULE_PROFILE;
        await chrome.storage.local.set({
          profile: {
            ...profile,
            id: 'replacement-person',
            personal: { ...profile.personal, firstName: 'Luna' },
          },
        });
      });
    // Allow the asynchronous storage notification to reach the content script.
    if (action === 'profile-replacement')
      await expect.poll(() => page.locator('#target').inputValue()).toBe('');
    release();
    await pending;
    if (action === 'manual-choice') await expect(page.locator('#manual')).toBeChecked();
    else await expect(page.locator('#target')).toHaveValue('');
  });
}
