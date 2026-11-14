import { test, expect } from './fixtures';

test('Quick Fill detects component fields, follows host labels, and keeps unrelated forms separate', async ({
  page,
  extension,
}) => {
  await extension.worker.evaluate(() =>
    chrome.storage.local.set({
      quickFillPreferences: { enabled: true, disabledSites: [] },
    }),
  );
  const widget = page.locator('[data-job-buddy-ui]');
  await expect(widget).toBeVisible();
  // A confirmed application route keeps its widget for later steps, so check the contact page on its own route.
  await page.goto('http://127.0.0.1/contact');
  await page.evaluate(() => {
    document.title = 'Contact';
    document.body.innerHTML = '<main><h1>Contact</h1></main>';
    for (const [index, label] of ['Full name', 'Email', 'Website'].entries()) {
      const host = document.createElement('test-field');
      host.setAttribute('label', label);
      host.id = `field-${index}`;
      host.attachShadow({ mode: 'open' }).innerHTML = '<input>';
      document.querySelector('main')!.append(host);
    }
  });
  await expect(widget).toHaveCount(0);
  await page.locator('#field-2').evaluate((host) => host.setAttribute('label', 'LinkedIn'));
  await expect(widget).toBeVisible();
  await expect(widget.getByRole('button', { name: 'Fill Form', exact: true })).toBeVisible();
  await page.evaluate(() => {
    const main = document.querySelector('main')!;
    main.innerHTML = '<form id="contact"></form><form id="career"></form>';
    for (const [form, labels] of [
      ['contact', ['Full name', 'Email', 'Message']],
      ['career', ['Resume', 'Salary', 'Portfolio']],
    ] as const) {
      for (const label of labels) {
        const host = document.createElement('test-field');
        host.setAttribute('label', label);
        host.attachShadow({ mode: 'open' }).innerHTML = '<input>';
        document.getElementById(form)!.append(host);
      }
    }
  });
  await expect(widget).toHaveCount(0);
  await page.evaluate(() => {
    document.querySelector('main')!.innerHTML =
      '<form><h1>Job application</h1><label>Full name<input name="name"></label><label>Email<input name="email"></label><label>Resume<input type="file" name="resume"></label></form>';
  });
  await expect(widget).toBeVisible();
  await expect(page.locator('input[name="name"]')).toHaveValue('');
  await page.evaluate(() => {
    document.querySelector('main')!.innerHTML =
      '<input name="name"><input name="email"><textarea name="message"></textarea>';
  });
  await expect(widget).toHaveCount(0);
  await page.evaluate(() => {
    document.title = 'Job application';
  });
  await expect(widget).toBeVisible();
});
