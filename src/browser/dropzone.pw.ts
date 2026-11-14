import { test, expect, stubEmptyGemini } from './fixtures';

for (const label of ['Upload application files', 'Upload Bewerbungsdateien']) {
  test(`shows Quick Fill and retains a portalled Dropzone upload through Undo: ${label}`, async ({
    context,
    page,
    extension,
  }) => {
    await stubEmptyGemini(context);
    await page.evaluate((label) => {
      document.body.innerHTML = `<form><h1>Apply</h1><label>Vorname<input name="vorname" autocomplete="given-name" required></label><label>Nachname<input name="nachname" autocomplete="family-name" required></label><label>E-Mail<input name="email" type="email" required></label><div class="dz-clickable">${label}</div><div id="previews"></div><output></output></form><input class="dz-hidden-input" type="file" tabindex="-1" style="visibility:hidden;position:absolute;top:0;left:0;width:0;height:0" accept="application/pdf">`;
      const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
      // Match Dropzone's discarded native-picker behavior. The write must use
      // its visible drop interaction rather than this change handler.
      input.addEventListener('change', () => input.remove());
      const surface = document.querySelector<HTMLElement>('.dz-clickable')!;
      surface.addEventListener('drop', (event) => {
        event.preventDefault();
        const file = (event as DragEvent).dataTransfer?.files[0];
        if (!file) return;
        const preview = document.createElement('div');
        preview.className = 'dz-preview dz-processing';
        preview.innerHTML =
          '<span data-dz-name></span><button type="button" data-dz-remove>Remove file</button>';
        preview.querySelector('[data-dz-name]')!.textContent = file.name;
        document.querySelector('#previews')!.append(preview);
        preview.querySelector('button')!.addEventListener('click', () => preview.remove());
        setTimeout(() => {
          preview.classList.remove('dz-processing');
          preview.classList.add('dz-success', 'dz-complete');
          document.querySelector('output')!.textContent = file.name;
        }, 30);
      });
    }, label);
    await expect(page.locator('[data-job-buddy-ui] .fill')).toBeVisible();
    await page.locator('[data-job-buddy-ui] .fill').click();
    await expect(page.locator('.dz-preview.dz-success [data-dz-name]')).toHaveText('synthetic.pdf');
    await expect(page.locator('output')).toHaveText('synthetic.pdf');
    await expect(page.locator('input[type=file]')).toHaveCount(1);
    expect(
      await page
        .locator('input[type=file]')
        .evaluate((input) => (input as HTMLInputElement).files?.[0].name),
    ).toBe('synthetic.pdf');
    // Answers are written after the importer settles, so wait for the form to become valid.
    await expect
      .poll(() =>
        page.locator('form').evaluate((form) => (form as HTMLFormElement).checkValidity()),
      )
      .toBe(true);
    await extension.send('CLEAR');
    await expect(page.locator('.dz-preview')).toHaveCount(0);
    expect(
      await page
        .locator('input[type=file]')
        .evaluate((input) => (input as HTMLInputElement).files?.length),
    ).toBe(0);
    // Repeated overwrite must not append the same CV a second time.
    await extension.send('AUTOFILL_SCAN');
    await extension.send('AUTOFILL_FILL', 'overwrite');
    await expect(page.locator('.dz-preview')).toHaveCount(1);
    await extension.send('AUTOFILL_SCAN');
    await extension.send('AUTOFILL_FILL', 'overwrite');
    await expect(page.locator('.dz-preview')).toHaveCount(1);
  });
}

test('rolls back a rejected Dropzone file', async ({ context, page, extension }) => {
  await stubEmptyGemini(context);
  await page.evaluate(() => {
    document.body.innerHTML =
      '<form><label>Full name<input name="name"></label><label>Email<input name="email" type="email"></label><div class="dz-clickable">Upload application files</div><div id="previews"></div></form><input class="dz-hidden-input" type="file" tabindex="-1" style="visibility:hidden" accept="application/pdf">';
    document.querySelector('.dz-clickable')!.addEventListener('drop', () => {
      const preview = document.createElement('div');
      preview.className = 'dz-preview dz-error';
      preview.innerHTML =
        '<span data-dz-name>synthetic.pdf</span><button type="button" data-dz-remove>Remove file</button>';
      preview.querySelector('button')!.addEventListener('click', () => preview.remove());
      document.querySelector('#previews')!.append(preview);
    });
  });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await expect(page.locator('.dz-preview')).toHaveCount(0);
  expect(
    await page
      .locator('input[type=file]')
      .evaluate((input) => (input as HTMLInputElement).files?.length),
  ).toBe(0);
});

test('keeps earlier uploads on Undo and preserves a later manual queue change', async ({
  context,
  page,
  extension,
}) => {
  await stubEmptyGemini(context);
  await page.evaluate(() => {
    document.body.innerHTML =
      '<form><label>Full name<input name="name"></label><label>Email<input name="email" type="email"></label><div class="dz-clickable" aria-label="Upload application files">Upload application files<button type="button" id="manual">Add another file</button></div><div id="previews"><div class="dz-preview dz-success"><span data-dz-name>earlier.pdf</span></div></div></form><input class="dz-hidden-input" type="file" tabindex="-1" style="visibility:hidden" accept="application/pdf">';
    document.querySelector('.dz-clickable')!.addEventListener('drop', (event) => {
      const file = (event as DragEvent).dataTransfer!.files[0];
      const preview = document.createElement('div');
      preview.className = 'dz-preview dz-success';
      preview.innerHTML =
        '<span data-dz-name></span><button type="button" data-dz-remove>Remove file</button>';
      preview.querySelector('[data-dz-name]')!.textContent = file.name;
      preview.querySelector('button')!.addEventListener('click', () => preview.remove());
      document.querySelector('#previews')!.append(preview);
    });
    document.querySelector('#manual')!.addEventListener('click', () => {
      document
        .querySelector('#previews')!
        .insertAdjacentHTML(
          'beforeend',
          '<div class="dz-preview dz-success"><span data-dz-name>manual.pdf</span></div>',
        );
    });
  });
  // Merge recognizes the existing queue even though the native picker is empty.
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'merge');
  await expect(page.locator('[data-dz-name]')).toHaveText(['earlier.pdf']);
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await expect(page.locator('[data-dz-name]')).toHaveText(['earlier.pdf', 'synthetic.pdf']);
  await extension.send('CLEAR');
  await expect(page.locator('[data-dz-name]')).toHaveText(['earlier.pdf']);
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await page.getByRole('button', { name: 'Add another file' }).click();
  await extension.send('CLEAR');
  await expect(page.locator('[data-dz-name]')).toHaveText([
    'earlier.pdf',
    'synthetic.pdf',
    'manual.pdf',
  ]);
});
