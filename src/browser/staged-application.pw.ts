import { test, expect, stubEmptyGemini } from './fixtures';

test('detects an early application step and fills each later step only after a new click', async ({
  page,
  context,
  extension,
}) => {
  await stubEmptyGemini(context);
  await extension.worker.evaluate(() =>
    chrome.storage.local.set({
      quickFillPreferences: { enabled: true, disabledSites: [], fillMode: 'overwrite' },
    }),
  );
  await page.goto('http://127.0.0.1/apply/personal-details');
  await page.evaluate(() => {
    document.title = 'Talent portal';
    document.body.innerHTML =
      '<h1>Let’s put a name to your application</h1><div id="personal"><label>First name<input name="firstName" required></label><label>Last name<input name="lastName"></label><label>Email<input type="email" name="email" required></label><button id="continue" type="button">Continue</button></div><div id="next"></div><output id="advances">0</output>';
    let advances = 0;
    document.querySelector('#continue')!.addEventListener('click', () => {
      document.querySelector<HTMLElement>('#personal')!.hidden = true;
      document.querySelector('#advances')!.textContent = String(++advances);
      document.querySelector('#next')!.innerHTML =
        '<h2>Your location</h2><label>City<input name="city"></label><button id="location-next" type="button">Continue</button>';
      document.querySelector('#location-next')!.addEventListener('click', () => {
        history.pushState(null, '', '/apply/phone');
        document.querySelector('#advances')!.textContent = String(++advances);
        document.querySelector('#next')!.innerHTML =
          '<h2>Your phone number</h2><label>Phone<input type="tel" name="phone"></label>';
      });
    });
  });
  const widget = page.locator('[data-job-buddy-ui]');
  const fill = widget.getByRole('button', { name: 'Fill Form', exact: true });
  await expect(fill).toBeVisible();
  await fill.click();
  await expect(page.locator('input[name=firstName]')).toHaveValue('Jane');
  await expect(page.locator('input[name=email]')).toHaveValue('jane@example.test');
  await expect(widget.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
  await expect(page.locator('#advances')).toHaveText('0');
  await expect(page.locator('#next input')).toHaveCount(0);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(fill).toBeVisible();
  await expect(page.locator('input[name=city]')).toHaveValue('');
  await fill.click();
  await expect(page.locator('input[name=city]')).toHaveValue('Test City');
  await expect(fill).toBeEnabled();
  await expect(page.locator('#advances')).toHaveText('1');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(fill).toBeVisible();
  await expect(page.locator('input[name=phone]')).toHaveValue('');
  await fill.click();
  await expect(page.locator('input[name=phone]')).toHaveValue('+1 1234567890');
  await expect(fill).toBeEnabled();
  await expect(page.locator('#advances')).toHaveText('2');
  await page.evaluate(() => {
    history.pushState(null, '', '/contact');
    document.body.querySelector('#personal')?.remove();
    document.querySelector('h1')!.textContent = 'Contact us';
    document.querySelector('#next')!.innerHTML =
      '<label>Name<input name="name"></label><label>Email<input name="email"></label><label>Message<textarea name="message"></textarea></label>';
  });
  await expect(widget).toHaveCount(0);
});
