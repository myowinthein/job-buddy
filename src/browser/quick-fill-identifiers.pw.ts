import { test, expect, stubEmptyGemini } from './fixtures';

test('shows Quick Fill for a late modal with a generic document label and upload_cv identifier', async ({
  page,
  context,
  extension,
}) => {
  await stubEmptyGemini(context);
  await page.evaluate(() => {
    document.body.innerHTML =
      '<form><label>Name<input name="name"></label><label>Email<input name="email" type="email"></label><label>Import your documents<input type="file" name="upload_documents"></label></form><button type="button" id="open">Open form</button>';
    document.querySelector('#open')!.addEventListener('click', () => {
      const modal = document.createElement('div');
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-label', 'Form');
      modal.innerHTML =
        '<form><label>Name<input name="last_name" id="last_name"></label><label>First name<input name="first_name" id="first_name"></label><label>Email<input name="email" type="email"></label><label for="upload_cv">Import your documents</label><input type="file" name="upload_cv" id="upload_cv" accept="application/pdf" style="display:none"></form>';
      document.body.append(modal);
    });
  });
  const widget = page.locator('[data-job-buddy-ui]');
  await expect(widget).toHaveCount(0);
  await page.getByRole('button', { name: 'Open form', exact: true }).click();
  await expect(widget).toBeVisible();
  await widget.getByRole('button', { name: 'Fill Form', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Form' });
  await expect(form.locator('[name=first_name]')).toHaveValue('Jane');
  await expect(form.locator('[name=email]')).toHaveValue('jane@example.test');
  await expect
    .poll(() =>
      extension.worker.evaluate(async (tabId) => {
        const key = `jb:autofill-run:${tabId}`;
        return ((await chrome.storage.session.get(key))[key] as { stage?: string })?.stage;
      }, extension.sourceTabId),
    )
    .toBe('completed');
});
