import { test, expect, stubEmptyGemini } from './fixtures';

for (const native of [false, true]) {
  test(`preserves input contrast and avoids redundant Escape in ${native ? 'native' : 'ARIA'} application dialogs`, async ({
    context,
    page,
    extension,
  }, testInfo) => {
    await stubEmptyGemini(context);
    await page.evaluate((native) => {
      document.body.innerHTML = `<style>
        body {margin:0;background:#fff;font:16px system-ui}
        #application-panel {background:#000;color:#fff;padding:40px;box-sizing:border-box}
        #application-panel[aria-modal=true] {position:fixed;inset:0;overflow:auto;transform:translateZ(0)}
        dialog {width:90vw;max-height:90vh}
        label {display:block;margin:20px 0}
        input {display:block;box-sizing:border-box;width:320px;max-width:100%;background:#fff;color:rgb(52,53,58);border:2px solid white;border-radius:8px;padding:12px;opacity:1}
        input:focus {outline:3px solid #60a5fa}
      </style><button id="apply" type="button">Apply for this job</button>
      <${native ? 'dialog' : 'section'} id="application-panel">
        <form><h1>Job application</h1><label>First name<input name="firstName" autocomplete="given-name" required></label><label>Last name<input name="lastName" autocomplete="family-name" required></label><label>Email<input name="email" autocomplete="email" type="email" required></label>
        <button id="country" type="button" role="combobox" aria-label="Country" aria-expanded="false" aria-controls="countries"></button><div id="countries" role="listbox" hidden><div role="option" data-value="">Select</div><div role="option" data-value="US">United States</div></div></form>
        <button id="close-panel" type="button">Close application</button>
      </${native ? 'dialog' : 'section'}>`;
      const panel = document.getElementById('application-panel')!;
      const close = () => {
        if (native) (panel as HTMLDialogElement).close();
        else {
          panel.removeAttribute('role');
          panel.removeAttribute('aria-modal');
        }
      };
      const country = document.getElementById('country')!;
      const choices = document.getElementById('countries')!;
      country.addEventListener('click', () => {
        choices.hidden = false;
        country.setAttribute('aria-expanded', 'true');
      });
      choices.addEventListener('click', (event) => {
        const option = (event.target as Element).closest<HTMLElement>('[role=option]');
        if (!option) return;
        country.dataset.value = option.dataset.value;
        country.textContent = option.dataset.value ? option.textContent : '';
        country.setAttribute('aria-expanded', 'false');
        choices.hidden = true;
      });
      // The application, like many modal forms, also dismisses on Escape.
      window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') close();
      });
      document.getElementById('apply')!.addEventListener('click', () => {
        if (native) (panel as HTMLDialogElement).showModal();
        else {
          panel.setAttribute('role', 'dialog');
          panel.setAttribute('aria-modal', 'true');
        }
      });
      document.getElementById('close-panel')!.addEventListener('click', close);
      if (!native)
        window.addEventListener(
          'click',
          (event) => {
            if (
              panel.getAttribute('aria-modal') === 'true' &&
              !panel.contains(event.target as Node) &&
              (event.target as Element).id !== 'apply'
            )
              close();
          },
          true,
        );
    }, native);
    await page.getByRole('button', { name: 'Apply for this job', exact: true }).click();
    const panel = page.locator('#application-panel');
    await extension.send('AUTOFILL_SCAN');
    await extension.send('AUTOFILL_FILL', 'overwrite');
    await expect(page.locator('input[name=firstName]')).toHaveValue('Jane');
    await expect(page.locator('input[name=lastName]')).toHaveValue('Doe');
    await expect(page.locator('input[name=email]')).toHaveValue('jane@example.test');
    await expect(page.locator('#country')).toHaveText('United States');
    if (native) await expect(panel).toHaveAttribute('open', '');
    else await expect(panel).toHaveAttribute('aria-modal', 'true');
    const input = page.locator('input[name=firstName]');
    await expect(input).toHaveCSS('background-color', 'rgb(228, 248, 236)');
    await expect(input).toHaveCSS('color', 'rgb(52, 53, 58)');
    await expect(input).toHaveCSS('opacity', '1');
    await input.focus();
    await expect(input).toHaveCSS('outline-color', 'rgb(96, 165, 250)');
    expect(
      await page.locator('form').evaluate((form) => (form as HTMLFormElement).checkValidity()),
    ).toBe(true);
    await panel.screenshot({ path: testInfo.outputPath('filled-panel.png') });
    await extension.send('CLEAR');
    await expect(input).toHaveValue('');
    await expect(input).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await page.getByRole('button', { name: 'Close application', exact: true }).click();
  });
}
