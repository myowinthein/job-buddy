import { test, expect, autofillRequest, geminiResponse } from './fixtures';

test('shows a fast AI batch while another is pending, then preserves a manual edit and supports Undo', async ({
  page,
  context,
  extension,
}) => {
  let release!: () => void;
  const late = new Promise<void>((resolve) => {
    release = resolve;
  });
  let batches = 0;
  await context.route('https://generativelanguage.googleapis.com/**', async (route) => {
    const { fields } = autofillRequest(route);
    batches++;
    if (fields.length < 20) await late;
    await route.fulfill({
      json: geminiResponse(
        JSON.stringify([
          {
            fieldId: fields[0].fieldId,
            profilePath: 'personal.firstName',
            confidence: 'high',
          },
        ]),
      ),
    });
  });
  await extension.worker.evaluate(() =>
    chrome.storage.local.set({
      quickFillPreferences: { enabled: true, disabledSites: [], fillMode: 'overwrite' },
    }),
  );
  await page.evaluate(() => {
    document.body.innerHTML = `<form><h1>Job application</h1><label>First name<input name="firstName"></label><label>Email<input type="email" name="email"></label>${Array.from({ length: 21 }, (_, i) => `<div class="form-field"><label for="q${i}">Applicant detail ${i + 1}</label><input id="q${i}"></div>`).join('')}</form>`;
  });
  const widget = page.locator('[data-job-buddy-ui]');
  await widget.getByRole('button', { name: 'Fill Form', exact: true }).click();
  await expect(page.locator('#q0')).toHaveValue('Jane');
  expect(batches).toBe(2);
  await expect(widget.getByRole('button', { name: /Filling/ })).toBeDisabled();
  await page.locator('#q20').fill('Manual answer');
  release();
  await expect(widget.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
  await expect(page.locator('#q20')).toHaveValue('Manual answer');
  await widget.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('#q0')).toHaveValue('');
  await expect(page.locator('#q20')).toHaveValue('Manual answer');
});
