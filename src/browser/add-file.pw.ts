import { test, expect, stubEmptyGemini } from './fixtures';

test('uploads a CV through a hidden Add file widget, leaves Other empty, and supports Undo', async ({
  context,
  page,
  extension,
}) => {
  await stubEmptyGemini(context);
  await page.evaluate(() => {
    document.body.innerHTML = `<main><h1>Job application</h1><form>
      <label>First name<input name="firstName" required></label><label>Email<input type="email" name="email" required></label>
      <div role="group" aria-label="CV (required)"><div><span>CV (required)</span></div><div class="document-input-wrapper"><button type="button">Add file</button><input id="doc-input-cv" type="file" name="documents.cv" aria-label="Upload CV" multiple accept=".pdf,.docx" style="display:none" required></div></div>
      <div role="group" aria-label="Other (Optional)"><div><span>Other (Optional)</span></div><div class="document-input-wrapper"><button type="button">Add file</button><input id="doc-input-other" type="file" name="documents.other" aria-label="Upload Other" multiple style="display:none"></div></div>
      <output id="uploaded"></output><button type="submit">Submit</button>
    </form></main>`;
    const file = document.querySelector<HTMLInputElement>('#doc-input-cv')!;
    file.addEventListener('change', () => {
      document.querySelector('output')!.textContent = file.files?.[0]?.name ?? '';
    });
    file.addEventListener('input', () => {
      file.dataset.inputs = String(Number(file.dataset.inputs ?? 0) + 1);
    });
  });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await expect(page.locator('#uploaded')).toHaveText('synthetic.pdf');
  const file = page.locator('#doc-input-cv');
  expect(
    await file.evaluate((element) => {
      const file = (element as HTMLInputElement).files?.[0];
      return { name: file?.name, size: file?.size, type: file?.type };
    }),
  ).toEqual({ name: 'synthetic.pdf', size: 13, type: 'application/pdf' });
  await expect(file).toHaveAttribute('data-inputs', '1');
  expect(
    await page
      .locator('#doc-input-other')
      .evaluate((element) => (element as HTMLInputElement).files?.length),
  ).toBe(0);
  expect(
    await page.locator('form').evaluate((form) => (form as HTMLFormElement).checkValidity()),
  ).toBe(true);
  await extension.send('CLEAR');
  await expect(page.locator('#uploaded')).toHaveText('');
  expect(await file.evaluate((element) => (element as HTMLInputElement).files?.length)).toBe(0);
});
