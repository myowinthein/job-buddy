import { test, expect, type BrowserContext } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const origin = 'http://127.0.0.1';
const prefix = '/job-buddy/';
const docs = resolve('docs');
async function serveSite(context: BrowserContext) {
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || !url.pathname.startsWith(prefix)) return route.abort();
    const relative = decodeURIComponent(url.pathname.slice(prefix.length));
    const path = resolve(docs, relative + (url.pathname.endsWith('/') ? 'index.html' : ''));
    if (!path.startsWith(docs + '/')) return route.abort();
    try {
      const contentType =
        {
          '.html': 'text/html',
          '.css': 'text/css',
          '.js': 'application/javascript',
          '.webp': 'image/webp',
          '.jpg': 'image/jpeg',
          '.png': 'image/png',
          '.svg': 'image/svg+xml',
          '.mp4': 'video/mp4',
        }[extname(path)] ?? 'application/octet-stream';
      await route.fulfill({ body: await readFile(path), contentType });
    } catch {
      await route.fulfill({ status: 404, body: 'Not found' });
    }
  });
}

test('walkthrough, themes, screenshots and developer navigation work under the GitHub Pages path', async ({
  context,
  page,
}) => {
  await serveSite(context);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(origin + prefix);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Same details.Next application.',
  );
  await page.getByRole('button', { name: 'Before autofill', exact: true }).click();
  await expect(page.locator('[data-comparison="before"]')).toBeVisible();
  await expect(page.locator('[data-comparison="after"]')).toBeHidden();
  await page.getByRole('button', { name: 'Enlarge empty demo form', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Screenshot viewer' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Enlarge empty demo form', exact: true }),
  ).toBeFocused();
  const geminiStates = page.getByRole('group', { name: 'Gemini setup screenshots' });
  await geminiStates.getByRole('button', { name: 'With a key', exact: true }).click();
  await expect(page.locator('#gemini-views-1')).toBeVisible();
  await expect(page.locator('#gemini-views-0')).toBeHidden();
  await geminiStates.getByRole('button', { name: 'Without a key', exact: true }).click();
  await expect(page.locator('#gemini-views-0')).toBeVisible();
  const mode = await page.locator('html').evaluate((el) => el.classList.contains('dark'));
  const themeToggle = page.locator('.theme-toggle');
  await expect(themeToggle).toHaveText('');
  await expect(themeToggle.locator(mode ? '.theme-sun' : '.theme-moon')).toBeVisible();
  await page.getByRole('button', { name: /Switch to .* mode/ }).click();
  await expect(page.locator('html')).toHaveClass(mode ? '' : 'dark');
  await expect(themeToggle.locator(mode ? '.theme-moon' : '.theme-sun')).toBeVisible();
  await expect(themeToggle.locator(mode ? '.theme-sun' : '.theme-moon')).toBeHidden();
  await expect(page.locator('[data-comparison="before"] img')).toHaveAttribute(
    'src',
    mode ? /-light\.webp(?:\?v=[a-f0-9]+)?$/ : /-dark\.webp(?:\?v=[a-f0-9]+)?$/,
  );
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'For developers' })
    .click();
  await expect(page).toHaveURL(origin + prefix + 'developers/');
  expect(await page.locator('html').evaluate((el) => el.classList.contains('dark'))).toBe(!mode);
  await expect(
    page.getByRole('heading', { name: 'Add only the integrations you need' }),
  ).toBeAttached();
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copy setup commands' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    'git clone https://github.com/myowinthein/job-buddy.git',
  );
  expect(errors).toEqual([]);
});

test('autofill recording plays, pauses, follows the theme, and stops offscreen', async ({
  context,
  page,
}) => {
  await serveSite(context);
  await page.goto(origin + prefix);
  const figure = page.locator('[data-demo-player]');
  const video = figure.locator('video');
  await figure.scrollIntoViewIfNeeded();
  await expect.poll(() => video.evaluate((el) => (el as HTMLVideoElement).videoWidth)).toBe(2880);
  await expect.poll(() => video.evaluate((el) => (el as HTMLVideoElement).paused)).toBe(false);
  await figure.getByRole('button', { name: 'Pause demo', exact: true }).click();
  const stopped = await video.evaluate((el) => (el as HTMLVideoElement).currentTime);
  await page.waitForTimeout(200);
  expect(await video.evaluate((el) => (el as HTMLVideoElement).currentTime)).toBe(stopped);
  await figure.getByRole('button', { name: 'Play demo', exact: true }).click();
  await expect.poll(() => video.evaluate((el) => (el as HTMLVideoElement).paused)).toBe(false);
  await page.getByRole('button', { name: /Switch to .* mode/ }).click();
  const dark = await page.locator('html').evaluate((el) => el.classList.contains('dark'));
  await expect(video).toHaveAttribute(
    'src',
    new RegExp(`autofill-${dark ? 'dark' : 'light'}\\.mp4`),
  );
  await expect.poll(() => video.evaluate((el) => (el as HTMLVideoElement).paused)).toBe(false);
  await figure.getByRole('button', { name: 'Before autofill', exact: true }).click();
  await expect(video).toBeHidden();
  expect(await video.evaluate((el) => (el as HTMLVideoElement).paused)).toBe(true);
  await figure.getByRole('button', { name: 'Watch demo', exact: true }).click();
  await expect.poll(() => video.evaluate((el) => (el as HTMLVideoElement).paused)).toBe(false);
  await page.locator('#profile').scrollIntoViewIfNeeded();
  await expect.poll(() => video.evaluate((el) => (el as HTMLVideoElement).paused)).toBe(true);
  await figure.scrollIntoViewIfNeeded();
  await expect.poll(() => video.evaluate((el) => (el as HTMLVideoElement).paused)).toBe(false);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(video).toBeHidden();
  expect(await video.evaluate((el) => (el as HTMLVideoElement).paused)).toBe(true);
});

test('reduced motion starts with a still and permits explicit playback', async ({
  context,
  page,
}) => {
  await serveSite(context);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(origin + prefix);
  const figure = page.locator('[data-demo-player]');
  const video = figure.locator('video');
  await expect(figure.locator('[data-comparison="after"]')).toBeVisible();
  expect(await video.getAttribute('src')).toBeNull();
  await figure.getByRole('button', { name: 'Watch demo', exact: true }).click();
  await expect.poll(() => video.evaluate((el) => (el as HTMLVideoElement).paused)).toBe(false);
  await figure.getByRole('button', { name: 'Pause demo', exact: true }).click();
  expect(await video.evaluate((el) => (el as HTMLVideoElement).paused)).toBe(true);
});

test('an unavailable recording falls back to the completed still', async ({ context, page }) => {
  await serveSite(context);
  await context.route('**/assets/videos/**', (route) => route.abort());
  await page.goto(origin + prefix);
  const figure = page.locator('[data-demo-player]');
  await figure.scrollIntoViewIfNeeded();
  await expect(figure.getByRole('button', { name: 'Watch demo', exact: true })).toBeHidden();
  await expect(figure.locator('[data-comparison="after"]')).toBeVisible();
  await expect(figure.locator('video')).toBeHidden();
});

test('demo opens separately, offers installation guidance, and rechecks availability', async ({
  context,
  page,
}, info) => {
  await serveSite(context);
  await page.goto(origin + prefix);
  const links = page.locator('a[href="./demo/"]');
  await expect(links).toHaveCount(2);
  for (const link of await links.all()) {
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  }
  const [demo] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('link', { name: 'Try it on a demo form', exact: true }).click(),
  ]);
  await expect(demo).toHaveURL(origin + prefix + 'demo/');
  expect(await demo.evaluate(() => window.opener === null)).toBe(true);
  await expect(page).toHaveURL(origin + prefix);
  const notice = demo.locator('#job-buddy-setup');
  await expect(notice).toHaveAttribute('data-status', 'not-detected');
  await expect(notice).toBeVisible();
  await expect(notice.getByRole('link', { name: 'Add to Chrome' })).toHaveAttribute(
    'href',
    'https://chromewebstore.google.com/detail/job-buddy/oaadklbdofbaanfcijknaehfkbekdmbk',
  );
  await demo.getByLabel('First name', { exact: false }).fill('Sample');
  await expect(demo.getByLabel('First name', { exact: false })).toHaveValue('Sample');
  await notice.screenshot({ path: info.outputPath('installation-guidance.png') });
  // Ignore a response to an earlier/different request.
  await demo.evaluate(() =>
    window.postMessage(
      {
        channel: 'job-buddy-demo',
        type: 'presence-response',
        requestId: 'stale',
      },
      location.origin,
    ),
  );
  await expect(notice).toBeVisible();
  // Simulate a late extension injection after the initial detection timed out.
  await demo.evaluate(() => {
    const reply = (event: MessageEvent) => {
      if (event.data?.type !== 'presence-request') return;
      window.removeEventListener('message', reply);
      window.postMessage(
        {
          channel: 'job-buddy-demo',
          type: 'presence-response',
          requestId: event.data.requestId,
        },
        location.origin,
      );
    };
    window.addEventListener('message', reply);
    window.postMessage({ channel: 'job-buddy-demo', type: 'presence-ready' }, location.origin);
  });
  await expect(notice).toHaveAttribute('data-status', 'detected');
  await expect(notice).toBeHidden();
  await demo.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(notice).toHaveAttribute('data-status', 'not-detected');
  await expect(notice).toBeVisible();
  await demo.close();
});

test('task links open new tabs with a visual hint and accessible description', async ({
  context,
  page,
}) => {
  await serveSite(context);
  const taskHosts = new Set([
    'chromewebstore.google.com',
    'aistudio.google.com',
    'console.cloud.google.com',
  ]);
  for (const path of ['', 'developers/', 'demo/']) {
    await page.goto(origin + prefix + path);
    for (const link of await page.locator('a[href]').all()) {
      const href = await link.getAttribute('href');
      const url = new URL(href!, page.url());
      const newTab =
        taskHosts.has(url.hostname) ||
        (!href!.startsWith('#') && url.pathname === prefix + 'demo/');
      if (newTab) {
        await expect(link).toHaveAttribute('target', '_blank');
        await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
        await expect(link).toHaveAccessibleDescription('Opens in a new tab.');
        const icon = link.locator('svg.new-tab-icon[aria-hidden="true"]');
        await expect(icon).toHaveCount(1);
        await expect(icon.locator('use')).toHaveAttribute(
          'href',
          /external-link\.svg#external-link$/,
        );
        // The shared SVG symbol must load, including on the standalone demo.
        await expect
          .poll(() => icon.evaluate((el: SVGSVGElement) => el.getBBox().width))
          .toBeGreaterThan(0);
      } else {
        expect(await link.getAttribute('target')).not.toBe('_blank');
      }
    }
  }
  // Intercept the destination so this check never visits the store or creates a key.
  await page.goto(origin + prefix);
  await context.route('https://chromewebstore.google.com/**', (route) =>
    route.fulfill({ body: 'Store preview' }),
  );
  const [store] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('link', { name: 'Add to Chrome', exact: true }).click(),
  ]);
  await expect(store).toHaveURL(/chromewebstore\.google\.com/);
  expect(await store.evaluate(() => window.opener === null)).toBe(true);
  await expect(page).toHaveURL(origin + prefix);
  await store.close();
});

for (const density of [1, 2, 3]) {
  test.describe(`screenshot clarity at ${density}× density`, () => {
    test.use({ deviceScaleFactor: density });
    test('inline images and the viewer stay within their source resolution', async ({
      context,
      page,
    }, info) => {
      test.setTimeout(60_000);
      await serveSite(context);
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(origin + prefix);
      await page.locator('#rule-methods > summary').click();
      for (const theme of ['light', 'dark']) {
        if (
          (await page.locator('html').evaluate((el) => el.classList.contains('dark'))) !==
          (theme === 'dark')
        )
          await page.getByRole('button', { name: /Switch to .* mode/ }).click();
        for (const image of await page.locator('[data-enlarge] img').all()) {
          const comparison = await image.evaluate(
            (img) => img.closest<HTMLElement>('[data-comparison]')?.dataset.comparison,
          );
          if (comparison) await page.locator(`[data-compare] [data-show="${comparison}"]`).click();
          const panelId = await image.evaluate((img) => img.closest('[data-visual-panel]')?.id);
          if (panelId) await page.locator(`[aria-controls="${panelId}"]`).click();
          else if (!(await image.isVisible())) continue;
          await image.scrollIntoViewIfNeeded();
          await image.evaluate((img: HTMLImageElement) => img.decode());
          const dimensions = await image.evaluate((img: HTMLImageElement) => ({
            source: img.naturalWidth,
            logical: Number(img.getAttribute('width')),
            rendered: img.getBoundingClientRect().width,
          }));
          expect(dimensions.source).toBeGreaterThanOrEqual(dimensions.logical * 3);
          expect(dimensions.rendered).toBeLessThanOrEqual(dimensions.logical);
          expect(dimensions.rendered * density).toBeLessThanOrEqual(dimensions.source);
          await image.locator('..').click();
          const enlarged = page.locator('.image-dialog img');
          await enlarged.evaluate((img: HTMLImageElement) => img.decode());
          for (const width of [1440, 390]) {
            await page.setViewportSize({ width, height: 1000 });
            await expect
              .poll(() =>
                enlarged.evaluate(
                  (img: HTMLImageElement) =>
                    img.getBoundingClientRect().width * devicePixelRatio <= img.naturalWidth + 1,
                ),
              )
              .toBe(true);
            expect(
              await page
                .locator('.image-dialog')
                .evaluate((el) => el.getBoundingClientRect().width),
            ).toBeLessThanOrEqual(width);
          }
          await page.keyboard.press('Escape');
          await page.setViewportSize({ width: 1440, height: 1000 });
        }
      }
      await page.locator('[aria-controls="resume-views-2"]').click();
      const review = page.locator('#resume [data-enlarge] img[src*="/review-dark"]');
      await review.locator('..').click();
      await page.locator('.image-dialog img').evaluate((img: HTMLImageElement) => img.decode());
      await page.screenshot({ path: info.outputPath('review-viewer.png'), animations: 'disabled' });
    });
  });
}

test('screenshot selectors work with mouse, keyboard, themes, and narrow layouts', async ({
  context,
  page,
}, info) => {
  await serveSite(context);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(origin + prefix);
    for (const theme of ['light', 'dark']) {
      if (
        (await page.locator('html').evaluate((el) => el.classList.contains('dark'))) !==
        (theme === 'dark')
      )
        await page.getByRole('button', { name: /Switch to .* mode/ }).click();
      await page.locator('#rule-methods').evaluate((el: HTMLDetailsElement) => {
        el.open = true;
      });
      for (const tour of await page.locator('[data-visual-tour]').all()) {
        for (const button of await tour.locator('[data-show-visual]').all()) {
          await button.click();
          await expect(button).toHaveAttribute('aria-pressed', 'true');
          await expect(tour.locator('[data-visual-panel]:visible')).toHaveCount(1);
          const panel = tour.locator('[data-visual-panel]:visible');
          const image = panel.locator('img');
          if (await image.count()) {
            await image.evaluate((img: HTMLImageElement) => img.decode());
            await expect(image).toHaveAttribute('src', new RegExp(`-${theme}\\.webp`));
          } else {
            await expect(panel).toHaveAttribute('id', 'rule-autocomplete');
            await expect(panel.locator('pre')).toContainText('autocomplete="email"');
            await expect(panel.locator('.rule-trace')).toContainText('personal.email');
            await expect(panel.locator('.rule-trace')).toContainText('95%');
          }
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true);
        }
      }
    }
    const resume = page.locator('#resume');
    const first = resume.locator('[data-show-visual]').first();
    await first.focus();
    await page.keyboard.press('End');
    await expect(resume.locator('[data-show-visual]').last()).toBeFocused();
    await page.keyboard.press('Home');
    await expect(first).toBeFocused();
    await expect(first).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(resume.locator('[data-show-visual]').nth(1)).toBeFocused();
    await expect(resume.locator('.visual-status')).toContainText('2 of 3');
    await resume.screenshot({
      path: info.outputPath(`resume-${width}.png`),
      animations: 'disabled',
    });
  }
  expect(errors).toEqual([]);
});

test('all walkthrough images remain available without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    await serveSite(context);
    const page = await context.newPage();
    await page.goto(origin + prefix);
    await page.locator('#rule-methods > summary').click();
    for (const panel of await page.locator('[data-visual-panel]').all())
      await expect(panel).toBeVisible();
    await expect(page.locator('[data-visual-nav]:visible')).toHaveCount(0);
  } finally {
    await context.close();
  }
});

for (const theme of ['light', 'dark'] as const) {
  test(`all public pages fit narrow and wide screens in ${theme} mode`, async ({
    context,
    page,
  }, info) => {
    test.setTimeout(60_000);
    await serveSite(context);
    await page.addInitScript((theme) => localStorage.setItem('theme', theme), theme);
    const failures: string[] = [];
    page.on('pageerror', (error) => failures.push(error.message));
    page.on('response', (response) => {
      if (response.status() >= 400) failures.push(response.url());
    });
    for (const path of ['', 'developers/', 'demo/', '404.html']) {
      for (const width of [320, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.goto(origin + prefix + path);
        if (path === 'demo/') await expect(page.locator('#job-buddy-setup')).toBeVisible();
        await expect(page.locator('html')).toHaveClass(theme === 'dark' ? 'dark' : '');
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `${path} at ${width}px`,
        ).toBe(true);
        // Visit each section so lazy screenshots load and long content gets checked.
        for (const section of await page.locator('main > section[id]').all()) {
          await section.scrollIntoViewIfNeeded();
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true);
        }
        await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
        if (width > 800 && (path === '' || path === 'developers/'))
          await expect(page.locator('.chapter-nav [aria-current="location"]')).toHaveAttribute(
            'href',
            path === 'developers/' ? '#build' : '#start',
          );
        await expect
          .poll(() =>
            page.locator('img[src]').evaluateAll(
              (images) =>
                images.filter((image) => {
                  const img = image as HTMLImageElement;
                  return img.loading !== 'lazy' && (!img.complete || img.naturalWidth === 0);
                }).length,
            ),
          )
          .toBe(0);
        if (width === 390 || width === 1440)
          await page.screenshot({
            path: info.outputPath(`${path.replaceAll('/', '') || 'home'}-${width}.png`),
            animations: 'disabled',
          });
      }
    }
    expect(failures).toEqual([]);
  });
}

test('legacy overview links redirect and the guide works with storage blocked', async ({
  context,
  page,
}) => {
  await serveSite(context);
  await page.goto(origin + prefix + 'project-site/#tech');
  await expect(page).toHaveURL(origin + prefix + 'developers/');
  await page.addInitScript(() =>
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Blocked', 'SecurityError');
      },
    }),
  );
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(origin + prefix);
  await page.getByRole('button', { name: /Switch to .* mode/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(errors).toEqual([]);
});
