import { test, expect } from './fixtures';
import { RULE_PROFILE } from '../autofill/ruleMatching.fixture';

test.beforeEach(async ({ page, context, extension }) => {
  await extension.worker.evaluate(async (profile) => {
    await chrome.storage.local.set({ profile, learnedMappings: {} });
  }, RULE_PROFILE);
  await context.route('https://generativelanguage.googleapis.com/**', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ candidates: [{ content: { parts: [{ text: '[]' }] } }] }),
    }),
  );
  await page.evaluate(() => {
    document.body.innerHTML = '<form><h1>Job application</h1></form>';
  });
});

test('writes valid numeric, date, country and annual salary values with actual events', async ({
  page,
  extension,
}) => {
  await page.locator('form').evaluate((form) => {
    form.innerHTML +=
      '<label>Expected annual salary USD<input id="annual" name="expectedSalary" type="number" required></label><label>Expected monthly salary THB<input id="monthly" name="expectedSalary" type="number" required></label><label>Employment start date<input id="month" type="month" required></label><input id="country" autocomplete="country-name">';
  });
  await extension.send('AUTOFILL_SCAN');
  const results = await extension.send('AUTOFILL_FILL', 'overwrite');
  await expect(page.locator('#annual')).toHaveValue('72000');
  await expect(page.locator('#monthly')).toHaveValue('10000');
  await expect(page.locator('#month')).toHaveValue('2020-01');
  await expect(page.locator('#country')).toHaveValue('Thailand');
  expect(results.some((result) => result.noReview === 4)).toBe(true);
  expect(
    await page.locator('form').evaluate((form) => (form as HTMLFormElement).checkValidity()),
  ).toBe(true);
  const events = await page.evaluate(
    () => (window as unknown as { events: { type: string; inputEvent: boolean }[] }).events,
  );
  expect(events).toContainEqual(expect.objectContaining({ type: 'input', inputEvent: true }));
});

test('leaves unsupported nationality, employment type, other contacts and work-permit uploads untouched', async ({
  page,
  extension,
}) => {
  await page.locator('form').evaluate((form) => {
    form.innerHTML +=
      '<label>Nationality<input id="nationality"></label><label>Employment type<input id="employment"></label><label>Emergency contact email<input id="emergency" name="email"></label><label>Upload work permit<input id="permit" type="file" name="attachment"></label>';
  });
  await extension.send('AUTOFILL_SCAN');
  const results = await extension.send('AUTOFILL_FILL', 'overwrite');
  for (const id of ['nationality', 'employment', 'emergency', 'permit'])
    await expect(page.locator(`#${id}`)).toHaveValue('');
  expect(results.every((result) => result.noReview === 0)).toBe(true);
});

test('preserves concrete row associations across partial work, education and language entries', async ({
  page,
  extension,
}) => {
  await page.locator('form').evaluate((form) => {
    form.innerHTML += `<fieldset><legend>First work experience</legend><label>Company<input id="company1"></label><label>Job title<input id="title1"></label></fieldset><fieldset><legend>Second work experience</legend><label>Company<input id="company2"></label></fieldset>
  <fieldset><legend>First education</legend><label>Institution<input id="school1"></label><label>Degree<input id="degree1"></label><label>No end date<input id="old-study" type="checkbox"></label></fieldset><fieldset><legend>Second education</legend><label>Institution<input id="school2"></label><label>No end date<input id="new-study" type="checkbox"></label></fieldset>
  <fieldset><label>Language<input id="language1"></label><label>Proficiency<input id="level1"></label></fieldset><fieldset><label>Language<input id="language2"></label></fieldset>`;
  });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  for (const [id, value] of Object.entries({
    company1: 'Old Company',
    title1: 'Junior',
    company2: 'New Company',
    school1: 'Old University',
    degree1: 'BSc',
    school2: 'New University',
    language1: 'English',
    language2: 'Burmese',
    level1: 'Native',
  }))
    await expect(page.locator(`#${id}`)).toHaveValue(value);
  await expect(page.locator('#old-study')).not.toBeChecked();
  await expect(page.locator('#new-study')).toBeChecked();
});

test('keeps phone-code inference inside the matching contact section', async ({
  page,
  extension,
}) => {
  await page.locator('form').evaluate((form) => {
    form.innerHTML +=
      '<fieldset><legend>Primary contact</legend><label>Phone<input id="primary"></label></fieldset><fieldset><legend>Other contact</legend><label>Country code<input id="code"></label><label>Phone<input id="secondary"></label></fieldset>';
  });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await expect(page.locator('#primary')).toHaveValue('+1 2025550100');
  await expect(page.locator('#code')).toHaveValue('+1');
  await expect(page.locator('#secondary')).toHaveValue('2025550100');
});

test('uses visible country options, ignores disabled groups, and answers the specified authorization country', async ({
  page,
  extension,
}) => {
  await page.locator('form').evaluate((form) => {
    form.innerHTML +=
      '<label>Country<select id="country"><option value="">Select</option><option value="764">Thailand</option></select></label><label>Country<select id="disabled"><option value="">Select</option><optgroup disabled><option value="TH">Thailand</option></optgroup></select></label><label>Authorized to work in Thailand<select id="thai" name="workAuthorization"><option value="">Select</option><option>Yes</option><option>No</option></select></label><label>Authorized to work in United States<select id="us" name="workAuthorization"><option value="">Select</option><option>Yes</option><option>No</option></select></label>';
  });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await expect(page.locator('#country')).toHaveValue('764');
  await expect(page.locator('#disabled')).toHaveValue('');
  await expect(page.locator('#thai')).toHaveValue('Yes');
  await expect(page.locator('#us')).toHaveValue('No');
});

test('rejects a reused learned key and redirects learned resume URLs', async ({
  page,
  extension,
}) => {
  await extension.worker.evaluate(async () =>
    chrome.storage.local.set({
      learnedMappings: {
        '127.0.0.1': {
          question1: { path: 'personal.firstName', count: 2, label: 'First name' },
          resume: { path: 'documents.cv.file', count: 2 },
        },
      },
    }),
  );
  await page.locator('form').evaluate((form) => {
    form.innerHTML +=
      '<label>Company<input id="question1"></label><label>Resume<input id="resume" type="url" required></label>';
  });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await expect(page.locator('#question1')).toHaveValue('New Company');
  await expect(page.locator('#resume')).toHaveValue('https://resume.example.test/alex');
  expect(
    await page.locator('form').evaluate((form) => (form as HTMLFormElement).checkValidity()),
  ).toBe(true);
});

test('hands a failed rule selection to AI instead of silently dropping recovery', async ({
  page,
  context,
  extension,
}) => {
  let requests = 0;
  await context.route('https://generativelanguage.googleapis.com/**', (route) => {
    requests++;
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify([
                    { fieldId: 'field_001', selectedOption: 'Thailand region', confidence: 'high' },
                  ]),
                },
              ],
            },
          },
        ],
      }),
    });
  });
  await page.locator('form').evaluate((form) => {
    form.innerHTML +=
      '<label>Country<select id="country"><option value="">Select</option><option value="thai">Thailand region</option></select></label>';
  });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await expect(page.locator('#country')).toHaveValue('thai');
  expect(requests).toBeGreaterThan(0);
});

test('serializes learning from the main frame and inherited-origin frame, counting one edit once', async ({
  page,
  extension,
}) => {
  await page.locator('form').evaluate((form) => {
    form.innerHTML +=
      '<input name="mysteryName" id="mysteryName" aria-label="mysteryName"><button type="button" id="blur">Continue</button><iframe id="embedded" srcdoc=\'<label>Custom detail<input id="frameEmail" name="frameEmail"></label><button type="button">Continue</button>\'></iframe>';
  });
  await expect
    .poll(async () => {
      const responses = await extension.send('AUTOFILL_SCAN');
      return responses.length === 2 && responses.every((response) => !response.missingListener);
    })
    .toBe(true);
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await page.locator('#mysteryName').fill('Alex');
  await page.locator('#blur').focus();
  const frame = page.frameLocator('#embedded');
  await frame.locator('input').fill('alex@example.test');
  await frame.locator('button').focus();
  await expect
    .poll(async () =>
      extension.worker.evaluate(async () => {
        const { learnedMappings } = await chrome.storage.local.get('learnedMappings');
        return (learnedMappings as Record<string, Record<string, unknown>>)?.['127.0.0.1'];
      }),
    )
    .toMatchObject({
      mysteryname: { path: 'personal.firstName', count: 1 },
      frameemail: { path: 'personal.email', count: 1 },
    });
});
