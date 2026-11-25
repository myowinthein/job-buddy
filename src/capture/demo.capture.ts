import { test, expect } from './fixtures';
import { serveDemo, ready, sample, publicURL } from './demoSupport';

test.use({ deviceScaleFactor: 3 });

test('capture the original demo public screenshot', async ({ context, page, extension }, info) => {
  test.skip(process.env.JB_CAPTURE_DEMO !== '1', 'Opt-in website screenshot capture.');
  await serveDemo(context);
  await extension.worker.evaluate(async (profile) => {
    await chrome.storage.local.set({
      profile,
      themePreference: 'light',
      quickFillPreferences: { enabled: true, disabledSites: [], position: { x: 0.075, y: 0.82 } },
    });
  }, sample.profile);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(publicURL);
  await ready(page, extension.send);
  const host = page.locator('[data-job-buddy-ui]');
  await host.getByRole('button', { name: 'Fill Form', exact: true }).click();
  // Wait for real filled content before producing the documentation image.
  await expect(host.getByRole('button', { name: 'View details' })).toBeVisible();
  await expect(page.locator('#first-name')).toHaveValue('Alex');
  await expect(page.locator('#email')).toHaveValue('alex.morgan@example.com');
  await expect(page.locator('#country')).toHaveValue('US');
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: info.outputPath('demo-autofill.png'),
    animations: 'disabled',
  });
});
