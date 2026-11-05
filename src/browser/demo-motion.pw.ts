import { writeFile } from 'node:fs/promises';
import { test, expect } from './fixtures';
import { serveDemo, ready, sample, publicURL } from './demoSupport';

// Record the actual extension flow with fictional data. The pointer is a
// recording overlay only; neither the public demo nor the extension is edited.
test.use({ deviceScaleFactor: 2 });

for (const theme of ['light', 'dark'] as const) {
  test(`record autofill demo in ${theme} mode`, async ({ context, page, extension }, info) => {
    test.skip(process.env.JB_CAPTURE_MOTION !== '1', 'Opt-in public demo recording.');
    test.setTimeout(90_000);
    await serveDemo(context);
    await context.addInitScript((theme) => localStorage.setItem('theme', theme), theme);
    await extension.worker.evaluate(
      async ({ profile, theme }) => {
        await chrome.storage.local.set({
          profile,
          themePreference: theme,
          quickFillPreferences: { enabled: true, disabledSites: [], position: { x: 0.06, y: 0.9 } },
        });
      },
      { profile: sample.profile, theme },
    );
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.goto(publicURL);
    await ready(page, extension.send);
    await expect(page.locator('#job-buddy-setup')).toBeHidden();
    await expect(page.locator('#first-name')).toHaveValue('');
    await expect(page.locator('#email')).toHaveValue('');
    const host = page.locator('[data-job-buddy-ui]');
    const button = host.getByRole('button', { name: 'Fill Form', exact: true });
    await expect(button).toBeVisible();
    await page.evaluate(() => {
      const cursor = document.createElement('div');
      cursor.dataset.recordingCursor = '';
      cursor.setAttribute('aria-hidden', 'true');
      cursor.style.cssText =
        'position:fixed;left:0;top:0;width:25px;height:32px;pointer-events:none;z-index:2147483647;';
      cursor.innerHTML =
        '<svg viewBox="0 0 25 32" width="25" height="32"><circle data-click-ring cx="5" cy="5" r="12" fill="none" stroke="#4b79f7" stroke-width="3" opacity="0"/><path d="M2 1v24l6-6 5 11 5-2-5-10h9Z" fill="white" stroke="#111827" stroke-width="1.6" stroke-linejoin="round"/></svg>';
      document.documentElement.append(cursor);
      document.addEventListener('pointermove', (event) => {
        cursor.style.left = `${event.clientX}px`;
        cursor.style.top = `${event.clientY}px`;
      });
    });
    const frames: { file: string; duration: number }[] = [];
    const frame = async (duration: number) => {
      const file = `frame-${String(frames.length).padStart(3, '0')}.png`;
      await page.screenshot({ path: info.outputPath(file), animations: 'disabled' });
      frames.push({ file, duration });
    };
    const start = { x: 900, y: 200 };
    await page.mouse.move(start.x, start.y);
    await frame(1.2);
    const box = await button.boundingBox();
    if (!box) throw new Error('Fill Form is unavailable for recording');
    const destination = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    for (let step = 1; step <= 18; step++) {
      const t = step / 18;
      const eased = t * t * (3 - 2 * t);
      await page.mouse.move(
        start.x + (destination.x - start.x) * eased,
        start.y + (destination.y - start.y) * eased,
      );
      await frame(1 / 15);
    }
    await page.mouse.down();
    await page.locator('[data-click-ring]').evaluate((ring) => ring.setAttribute('opacity', '1'));
    await frame(0.16);
    await page.mouse.up();
    await page.locator('[data-click-ring]').evaluate((ring) => ring.setAttribute('opacity', '0'));
    await expect(host.getByRole('button', { name: 'View details' })).toBeVisible();
    await expect(page.locator('#first-name')).toHaveValue('Alex');
    await expect(page.locator('#email')).toHaveValue('alex.morgan@example.com');
    await expect(page.locator('#country')).toHaveValue('US');
    await expect(page.locator('[name="consent"]')).not.toBeChecked();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await frame(0.4);
    for (let step = 1; step <= 6; step++) {
      await page.mouse.move(
        destination.x + ((450 - destination.x) * step) / 6,
        destination.y + ((150 - destination.y) * step) / 6,
      );
      await frame(1 / 15);
    }
    await frame(3);
    await writeFile(info.outputPath('frames.json'), JSON.stringify({ theme, frames }));
  });
}
