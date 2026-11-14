import { test, expect, stubEmptyGemini } from './fixtures';

for (const input of [false, true])
  for (const native of [false, true])
    for (const capture of [false, true]) {
      test(`keeps the ${native ? 'native' : 'ARIA'} application panel open with input=${input} with capture=${capture} dismissal`, async ({
        context,
        page,
        extension,
      }) => {
        await stubEmptyGemini(context);
        await page.evaluate(
          ({ native, input, capture }) => {
            document.body.innerHTML = `<button id="apply">Apply</button><${native ? 'dialog' : 'section'} id="panel"><form><h1>Job application</h1><label>First name<input name="firstName" required></label><label>Email<input name="email" type="email" required></label>${input ? '<input' : '<button type="button"'} id="country" role="combobox" aria-label="Country" aria-expanded="false" aria-controls="countries">${input ? '' : '</button>'}<div id="countries" role="listbox" hidden><div role="option" aria-selected="false">United States</div></div></form><button type="button" id="close">Close application</button></${native ? 'dialog' : 'section'}>`;
            const panel = document.querySelector<HTMLElement>('#panel')!;
            const trigger = document.querySelector<HTMLElement>('#country')!;
            const list = document.querySelector<HTMLElement>('#countries')!;

            const close = () => {
              if (native) (panel as HTMLDialogElement).close();
              else panel.removeAttribute('aria-modal');
            };
            document.querySelector('#apply')!.addEventListener('click', () => {
              if (native) (panel as HTMLDialogElement).showModal();
              else {
                panel.setAttribute('role', 'dialog');
                panel.setAttribute('aria-modal', 'true');
              }
            });
            document.querySelector('#close')!.addEventListener('click', close);
            trigger.addEventListener('click', () => {
              list.hidden = !list.hidden;
              trigger.setAttribute('aria-expanded', String(!list.hidden));
            });
            list.firstElementChild!.addEventListener('click', () => {
              if (input) (trigger as HTMLInputElement).value = 'United States';
              else trigger.textContent = 'United States';
              trigger.dataset.selected = 'US';
              list.firstElementChild!.setAttribute('aria-selected', 'true');
            });
            trigger.addEventListener('blur', () => {
              list.hidden = true;
              trigger.setAttribute('aria-expanded', 'false');
            });
            window.addEventListener(
              'keyup',
              (event) => {
                if (event.key === 'Escape') close();
              },
              capture,
            );
            window.addEventListener(
              'keydown',
              (event) => {
                if (event.key === 'Escape') close();
              },
              capture,
            );
          },
          { native, input, capture },
        );
        await page.getByRole('button', { name: 'Apply', exact: true }).click();
        await extension.send('AUTOFILL_SCAN');
        await extension.send('AUTOFILL_FILL', 'overwrite');
        const panel = page.locator('#panel');
        await expect(panel).toHaveAttribute(native ? 'open' : 'aria-modal', native ? '' : 'true');
        if (input) await expect(page.locator('#country')).toHaveValue('United States');
        else await expect(page.locator('#country')).toHaveText('United States');
        await expect(page.locator('#countries')).toBeHidden();
        await expect(page.locator('input[name=firstName]')).toHaveValue('Jane');
        await expect(page.locator('input[name=email]')).toHaveValue('jane@example.test');
        expect(
          await page.locator('form').evaluate((form) => (form as HTMLFormElement).checkValidity()),
        ).toBe(true);
        await page.getByRole('button', { name: 'Close application' }).click();
        await expect(panel).not.toHaveAttribute(native ? 'open' : 'aria-modal');
      });
    }
