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
    'One profile.Fill every application.',
  );
  const screenshot = page.getByRole('button', {
    name: 'Enlarge screenshot: AI Features before adding a Gemini key', exact: true,
  });
  await screenshot.click();
  await expect(page.getByRole('dialog', { name: 'Screenshot viewer' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(screenshot).toBeFocused();
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
  await expect(page.locator('#gemini-views-0 img')).toHaveAttribute(
    'src',
    mode ? /-light\.webp(?:\?v=[a-f0-9]+)?$/ : /-dark\.webp(?:\?v=[a-f0-9]+)?$/,
  );
  const learnedDetails = page.locator('#learned-matching');
  const learnedLink = page.locator('#fill-details ol').getByRole('link', {
    name: 'Learned mappings', exact: true,
  });
  await expect(learnedDetails).not.toHaveAttribute('open');
  await learnedLink.click();
  await expect(page).toHaveURL(origin + prefix + '#learned-matching');
  await expect(learnedDetails).toHaveAttribute('open', '');
  await expect(learnedDetails.locator('summary')).toBeInViewport();
  await expect(learnedDetails.locator('ul > li')).toHaveCount(2);
  await learnedDetails.locator('summary').click();
  const learningIntro = page.locator('#learned-mappings > p.prose').first();
  const introLines = await learningIntro.evaluate((el) =>
    el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight),
  );
  expect(introLines).toBeLessThanOrEqual(2.01);
  await learningIntro.getByRole('link', { name: 'how learned mappings work' }).click();
  await expect(learnedDetails).toHaveAttribute('open', '');
  await expect(learnedDetails.locator('summary')).toBeInViewport();
  await learnedDetails.locator('summary').click();
  await learnedLink.focus();
  await page.keyboard.press('Enter');
  await expect(learnedDetails).toHaveAttribute('open', '');
  await page.reload();
  await expect(learnedDetails).toHaveAttribute('open', '');
  const ruleDetails = page.locator('#rule-methods');
  const rulesLink = page.locator('#fill-details ol').getByRole('link', { name: 'Rules', exact: true });
  await expect(ruleDetails).not.toHaveAttribute('open');
  await rulesLink.click();
  await expect(page).toHaveURL(origin + prefix + '#rule-methods');
  await expect(ruleDetails).toHaveAttribute('open', '');
  await expect(ruleDetails.locator('summary')).toBeInViewport();
  await ruleDetails.locator('summary').click();
  await rulesLink.focus();
  await page.keyboard.press('Enter');
  await expect(ruleDetails).toHaveAttribute('open', '');
  await page.reload();
  await expect(ruleDetails).toHaveAttribute('open', '');
  const aiDetails = page.locator('#ai-matching');
  const aiLink = page.locator('#fill-details ol').getByRole('link', { name: 'AI', exact: true });
  await expect(aiDetails).not.toHaveAttribute('open');
  await aiLink.click();
  await expect(page).toHaveURL(origin + prefix + '#ai-matching');
  await expect(aiDetails).toHaveAttribute('open', '');
  await expect(aiDetails.locator('summary')).toBeInViewport();
  await expect(aiDetails.locator('ol > li')).toHaveCount(0);
  await expect(aiDetails.locator('ul > li')).toHaveCount(3);
  await expect(aiDetails).toContainText('saved profile fields and their values');
  await aiDetails.locator('summary').click();
  await aiLink.focus();
  await page.keyboard.press('Enter');
  await expect(aiDetails).toHaveAttribute('open', '');
  await page.reload();
  await expect(aiDetails).toHaveAttribute('open', '');
  const jsonChoice = page.locator('#json-profile-choice');
  await jsonChoice.locator('summary').click();
  await jsonChoice.getByRole('link', { name: 'Update or Replace choices as resume import' }).click();
  await expect(page).toHaveURL(origin + prefix + '#resume-profile-choice');
  await expect(page.locator('#resume-profile-choice')).toHaveAttribute('open', '');
  await expect(page.locator('#resume-profile-choice > summary')).toBeInViewport();
  await page.locator('#resume-profile-choice > summary').click();
  const driveChoice = page.locator('#drive-profile-choice');
  await driveChoice.locator('summary').click();
  await driveChoice.getByRole('link', { name: 'Update or Replace choices as resume import' }).click();
  await expect(page).toHaveURL(origin + prefix + '#resume-profile-choice');
  await expect(page.locator('#resume-profile-choice')).toHaveAttribute('open', '');
  await expect(page.locator('#resume-profile-choice > summary')).toBeInViewport();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'For developers' })
    .click();
  await expect(page).toHaveURL(origin + prefix + 'developers/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Develop Job Buddy');
  const developerActions = page.locator('#start .intro-actions a');
  await expect(developerActions).toHaveText(['Explore the source', 'Add to Chrome']);
  await expect(developerActions.first()).toHaveClass('button primary');
  await expect(page.locator('#start').getByRole('link', { name: 'MIT licensed' }))
    .toHaveAttribute('href', 'https://github.com/myowinthein/job-buddy/blob/main/LICENSE');
  expect(await page.locator('html').evaluate((el) => el.classList.contains('dark'))).toBe(!mode);
  await expect(
    page.getByRole('heading', { name: 'Environment files', exact: true }),
  ).toBeAttached();
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copy setup commands' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    'git clone https://github.com/myowinthein/job-buddy.git',
  );
  await page.getByRole('link', { name: 'OAuth client ID', exact: true }).click();
  await expect(page.locator('#drive-oauth')).toHaveAttribute('open', '');
  await expect(page.locator('#drive-oauth > summary')).toBeInViewport();
  await page.reload();
  await expect(page.locator('#drive-oauth')).toHaveAttribute('open', '');
  await expect(page.locator('#dev-bar > p.prose')).toHaveCount(3);
  await expect(page.locator('#dev-bar details')).toHaveCount(0);
  await page.getByRole('button', { name: 'Copy UI preview command', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('pnpm dev:preview');
  expect(errors).toEqual([]);
});

test('command tabs support keyboard navigation, copying and links to hidden instructions', async ({
  context,
  page,
}) => {
  await serveSite(context);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(origin + prefix + 'developers/#commands');
  const tabs = page.getByRole('tablist', { name: 'Command purpose' });
  await expect(tabs.getByRole('tab', { name: 'Develop', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).toHaveCount(1);
  await tabs.getByRole('tab', { name: 'Develop', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.getByRole('tab', { name: 'Check', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Copy TypeScript check command' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('pnpm compile');
  await tabs.getByRole('tab', { name: 'Check', exact: true }).focus();
  await page.keyboard.press('End');
  await expect(tabs.getByRole('tab', { name: 'Capture', exact: true })).toBeFocused();
  await page.locator('#website-captures > summary').click();
  await page.getByRole('button', { name: 'Copy capture preview command' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    '# Terminal 1 (keep running)\npnpm dev:preview',
  );
  await page.getByRole('button', { name: 'Copy website capture commands' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    '# Terminal 2\npnpm build\nnode scripts/capture-site.mjs',
  );
  await page.goto(origin + prefix + 'developers/#preview-commands');
  await expect(tabs.getByRole('tab', { name: 'Develop', exact: true })).toHaveAttribute('aria-selected', 'true');
  await tabs.getByRole('tab', { name: 'Capture', exact: true }).click();
  // Reloading restores the instructions selected by the URL, including their tab.
  await page.reload();
  await expect(tabs.getByRole('tab', { name: 'Develop', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: 'Copy UI preview command' })).toBeVisible();
  await page.goto(origin + prefix + 'developers/#browser-commands');
  await expect(tabs.getByRole('tab', { name: 'Check', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#browser-commands')).toHaveAttribute('open', '');
  await expect(page.locator('#browser-commands > summary')).toBeInViewport();
  await page.evaluate(() => { location.hash = '#demo'; });
  await expect(tabs.getByRole('tab', { name: 'Capture', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Copy demo capture commands' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'pnpm build\nnode scripts/capture-demo.mjs\nnode scripts/capture-demo-motion.mjs',
  );
  await page.goBack();
  await expect(tabs.getByRole('tab', { name: 'Check', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#browser-commands > summary')).toBeInViewport();
});

test('command instructions remain available without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    await serveSite(context);
    const page = await context.newPage();
    await page.goto(origin + prefix + 'developers/#commands');
    await expect(page.getByRole('tablist', { name: 'Command purpose' })).toBeHidden();
    await expect(page.getByRole('tabpanel')).toHaveCount(4);
    await page.locator('#demo > summary').click();
    await expect(page.locator('#video-capture pre')).toContainText('node scripts/capture-demo-motion.mjs');
  } finally {
    await context.close();
  }
});

test('autofill recording autoplays without controls, follows the theme, and stops offscreen', async ({
  context,
  page,
}) => {
  await serveSite(context);
  await page.goto(origin + prefix);
  const figure = page.locator('[data-demo-player]');
  const video = figure.locator('video');
  await expect(figure.locator('button, figcaption, [data-compare]')).toHaveCount(0);
  expect(await video.evaluate((el) => (el as HTMLVideoElement).controls)).toBe(false);
  await figure.scrollIntoViewIfNeeded();
  await expect.poll(() => video.evaluate((el) => (el as HTMLVideoElement).videoWidth)).toBe(2880);
  await expect.poll(() => video.evaluate((el) => (el as HTMLVideoElement).paused)).toBe(false);
  await expect(figure.locator('[data-demo-still]')).toBeHidden();
  await page.getByRole('button', { name: /Switch to .* mode/ }).click();
  const dark = await page.locator('html').evaluate((el) => el.classList.contains('dark'));
  await expect(video).toHaveAttribute(
    'src',
    new RegExp(`autofill-${dark ? 'dark' : 'light'}\\.mp4`),
  );
  await expect.poll(() => video.evaluate((el) => (el as HTMLVideoElement).paused)).toBe(false);
  await page.locator('#profile').scrollIntoViewIfNeeded();
  await expect.poll(() => video.evaluate((el) => (el as HTMLVideoElement).paused)).toBe(true);
  await figure.scrollIntoViewIfNeeded();
  await expect.poll(() => video.evaluate((el) => (el as HTMLVideoElement).paused)).toBe(false);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(video).toBeHidden();
  expect(await video.evaluate((el) => (el as HTMLVideoElement).paused)).toBe(true);
  await expect(figure.locator('[data-demo-still]')).toBeVisible();
});

test('reduced motion starts with a still and resumes autoplay when disabled', async ({
  context,
  page,
}) => {
  await serveSite(context);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(origin + prefix);
  const figure = page.locator('[data-demo-player]');
  const video = figure.locator('video');
  await figure.scrollIntoViewIfNeeded();
  await expect(figure.locator('[data-demo-still]')).toBeVisible();
  expect(await video.getAttribute('src')).toBeNull();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect.poll(() => video.evaluate((el) => (el as HTMLVideoElement).paused)).toBe(false);
  await expect(figure.locator('[data-demo-still]')).toBeHidden();
});

test('an unavailable recording falls back to the completed still', async ({ context, page }) => {
  await serveSite(context);
  await context.route('**/assets/videos/**', (route) => route.abort());
  await page.goto(origin + prefix);
  const figure = page.locator('[data-demo-player]');
  await figure.scrollIntoViewIfNeeded();
  await expect(figure.locator('[data-demo-still]')).toBeVisible();
  await expect(figure.locator('video')).toBeHidden();
});

test('demo opens separately, offers installation guidance, and rechecks availability', async ({
  context,
  page,
}, info) => {
  await serveSite(context);
  await page.goto(origin + prefix);
  const links = page.locator('a[href="./demo/"]');
  await expect(links).toHaveCount(1);
  for (const link of await links.all()) {
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  }
  const [demo] = await Promise.all([
    context.waitForEvent('page'),
    links.click(),
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
    'chrome.google.com',
    'aistudio.google.com',
    'console.cloud.google.com',
  ]);
  const toolPages = new Set([
    'https://nodejs.org/en/download',
    'https://pnpm.io/installation#installing-a-specific-version',
    'https://git-scm.com/install/',
    'https://www.google.com/chrome/',
    'https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3',
    'https://wxt.dev/',
    'https://react.dev/',
    'https://www.typescriptlang.org/',
    'https://tailwindcss.com/',
    'https://vitest.dev/',
    'https://playwright.dev/',
  ]);
  for (const path of ['', 'developers/', 'demo/']) {
    await page.goto(origin + prefix + path);
    for (const link of await page.locator('a[href]').all()) {
      const href = await link.getAttribute('href');
      const url = new URL(href!, page.url());
      const newTab =
        taskHosts.has(url.hostname) ||
        toolPages.has(url.href) ||
        (!href!.startsWith('#') && url.pathname === prefix + 'demo/');
      if (newTab) {
        const panelId = await link.evaluate((el) => el.closest('[role="tabpanel"]')?.id);
        if (panelId) await page.locator(`[role="tab"][aria-controls="${panelId}"]`).click();
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
          } else if ((await panel.getAttribute('id')) === 'rule-context') {
            await expect(panel.locator('pre')).toContainText('<p>City</p>');
            await expect(panel.locator('pre')).toContainText('placeholder="Enter your answer"');
            await expect(panel.locator('.rule-trace')).toContainText('Nearby text: “City”');
            await expect(panel.locator('.rule-trace')).toContainText('Address → City');
            await expect(panel.locator('.rule-trace')).toContainText('70%');
            await expect(panel.locator('.rule-trace')).toContainText('Seattle');
          } else if ((await panel.getAttribute('id')) === 'rule-current') {
            await expect(panel.locator('pre')).toContainText('<input type="checkbox">');
            await expect(panel.locator('pre')).toContainText('<legend>Work experience</legend>');
            await expect(panel.locator('.rule-trace')).toContainText('Currently working here');
            await expect(panel.locator('.rule-trace')).toContainText('Work History → Example Studio → Current job');
            await expect(panel.locator('.rule-trace')).toContainText('85%');
            await expect(panel.locator('.rule-trace')).toContainText('Checked');
          } else if ((await panel.getAttribute('id')) === 'rule-custom') {
            await expect(panel.locator('pre')).toContainText('<label for="entry">Design journal</label>');
            await expect(panel.locator('.rule-trace')).toContainText('designjournal');
            await expect(panel.locator('.rule-trace')).toContainText('Links → Custom Links → Design journal');
            await expect(panel.locator('.rule-trace')).toContainText('85%');
            await expect(panel.locator('.rule-trace')).toContainText('https://example.com/alex/journal');
          } else if ((await panel.getAttribute('id')) === 'rule-similar') {
            await expect(panel.locator('pre')).toContainText('<label for="entry">First nam</label>');
            await expect(panel.locator('.rule-trace')).toContainText('Personal → First Name');
            await expect(panel.locator('.rule-trace')).toContainText('76%');
            await expect(panel.locator('.rule-trace')).toContainText('88.9% similarity × 0.85');
            await expect(panel.locator('.rule-trace')).toContainText('Alex');
          } else if ((await panel.getAttribute('id')) === 'rule-exact') {
            await expect(panel.locator('pre')).toContainText('<label for="entry">First name</label>');
            await expect(panel.locator('.rule-trace')).toContainText('firstname');
            await expect(panel.locator('.rule-trace')).toContainText('Personal → First Name');
            await expect(panel.locator('.rule-trace')).toContainText('85%');
            await expect(panel.locator('.rule-trace')).toContainText('Alex');
          } else {
            await expect(panel).toHaveAttribute('id', 'rule-autocomplete');
            await expect(panel.locator('pre')).toContainText('autocomplete="email"');
            await expect(panel.locator('.rule-trace')).toContainText('Personal → Email');
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

test('reading text uses the same responsive width across the documentation site', async ({
  context,
  page,
}) => {
  await serveSite(context);
  for (const path of ['', 'developers/', 'legal/privacy/', 'legal/disclaimer/', '404.html']) {
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(origin + prefix + path);
      await page.locator('.detail-list details').evaluateAll((items) => {
        items.forEach((item) => { (item as HTMLDetailsElement).open = true; });
      });
      const readingWidth = await page.evaluate(() =>
        parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--reading-width')),
      );
      expect(readingWidth, path).toBe(730);
      const oversized = await page.locator('main p, main ul, main ol, main dd, main figcaption')
        .evaluateAll((items, limit) => items
          .filter((item) => !item.classList.contains('pipeline'))
          .filter((item) => item.getBoundingClientRect().width > limit + 1)
          .map((item) => `${item.tagName}.${item.className}: ${item.getBoundingClientRect().width}`),
        readingWidth);
      expect(oversized, `${path} at ${width}px`).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (width === 1440 && path === '')
        expect(await page.locator('.hero-figure').evaluate((el) => el.getBoundingClientRect().width))
          .toBeGreaterThan(readingWidth);
      if (width === 1440 && path === 'developers/') {
        expect(await page.locator('.table-scroll').first().evaluate((el) => el.getBoundingClientRect().width))
          .toBeGreaterThan(readingWidth);
        expect(await page.locator('.code-block').first().evaluate((el) => el.getBoundingClientRect().width))
          .toBeGreaterThan(readingWidth);
      }
    }
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
        if (path === 'developers/') {
          const boundaries = await page.locator('main > .chapter').evaluateAll((chapters) =>
            chapters.slice(1).map((chapter, index) => ({
              from: chapters[index].id,
              to: chapter.id,
              gap: chapter.getBoundingClientRect().top - chapters[index].getBoundingClientRect().bottom,
            })),
          );
          for (const boundary of boundaries)
            expect(boundary.gap, `${boundary.from} → ${boundary.to} at ${width}px`).toBe(0);
        }
        await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
        if (width > 800 && (path === '' || path === 'developers/'))
          await expect(page.locator('.chapter-nav [aria-current="location"]')).toHaveAttribute(
            'href',
            '#start',
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
