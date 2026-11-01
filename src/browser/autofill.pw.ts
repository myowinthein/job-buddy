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
    expect(route.request().url()).not.toContain('synthetic-key');
    expect(route.request().headers()['x-goog-api-key']).toBe('synthetic-key');
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
  for (const payload of payloads) {
    expect(payload).not.toContain('Privacy consent');
    expect(payload).not.toContain('synthetic.pdf');
    expect(payload).not.toContain('c3ludGhldGljIHBkZg==');
  }
  await extension.send('CLEAR');
  await expect(page.locator('#work-yes')).not.toBeChecked();
  await expect(page.locator('#work-yes')).toHaveValue('yes');
});

test('requires AI setup before scanning or filling and leaves existing answers unchanged', async ({
  page,
  extension,
}) => {
  await extension.worker.evaluate(async () => {
    await chrome.storage.local.remove(['geminiApiKey', 'geminiModel']);
  });
  for (const action of ['AUTOFILL_SCAN', 'AUTOFILL_FILL']) {
    const responses = await extension.send(action, 'overwrite');
    expect(responses).toContainEqual({ error: 'ai_setup_required' });
    expect(responses.every((response) => response.error === 'ai_setup_required')).toBe(true);
  }
  await expect(page.locator('[name="firstName"]')).toHaveValue('');
  await expect(page.locator('[name="lastName"]')).toHaveValue('Existing answer');
  expect(
    await page.locator('form').evaluate((form) => (form as HTMLFormElement).checkValidity()),
  ).toBe(false);
});

test('a removed key blocks a pending fill, while Undo remains available after a completed fill', async ({
  page,
  extension,
}) => {
  await extension.worker.evaluate(async () => {
    await chrome.storage.local.remove('geminiApiKey');
  });
  expect(await extension.send('AUTOFILL_FILL', 'overwrite')).toContainEqual({
    error: 'ai_setup_required',
  });
  await expect(page.locator('[name="firstName"]')).toHaveValue('');
  await extension.worker.evaluate(async () => {
    await chrome.storage.local.set({ geminiApiKey: 'synthetic-key' });
  });
  await extension.send('AUTOFILL_SCAN');
  const results = await extension.send('AUTOFILL_FILL', 'merge');
  // The fixture blocks external network traffic. A failed AI request must be
  // distinguishable from the rules that already filled real values.
  expect(results.some((result) => result.aiStatus === 'unavailable')).toBe(true);
  await expect(page.locator('[name="firstName"]')).toHaveValue('Jane');
  await expect(page.locator('[name="lastName"]')).toHaveValue('Existing answer');
  await extension.worker.evaluate(async () => {
    await chrome.storage.local.remove('geminiApiKey');
  });
  await extension.send('CLEAR');
  await expect(page.locator('[name="firstName"]')).toHaveValue('');
  await expect(page.locator('[name="lastName"]')).toHaveValue('Existing answer');
});

test('missing profile data gets a neutral tint that preserves focus and clears on edit or Undo', async ({
  page,
  extension,
}, testInfo) => {
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.textContent = '#missing-link:focus { outline: 3px solid rgb(59, 130, 246); }';
    document.head.appendChild(style);
    const label = document.createElement('label');
    label.textContent = 'LinkedIn';
    const input = document.createElement('input');
    input.id = 'missing-link';
    input.name = 'linkedin';
    input.type = 'url';
    input.style.backgroundColor = 'rgb(17, 24, 39)';
    label.appendChild(input);
    document.querySelector('form')!.appendChild(label);
    const shadow = document.querySelector('#shadow-host')!.shadowRoot!;
    const shadowLabel = document.createElement('label');
    shadowLabel.textContent = 'LinkedIn';
    const shadowInput = document.createElement('input');
    shadowInput.id = 'missing-shadow-link';
    shadowLabel.appendChild(shadowInput);
    const scroll = document.createElement('div');
    scroll.id = 'feedback-scroll';
    scroll.style.cssText =
      'height:100px;overflow:auto;width:320px;padding-top:20px;box-sizing:border-box';
    scroll.appendChild(shadowLabel);
    const spacer = document.createElement('div');
    spacer.style.height = '200px';
    scroll.appendChild(spacer);
    shadow.appendChild(scroll);
  });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'merge');
  const missing = page.locator('#missing-link');
  const shadowMissing = page.locator('#missing-shadow-link');
  await expect(missing).toHaveValue('');
  await expect(missing).toHaveAttribute('data-jb-missing-data', '1');
  await expect(missing).toHaveCSS('background-color', 'rgba(107, 114, 128, 0.12)');
  await expect(missing).toHaveCSS('outline-style', 'none');
  await expect(shadowMissing).toHaveAttribute('data-jb-missing-data', '1');
  await page.locator('#feedback-scroll').evaluate((el) => {
    el.scrollTop = 12;
  });
  await expect(shadowMissing).toHaveAttribute('aria-describedby', /jb-feedback-/);
  await expect(page.locator('[name="lastName"]')).not.toHaveAttribute('data-jb-missing-data');
  await expect(page.locator('#consent-yes')).not.toHaveAttribute('data-jb-highlighted');
  await missing.focus();
  await expect(missing).toHaveCSS('outline-width', '3px');
  await expect(missing).toHaveCSS('outline-color', 'rgb(59, 130, 246)');
  await page.locator('[name="firstName"]').focus();
  await expect(missing).toHaveCSS('outline-style', 'none');
  await expect(missing).toHaveCSS('background-color', 'rgba(107, 114, 128, 0.12)');
  await page.locator('form').screenshot({ path: testInfo.outputPath('missing-data-tint.png') });
  await missing.fill('https://www.linkedin.com/in/synthetic-person');
  await page.locator('[name="firstName"]').focus();
  await expect(missing).not.toHaveAttribute('data-jb-missing-data');
  await expect(missing).toHaveCSS('background-color', 'rgba(34, 197, 94, 0.12)');
  expect(
    await page.locator('form').evaluate((form) => (form as HTMLFormElement).checkValidity()),
  ).toBe(true);
  const events = await page.evaluate(
    () =>
      (window as unknown as { events: { name: string; type: string; inputEvent: boolean }[] })
        .events,
  );
  expect(events).toContainEqual(
    expect.objectContaining({ name: 'linkedin', type: 'input', inputEvent: true }),
  );
  await extension.send('CLEAR');
  await expect(missing).toHaveCSS('background-color', 'rgb(17, 24, 39)');
  await expect(missing).not.toHaveAttribute('data-jb-highlighted');
  await expect(shadowMissing).not.toHaveAttribute('data-jb-highlighted');
  await expect(shadowMissing).toHaveCSS('outline-style', 'none');
});

test('form feedback stays quiet while keeping tints, accessible descriptions, tab order, and Undo', async ({
  page,
  extension,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.evaluate(() => {
    document.body.innerHTML = `<style>
      body{margin:0;padding:40px;background:#111827;color:#f3f4f6;font:14px system-ui}
      form{width:360px;max-width:calc(100vw - 80px)}h1{font-size:21px;margin:0 0 26px}
      .entry{margin:24px 0}label{display:block;margin:0 0 8px;font-weight:600}
      input{box-sizing:border-box;width:100%;height:40px;border:1px solid #64748b;border-radius:6px;background:#1f2937;color:#f9fafb;padding:8px 10px;font:inherit}
      input:focus{outline:2px solid #60a5fa;outline-offset:2px}small{display:block;margin-top:6px;color:#cbd5e1}
      </style><form><h1>Sample application</h1>
      <div class="entry"><label for="confident">First name</label><input id="confident" name="firstName" autocomplete="given-name" required aria-describedby="name-help"><small id="name-help">Use your preferred name.</small></div>
      <div class="entry"><label for="review">Firstnam</label><input id="review" name="firstnam"></div>
      <div class="entry"><label for="unmatched">Zqx reference</label><input id="unmatched" name="zqxReference"></div>
      <div class="entry"><label for="missing">Street address</label><input id="missing" name="streetAddress"></div>
      <div class="entry"><label for="manual">Custom reference</label><input id="manual" name="zqxCustom"></div></form>`;
  });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'merge');
  const overlay = page.locator('[data-jb-feedback-root], [data-jb-field-status], [role="tooltip"]');
  await expect(overlay).toHaveCount(0);
  await expect(page.locator('#confident')).toHaveCSS('background-color', 'rgba(34, 197, 94, 0.12)');
  await expect(page.locator('#review')).toHaveCSS('background-color', 'rgba(234, 179, 8, 0.12)');
  await expect(page.locator('#unmatched')).toHaveCSS('background-color', 'rgba(239, 68, 68, 0.12)');
  await expect(page.locator('#missing')).toHaveCSS('background-color', 'rgba(107, 114, 128, 0.12)');
  await expect(page.locator('#confident')).toHaveValue('Jane');
  await expect(page.locator('#review')).toHaveValue('Jane');
  await expect(page.locator('#unmatched')).toHaveValue('');
  await expect(page.locator('#missing')).toHaveValue('');
  await expect(page.locator('#confident')).toHaveAttribute(
    'aria-describedby',
    /name-help jb-feedback-/,
  );
  await expect(page.locator('#missing')).toHaveAccessibleDescription(
    'Job Buddy: No saved answer in your profile.',
  );
  const originalPosition = await page.locator('#review').boundingBox();
  await page.locator('#confident').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#review')).toBeFocused();
  await page.locator('#unmatched').hover();
  await expect(overlay).toHaveCount(0);
  expect(await page.locator('#review').boundingBox()).toEqual(originalPosition);
  await page.locator('#manual').fill('Reference confirmed by the applicant');
  await page.locator('#confident').focus();
  await expect(page.locator('#manual')).toHaveCSS('background-color', 'rgba(34, 197, 94, 0.12)');
  await expect(page.locator('#manual')).toHaveAccessibleDescription('Job Buddy: Confirmed by you.');
  expect(
    await page.locator('form').evaluate((form) => (form as HTMLFormElement).checkValidity()),
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('form-tints-dark.png'), fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.locator('#review').focus();
  await page.locator('#missing').hover();
  await page.evaluate(() => window.scrollBy(0, 100));
  await expect(overlay).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('form-tints-narrow.png'), fullPage: true });
  await extension.send('CLEAR');
  await expect(overlay).toHaveCount(0);
  await expect(page.locator('[data-jb-field-description]')).toHaveCount(0);
  await expect(page.locator('#confident')).toHaveAttribute('aria-describedby', 'name-help');
  await expect(page.locator('#manual')).toHaveValue('');
});
