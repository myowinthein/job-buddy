import { test, expect, stubEmptyGemini } from './fixtures';

for (const native of [false, true]) {
  test(`floating controls stay inside the ${native ? 'native' : 'ARIA'} application panel during outside-click handling`, async ({
    page,
    context,
    extension,
  }) => {
    await stubEmptyGemini(context);
    await extension.worker.evaluate(() =>
      chrome.storage.local.set({
        quickFillPreferences: { enabled: true, disabledSites: [], fillMode: 'merge' },
      }),
    );
    await page.evaluate((native) => {
      document.body.innerHTML = `<style>
        body { margin:0; font:16px system-ui; }
        #spacer { height:180vh; }
        #panel { background:white; padding:24px; box-sizing:border-box; }
        #panel[data-open=true] { position:fixed; inset:0; transform:translateY(40px); height:calc(100vh - 40px); width:100vw; max-width:none; max-height:none; margin:0; overflow:auto; }
        label { display:block; margin:16px 0; }
      </style><button type="button" id="apply">Apply to this job</button><div id="spacer"></div>
      <${native ? 'dialog' : 'section'} id="panel"><h1>Apply for this job</h1>
      <form><label>First name<input name="firstName" autocomplete="given-name" required></label>
      <label>Email<input type="email" name="email" autocomplete="email" required></label>
      <label>Resume<input type="file" name="resume"></label><button>Submit application</button></form>
      <button type="button" id="close">Close application</button></${native ? 'dialog' : 'section'}>`;
      const panel = document.getElementById('panel')!;
      const close = () => {
        panel.removeAttribute('data-open');
        if (native) (panel as HTMLDialogElement).close();
        else {
          panel.removeAttribute('role');
          panel.removeAttribute('aria-modal');
        }
      };
      document.getElementById('apply')!.addEventListener('click', () => {
        panel.setAttribute('data-open', 'true');
        if (native) (panel as HTMLDialogElement).showModal();
        else {
          panel.setAttribute('role', 'dialog');
          panel.setAttribute('aria-modal', 'true');
        }
      });
      document.getElementById('close')!.addEventListener('click', close);
      // Teamtailor observes outside interactions in capture, before a shadow widget
      // could stop propagation. A dropdown Escape regression does not cover this.
      for (const type of ['pointerdown', 'mousedown', 'click'])
        window.addEventListener(
          type,
          (event) => {
            if (
              panel.dataset.open === 'true' &&
              !panel.contains(event.target as Node) &&
              !(event.target as Element).closest('#apply')
            )
              close();
          },
          true,
        );
      document.querySelector('form')!.addEventListener('submit', (event) => {
        event.preventDefault();
        document.body.dataset.submitted = 'true';
      });
    }, native);
    await page.getByRole('button', { name: 'Apply to this job', exact: true }).click();
    const panel = page.locator('#panel');
    const widget = page.locator('[data-job-buddy-ui]');
    await expect(widget).toBeVisible();
    await expect(widget).toBeInViewport({ ratio: 1 });
    await widget.getByRole('button', { name: 'Fill Form', exact: true }).click();
    await expect(panel).toHaveAttribute('data-open', 'true');
    await expect(panel.locator('[name=firstName]')).toHaveValue('Jane');
    await expect(panel.locator('[name=email]')).toHaveValue('jane@example.test');
    await expect(widget.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
    await expect(widget).toBeInViewport({ ratio: 1 });
    expect(
      await panel.locator('form').evaluate((form) => (form as HTMLFormElement).checkValidity()),
    ).toBe(true);
    await expect(page.locator('body')).not.toHaveAttribute('data-submitted');
    await widget.getByRole('button', { name: 'Quick fill options', exact: true }).click();
    await expect(widget.getByRole('button', { name: 'Hide until refresh' })).toBeVisible();
    await expect(panel).toHaveAttribute('data-open', 'true');
    await widget.getByRole('button', { name: 'Quick fill options', exact: true }).click();
    await widget.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(panel.locator('[name=firstName]')).toHaveValue('');
    await expect(panel.locator('[name=email]')).toHaveValue('');
    await expect(panel).toHaveAttribute('data-open', 'true');
    await page.getByRole('button', { name: 'Close application', exact: true }).click();
    await expect(panel).not.toHaveAttribute('data-open');
    await expect(panel.locator('[data-job-buddy-ui]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Apply to this job', exact: true }).click();
    await expect(widget).toBeVisible();
    await expect(page.locator('[data-job-buddy-ui]')).toHaveCount(1);
  });
}
