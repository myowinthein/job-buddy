import { test, expect } from './fixtures';

test('production extension fills real values, dispatches validation events, preserves merge answers and undoes', async ({
  page,
  extension,
}) => {
  await extension.send('AUTOFILL_FILL', 'merge');
  await expect(page.locator('[name="firstName"]')).toHaveValue('Jane');
  await expect(page.locator('[name="lastName"]')).toHaveValue('Existing answer');
  await expect(page.locator('[name="email"]')).toHaveValue('jane@example.test');
  expect(
    await page
      .locator('[name="resume"]')
      .evaluate((el) => (el as HTMLInputElement).files?.[0]?.name),
  ).toBe('synthetic.pdf');
  expect(
    await page.locator('form').evaluate((form) => (form as HTMLFormElement).checkValidity()),
  ).toBe(true);
  const events = await page.evaluate(
    () =>
      (
        window as unknown as {
          events: { name: string; type: string; inputEvent: boolean; focusEvent: boolean }[];
        }
      ).events,
  );
  expect(events).toContainEqual(
    expect.objectContaining({ name: 'firstName', type: 'input', inputEvent: true }),
  );
  expect(events).toContainEqual(
    expect.objectContaining({ name: 'firstName', type: 'blur', focusEvent: true }),
  );
  await page.getByRole('button', { name: 'Validate' }).click();
  expect(
    await page.evaluate(
      () => (window as unknown as { submitted: { firstName: string } }).submitted.firstName,
    ),
  ).toBe('Jane');
  await extension.send('CLEAR');
  await expect(page.locator('[name="firstName"]')).toHaveValue('');
  await expect(page.locator('[name="lastName"]')).toHaveValue('Existing answer');
  expect(
    await page.locator('[name="resume"]').evaluate((el) => (el as HTMLInputElement).files?.length),
  ).toBe(0);
  expect(
    await page.locator('form').evaluate((form) => (form as HTMLFormElement).checkValidity()),
  ).toBe(false);
});

test('fills actual dropdown, shadow and about:blank iframe controls and clears owned values', async ({
  page,
  extension,
}) => {
  await extension.send('AUTOFILL_FILL', 'merge');
  await expect(page.locator('#country-trigger')).toHaveAttribute('data-selected', 'US');
  await expect(page.locator('#country-trigger')).toHaveValue('Choose country');
  await expect(page.locator('#shadow-host input')).toHaveValue('Jane');
  await expect(page.frameLocator('#application-frame').locator('input')).toHaveValue(
    'jane@example.test',
  );
  expect(
    await page
      .locator('#shadow-host input')
      .evaluate((el) => (el as HTMLInputElement).checkValidity()),
  ).toBe(true);
  await extension.send('CLEAR');
  await expect(page.locator('#shadow-host input')).toHaveValue('');
  await expect(page.frameLocator('#application-frame').locator('input')).toHaveValue('');
});

test('AI fills authorization radios, excludes consent radios, and Undo preserves submission values', async ({
  page,
  context,
  extension,
}) => {
  let requests = 0;
  const payloads: string[] = [];
  await context.route('https://generativelanguage.googleapis.com/**', async (route) => {
    requests++;
    payloads.push(route.request().postData() ?? '');
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify([
                    { fieldId: 'field_001', confidence: 'high', selectedOption: 'Yes' },
                  ]),
                },
              ],
            },
          },
        ],
      }),
    });
  });
  await extension.worker.evaluate(async () => {
    await chrome.storage.local.set({
      geminiApiKey: 'synthetic-key',
      geminiModel: 'gemini-3.8-flash',
    });
  });
  await extension.send('AUTOFILL_FILL', 'merge');
  await expect(page.locator('#work-yes')).toBeChecked();
  await expect(page.locator('#consent-yes')).not.toBeChecked();
  await expect(page.locator('#consent-no')).not.toBeChecked();
  expect(requests).toBeGreaterThan(0);
  for (const payload of payloads) expect(payload).not.toContain('Privacy consent');
  await extension.send('CLEAR');
  await expect(page.locator('#work-yes')).not.toBeChecked();
  await expect(page.locator('#work-yes')).toHaveValue('yes');
});
