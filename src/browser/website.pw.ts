import { test, expect, type BrowserContext, type Locator } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fitsViewportWidth } from './layout';
import { visibleDividerGaps } from './dividerGeometry';

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

async function expectVisibleFocus(control: Locator) {
  await control.page().keyboard.press('Tab');
  await control.focus();
  await expect(control).toHaveCSS('outline-style', 'solid');
  expect(
    await control.evaluate((element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      const expansion = Math.max(0, parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset));
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const css = getComputedStyle(parent);
        if (css.position === 'fixed') break;
        const clip = parent.getBoundingClientRect();
        if (
          /auto|scroll|hidden|clip/.test(css.overflowX) &&
          (box.left - expansion < clip.left - 1 || box.right + expansion > clip.right + 1)
        ) return false;
        if (
          /auto|scroll|hidden|clip/.test(css.overflowY) &&
          (box.top - expansion < clip.top - 1 || box.bottom + expansion > clip.bottom + 1)
        ) return false;
      }
      return element.matches(':focus-visible') && parseFloat(style.outlineWidth) >= 2;
    }),
  ).toBe(true);
}

test('keyboard outlines stay visible inside documentation navigation, captures, tables and command tabs', async ({ context, page }) => {
  await serveSite(context);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const theme of ['light', 'dark']) {
    await page.addInitScript((theme) => localStorage.setItem('job-buddy-theme', theme), theme);
    for (const path of ['', 'developers/']) {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(origin + prefix + path);
      await expectVisibleFocus(page.locator('.chapter-nav a').first());
      await expectVisibleFocus(page.locator('[data-enlarge]').first());
      if (path === 'developers/') {
        await expectVisibleFocus(page.locator('#tech-stack .table-scroll a').first());
        await expectVisibleFocus(page.getByRole('tab', { name: 'Develop', exact: true }));
        await page.keyboard.press('ArrowRight');
        await expectVisibleFocus(page.getByRole('tab', { name: 'Check', exact: true }));
      }
    }
  }
});

test('external link text and arrow share the same focus boundary', async ({ context, page }) => {
  await serveSite(context);
  const links = [
    ['', 'a[href="https://aistudio.google.com/api-keys"]'],
    ['developers/', 'a[href$="/LICENSE"]'],
    ['developers/', 'a[href*="what-is-mv3"]'],
    ['developers/', 'a[href="https://tailwindcss.com/"]'],
    ['developers/', 'a[href="https://www.google.com/chrome/"]'],
    ['developers/', '#release a[href="https://chrome.google.com/webstore/devconsole"]'],
  ];
  for (const theme of ['light', 'dark']) {
    await page.addInitScript(theme => localStorage.setItem('job-buddy-theme', theme), theme);
    for (const width of [320, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [path, selector] of links) {
        await page.goto(origin + prefix + path);
        const link = page.locator(selector).first();
        await expectVisibleFocus(link);
        const bounds = await link.evaluate(element => ({
          link: element.getBoundingClientRect().toJSON(),
          tail: element.querySelector('.external-link-tail')!.getBoundingClientRect().toJSON(),
        }));
        expect(bounds.tail.top).toBeGreaterThanOrEqual(bounds.link.top - 1);
        expect(bounds.tail.bottom).toBeLessThanOrEqual(bounds.link.bottom + 1);
      }
    }
  }
});

test('shared headers and footers work on every Job Buddy page without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  await serveSite(context);
  const page = await context.newPage();
  const { version } = JSON.parse(await readFile(resolve('package.json'), 'utf8'));
  try {
    for (const path of ['', 'developers/', 'legal/privacy/', 'legal/disclaimer/', '404.html']) {
      for (const width of [320, 800, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(origin + prefix + path);
        const header = page.locator('body > .site-header');
        const footer = page.locator('body > .site-footer');
        await expect(header).toHaveCount(1);
        await expect(footer).toHaveCount(1);
        await expect(header.getByRole('link', { name: `Version ${version} release notes` }))
          .toHaveAttribute('href', `https://github.com/myowinthein/job-buddy/releases/tag/v${version}`);
        await expect(header.getByRole('link', { name: 'For developers' })).toHaveJSProperty('href', origin + prefix + 'developers/');
        await expect(footer.getByRole('link', { name: 'Privacy Policy' })).toHaveJSProperty('href', origin + prefix + 'legal/privacy/');
        await expect(footer.getByRole('link', { name: 'Disclaimer', exact: true })).toHaveJSProperty('href', origin + prefix + 'legal/disclaimer/');
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        expect(await fitsViewportWidth(page)).toBe(true);
        const current = header.locator('[aria-current="page"]');
        await expect(current).toHaveCount(path === '' || path === 'developers/' ? 1 : 0);
        if (path === 'developers/') await expect(current).toHaveText('For developers');
      }
    }
  } finally {
    await context.close();
  }
});

test('the shared error-page layout resolves navigation from a nested missing URL', async ({ context, page }) => {
  await serveSite(context);
  const missing = origin + prefix + 'missing/nested/page';
  await context.route(missing, async (route) => route.fulfill({
    status: 404,
    contentType: 'text/html',
    body: await readFile(resolve(docs, '404.html')),
  }));
  await page.goto(missing);
  await expect(page.locator('.site-header .brand')).toHaveJSProperty('href', origin + prefix);
  await expect(page.locator('.site-header').getByRole('link', { name: 'For developers' }))
    .toHaveJSProperty('href', origin + prefix + 'developers/');
  await expect(page.locator('.site-footer').getByRole('link', { name: 'Privacy Policy' }))
    .toHaveJSProperty('href', origin + prefix + 'legal/privacy/');
  await page.getByRole('link', { name: 'Back to Job Buddy', exact: true }).click();
  await expect(page).toHaveURL(origin + prefix);
});

test('public pages expose canonical search metadata and exclude demo and error pages', async ({ context, page }) => {
  await serveSite(context);
  const sitemap = await readFile(resolve(docs, 'sitemap.xml'), 'utf8');
  for (const path of ['', 'developers/', 'legal/privacy/', 'legal/disclaimer/']) {
    await page.goto(origin + prefix + path);
    const canonical = 'https://myowinthein.github.io/job-buddy/' + path;
    await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute('href', canonical);
    await expect(page.locator('head meta[name="description"]')).toHaveAttribute('content', /\S/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    expect(sitemap).toContain(`<loc>${canonical}</loc>`);
    if (!path.startsWith('legal/')) {
      await expect(page.locator('head meta[property="og:url"]')).toHaveAttribute('content', canonical);
      await expect(page.locator('head meta[property="og:image:alt"]')).toHaveAttribute('content', /\S/);
    }
  }
  for (const path of ['demo/', '404.html']) {
    await page.goto(origin + prefix + path);
    await expect(page.locator('head meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    expect(sitemap).not.toContain('https://myowinthein.github.io/job-buddy/' + path);
  }
});

test('retries a failed screenshot when its current visual tab is selected again', async ({ context, page }) => {
  await serveSite(context);
  let unavailable = true;
  await context.route('**/assets/screenshots/ai-empty-light.webp*', (route) =>
    unavailable ? route.abort() : route.fallback(),
  );
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.goto(origin + prefix + '#ai');
  const image = page.locator('#gemini-views-0 img');
  await image.scrollIntoViewIfNeeded();
  await expect.poll(() => image.evaluate((image: HTMLImageElement) =>
    image.complete && image.naturalWidth === 0,
  )).toBe(true);
  unavailable = false;
  await page.getByRole('group', { name: 'Gemini setup screenshots' })
    .getByRole('button', { name: 'Without a key', exact: true }).click();
  await expect.poll(() => image.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
});

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
  const updates = page.locator('#extension-updates');
  await updates.locator('summary').click();
  await expect(updates.locator('code')).toHaveText('chrome://extensions');
  await expect(updates.locator('ol > li')).toHaveCount(3);
  await expect(updates.getByRole('link', { name: 'Chrome’s extension update guide' }))
    .toHaveAttribute('href', 'https://developer.chrome.com/docs/extensions/develop/concepts/extensions-update-lifecycle');
  await updates.locator('summary').click();
  const screenshot = page.getByRole('button', {
    name: 'Enlarge screenshot: AI Features before adding a Gemini key', exact: true,
  });
  await screenshot.click();
  await expect(page.getByRole('dialog', { name: 'Screenshot viewer' })).toBeVisible();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('.image-dialog img')).toHaveAttribute(
    'src', /-dark\.webp(?:\?v=[a-f0-9]+)?$/,
  );
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('.image-dialog img')).toHaveAttribute(
    'src', /-light\.webp(?:\?v=[a-f0-9]+)?$/,
  );
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
  await expect(page.locator('#start').getByRole('link', { name: 'MIT license' }))
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
  await expect(page.locator('#dev-bar > p.prose')).toHaveCount(2);
  await expect(page.locator('#dev-bar details')).toHaveCount(2);
  await page.getByRole('button', { name: 'Copy Chrome development command', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('pnpm dev');
  expect(errors).toEqual([]);
});

test('chapter navigation updates only when needed and resumes after mobile layouts', async ({ context, page }) => {
  await serveSite(context);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin + prefix);
  await expect(page.locator('.chapter-nav [aria-current="location"]')).toHaveAttribute('href', '#start');
  await page.evaluate(() => {
    document.documentElement.dataset.navigationWrites = '0';
    new MutationObserver((records) => {
      const root = document.documentElement;
      root.dataset.navigationWrites = String(Number(root.dataset.navigationWrites) + records.length);
    }).observe(document.querySelector('.chapter-nav')!, {
      subtree: true, attributes: true, attributeFilter: ['aria-current'],
    });
  });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(100);
    await page.evaluate(() => { document.documentElement.dataset.navigationWrites = '0'; });
    for (let i = 1; i <= 6; i++) {
      await page.evaluate((top) => scrollTo(0, top), i * 5);
      await page.waitForTimeout(25);
    }
    expect(await page.locator('html').getAttribute('data-navigation-writes')).toBe('0');
    if (width === 1440) {
      await page.locator('.chapter-nav a[href="#your-data"]').click();
      await expect(page.locator('.chapter-nav [aria-current="location"]')).toHaveAttribute('href', '#your-data');
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.chapter-nav [aria-current="location"]')).toHaveAttribute('href', '#start');
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
  await page.getByRole('button', { name: 'Copy website capture command' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('node scripts/capture-site.mjs');
  await page.locator('#promo-captures > summary').click();
  await page.getByRole('button', { name: 'Copy promo capture command' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('pnpm capture:promo');
  await page.goto(origin + prefix + 'developers/#preview-commands');
  await expect(tabs.getByRole('tab', { name: 'Develop', exact: true })).toHaveAttribute('aria-selected', 'true');
  await tabs.getByRole('tab', { name: 'Capture', exact: true }).click();
  // Reloading restores the instructions selected by the URL, including their tab.
  await page.reload();
  await expect(tabs.getByRole('tab', { name: 'Develop', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: 'Copy Chrome development command' })).toBeVisible();
  await page.goto(origin + prefix + 'developers/#browser-commands');
  await expect(tabs.getByRole('tab', { name: 'Check', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#browser-commands')).toHaveAttribute('open', '');
  await expect(page.locator('#browser-commands > summary')).toBeInViewport();
  await page.evaluate(() => { location.hash = '#demo'; });
  await expect(tabs.getByRole('tab', { name: 'Capture', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Copy demo screenshot command' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'node scripts/capture-demo.mjs',
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

test('demo opens from the walkthrough, offers installation guidance, and rechecks availability', async ({
  context,
  page,
}, info) => {
  await serveSite(context);
  await page.goto(origin + prefix);
  const links = page.getByRole('link', { name: 'Try the demo', exact: true });
  await expect(links).toHaveCount(1);
  for (const link of await links.all()) {
    await expect(link).not.toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  }
  await links.click();
  const demo = page;
  await expect(demo).toHaveURL(origin + prefix + 'demo/?from=walkthrough');
  await expect(demo.getByRole('link', { name: /Back to guide/ })).toHaveAttribute('href', '../');
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

test('demo returns to its source guide and hides the return link for direct visits', async ({ context, page }) => {
  await serveSite(context);
  for (const width of [320, 1280]) {
    for (const [path, from] of [['', 'walkthrough'], ['developers/', 'developers']]) {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(origin + prefix + path);
      await page.getByRole('link', { name: 'Try the demo', exact: true }).click();
      await expect(page).toHaveURL(origin + prefix + 'demo/?from=' + from);
      await page.setViewportSize({ width, height: 900 });
      const back = page.getByRole('link', { name: /Back to guide/ });
      if (width === 320)
        await page.addStyleTag({ content: `
          *:not(svg):not(svg *) {
            line-height: 1.5 !important;
            letter-spacing: 0.12em !important;
            word-spacing: 0.16em !important;
          }
          p { margin-bottom: 2em !important; }
        ` });
      await expectVisibleFocus(back);
      expect(await fitsViewportWidth(page)).toBe(true);
      const backBox = (await back.boundingBox())!;
      const themeBox = (await page.locator('#theme').boundingBox())!;
      expect(backBox.x + backBox.width).toBeLessThan(themeBox.x);
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(origin + prefix + path);
    }
  }
  for (const query of ['', '?from=https://example.com/', '?from=unknown']) {
    await page.goto(origin + prefix + 'demo/' + query);
    await expect(page.locator('#return-to-guide')).toBeHidden();
  }
});

test('guides and demo reflow doubled text and keep chapter targets below the sticky header', async ({
  context,
  page,
}, info) => {
  await serveSite(context);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 600 });
  for (const path of ['', 'developers/', 'demo/?from=developers']) {
    await page.goto(origin + prefix + path);
    if (path.startsWith('demo/')) await expect(page.locator('#job-buddy-setup')).toBeVisible();
    await page.locator('main details').evaluateAll((elements) => {
      elements.forEach((element) => { (element as HTMLDetailsElement).open = true; });
    });
    // LP uses pixel font sizes, so snapshot computed values before doubling them.
    await page.evaluate(() => {
      const sizes = [...document.querySelectorAll<HTMLElement>('html, body, body *:not(svg):not(svg *)')]
        .map((element) => {
          const css = getComputedStyle(element);
          return { element, font: parseFloat(css.fontSize), line: parseFloat(css.lineHeight) };
        });
      for (const { element, font, line } of sizes) {
        element.style.fontSize = `${font * 2}px`;
        if (Number.isFinite(line)) element.style.lineHeight = `${line * 2}px`;
      }
    });
    expect(await fitsViewportWidth(page), path).toBe(true);
    if (!path.startsWith('demo/')) {
      const link = page.locator('.mobile-contents nav a').nth(1);
      const target = page.locator((await link.getAttribute('href'))!);
      await link.click();
      await expect.poll(async () => {
        const header = (await page.locator('.site-header').boundingBox())!;
        return (await target.boundingBox())!.y - header.y - header.height;
      }, { message: `${path || 'walkthrough'} chapter heading must clear the sticky header` })
        .toBeGreaterThanOrEqual(0);
    } else {
      await expectVisibleFocus(page.getByRole('link', { name: /Back to guide/ }));
      await expect(page.getByRole('button', { name: /Switch to .* mode/ }))
        .toBeInViewport({ ratio: 1 });
    }
    await page.screenshot({ path: info.outputPath(`${path.split('/')[0] || 'user'}-doubled-text.png`) });
  }
});

test('task links preserve their opening behaviour without opening notices', async ({
  context,
  page,
}) => {
  await serveSite(context);
  for (const path of ['', 'developers/', 'demo/']) {
    await page.goto(origin + prefix + path);
    for (const link of await page.locator('a[href]').all()) {
      await expect(link).not.toHaveText(/opens? in (?:a )?new (?:tab|window)/i);
      expect((await link.getAttribute('title')) ?? '').not.toMatch(/new (?:tab|window)/i);
      expect((await link.getAttribute('aria-label')) ?? '').not.toMatch(/new (?:tab|window)/i);
      const href = await link.getAttribute('href');
      const url = new URL(href!, page.url());
      const newTab =
        (path === '' && url.hostname === 'aistudio.google.com') ||
        (path === 'developers/' && ['chrome.google.com', 'console.cloud.google.com'].includes(url.hostname)) ||
        (path === 'demo/' && url.hostname === 'chromewebstore.google.com');
      if (newTab) {
        const panelId = await link.evaluate((el) => el.closest('[role="tabpanel"]')?.id);
        if (panelId) await page.locator(`[role="tab"][aria-controls="${panelId}"]`).click();
        await expect(link).toHaveAttribute('target', '_blank');
        await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
        await expect(link).toHaveAccessibleDescription('');
        const icon = link.locator('svg.external-link-icon[aria-hidden="true"]');
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
  await page.goto(origin + prefix + 'demo/');
  await context.route('https://chromewebstore.google.com/**', (route) =>
    route.fulfill({ body: 'Store preview' }),
  );
  const [store] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('link', { name: 'Add to Chrome', exact: true }).click(),
  ]);
  await expect(store).toHaveURL(/chromewebstore\.google\.com/);
  expect(await store.evaluate(() => window.opener === null)).toBe(true);
  await expect(page).toHaveURL(origin + prefix + 'demo/');
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
  test.setTimeout(90_000);
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
            await fitsViewportWidth(page),
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
      expect(await fitsViewportWidth(page)).toBe(true);
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
    await page.addInitScript((theme) => localStorage.setItem('job-buddy-theme', theme), theme);
    const failures: string[] = [];
    page.on('pageerror', (error) => failures.push(error.message));
    page.on('response', (response) => {
      if (response.status() >= 400) failures.push(response.url());
    });
    for (const path of ['', 'developers/', 'demo/', '404.html', 'legal/privacy/', 'legal/disclaimer/']) {
      for (const width of [320, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.goto(origin + prefix + path);
        if (path === 'demo/') await expect(page.locator('#job-buddy-setup')).toBeVisible();
        await expect(page.locator('html')).toHaveClass(theme === 'dark' ? 'dark' : '');
        expect(
          await fitsViewportWidth(page),
          `${path} at ${width}px`,
        ).toBe(true);
        // Visit each section so lazy screenshots load and long content gets checked.
        for (const section of await page.locator('main > section[id]').all()) {
          await section.scrollIntoViewIfNeeded();
          expect(
            await fitsViewportWidth(page),
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

for (const path of ['', 'developers/', 'demo/']) {
  test(`appearance preferences stay local to Job Buddy and synchronize open views: /${path}`, async ({ context }) => {
    await serveSite(context);
    await context.addInitScript(() => localStorage.setItem('theme', 'dark'));
    const first = await context.newPage();
    const second = await context.newPage();
    await first.emulateMedia({ colorScheme: 'light' });
    await second.emulateMedia({ colorScheme: 'light' });
    await first.goto(origin + prefix + path);
    await second.goto(origin + prefix + (path === 'demo/' ? '' : 'demo/'));
    const toggle = first.getByRole('button', { name: /Switch to .* mode/ });

    // A sibling site's saved theme must not override this site's system default.
    await expect(first.locator('html')).not.toHaveClass(/dark/);
    await first.emulateMedia({ colorScheme: 'dark' });
    await expect(first.locator('html')).toHaveClass(/dark/);
    await toggle.click();
    await first.emulateMedia({ colorScheme: 'light' });
    await first.emulateMedia({ colorScheme: 'dark' });
    await expect(first.locator('html')).not.toHaveClass(/dark/);
    await first.reload();
    await expect(first.locator('html')).not.toHaveClass(/dark/);

    await toggle.focus();
    await first.keyboard.press('Space');
    await expect(second.locator('html')).toHaveClass(/dark/);
    await expect(second.getByRole('button', { name: 'Switch to light mode' })).toBeVisible();
    expect(await first.evaluate(() => localStorage.getItem('job-buddy-theme'))).toBe('dark');
    expect(await first.evaluate(() => localStorage.getItem('theme'))).toBe('dark');
    expect(await second.locator('html').evaluate((e) => getComputedStyle(e).colorScheme)).toBe('dark');

    // Clearing the override elsewhere restores each open page's own OS preference.
    await first.emulateMedia({ colorScheme: 'light' });
    await second.evaluate(() => localStorage.removeItem('job-buddy-theme'));
    await expect(first.locator('html')).not.toHaveClass(/dark/);
    await first.emulateMedia({ colorScheme: 'dark' });
    await expect(first.locator('html')).toHaveClass(/dark/);
    expect(await first.evaluate(() => localStorage.getItem('job-buddy-theme'))).toBeNull();

    await toggle.click();
    await second.evaluate(() => localStorage.setItem('job-buddy-theme', 'invalid'));
    await expect(first.locator('html')).toHaveClass(/dark/);
    await first.emulateMedia({ colorScheme: 'light' });
    await expect(first.locator('html')).not.toHaveClass(/dark/);

    await toggle.click();
    await second.evaluate(() => localStorage.clear());
    await expect(first.locator('html')).not.toHaveClass(/dark/);
  });
}

test('legal pages follow the website appearance and live preference changes', async ({ context, page }) => {
  await serveSite(context);
  const other = await context.newPage();
  await other.goto(origin + prefix);
  for (const path of ['legal/privacy/', 'legal/disclaimer/']) {
    await other.evaluate(() => localStorage.removeItem('job-buddy-theme'));
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(origin + prefix + path);
    await expect(page.locator('html')).toHaveClass('dark');
    expect(await page.locator('html').evaluate((el) => getComputedStyle(el).colorScheme)).toBe('dark');
    await page.emulateMedia({ media: 'print', colorScheme: 'dark' });
    expect(await page.locator('html').evaluate((el) => getComputedStyle(el).colorScheme)).toBe('light');
    await page.emulateMedia({ media: 'screen', colorScheme: 'dark' });
    expect(await page.locator('html').evaluate((el) => getComputedStyle(el).colorScheme)).toBe('dark');

    await other.evaluate(() => localStorage.setItem('job-buddy-theme', 'light'));
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    await page.reload();
    await expect(page.locator('html')).not.toHaveClass(/dark/);

    await other.evaluate(() => localStorage.setItem('job-buddy-theme', 'dark'));
    await expect(page.locator('html')).toHaveClass('dark');
    await other.evaluate(() => localStorage.removeItem('job-buddy-theme'));
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  }
});

test('demo preserves long pasted answers and explains limits before completion', async ({ context, page }) => {
  await serveSite(context);
  await page.goto(origin + prefix + 'demo/');
  const answer = page.getByLabel('What interests you about this position?');
  const value = '😀'.repeat(1501);
  await answer.fill(value);
  await expect(answer).toHaveValue(value);
  await expect(answer).not.toHaveAttribute('maxlength');
  await expect(page.locator('#interest-limit')).toHaveText('2 characters over the 3000-character limit');
  expect(await answer.evaluate((field: HTMLTextAreaElement) => field.checkValidity())).toBe(false);
  await answer.fill('A shorter answer.');
  expect(await answer.evaluate((field: HTMLTextAreaElement) => field.checkValidity())).toBe(true);
  await expect(page.locator('#interest-limit')).toHaveText('Up to 3000 characters');

  const firstName = page.getByLabel('First name', { exact: false });
  await firstName.fill('n'.repeat(101));
  await expect(firstName).toHaveValue('n'.repeat(101));
  expect(await firstName.evaluate((field: HTMLInputElement) => field.checkValidity())).toBe(false);
});

test('guides and demo keep manual choices in memory with storage blocked', async ({
  context,
  page,
}) => {
  await serveSite(context);
  await page.addInitScript(() =>
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Blocked', 'SecurityError');
      },
    }),
  );
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const path of ['', 'developers/', 'demo/']) {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(origin + prefix + path);
    await page.getByRole('button', { name: 'Switch to dark mode' }).click();
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible();
    await page.reload();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('chapter and footer dividers keep equal spacing in both guides', async ({ context, page }) => {
  await serveSite(context);
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['', 'developers/']) {
      await page.goto(origin + prefix + path);
      const gaps = await page.evaluate(() => {
        const chapters = [...document.querySelectorAll<HTMLElement>('.chapter')];
        const footer = document.querySelector<HTMLElement>('.site-footer')!;
        const footerBox = footer.getBoundingClientRect();
        const lastContent = chapters.at(-1)!.lastElementChild!.getBoundingClientRect();
        return {
          chapters: chapters.slice(0, -1).map((chapter) => ({
            above: getComputedStyle(chapter).paddingBottom,
            below: getComputedStyle(chapter.nextElementSibling!).paddingTop,
          })),
          footer: {
            above: footerBox.top - lastContent.bottom,
            below:
              footer.firstElementChild!.getBoundingClientRect().top -
              footerBox.top -
              parseFloat(getComputedStyle(footer).borderTopWidth),
          },
        };
      });
      for (const chapter of gaps.chapters) expect(chapter.above).toBe(chapter.below);
      expect(gaps.footer).toEqual({ above: 32, below: 32 });
      for (const expanded of [false, true]) {
        if (expanded)
          await page.locator('main details').evaluateAll((elements) => {
            for (const element of elements) (element as HTMLDetailsElement).open = true;
          });
        for (const chapter of await page.locator('main .chapter').all()) {
          const spacing = await chapter.evaluate(visibleDividerGaps);
          expect(spacing).toEqual({
            above: width < 800 ? 40 : 64,
            below: width < 800 ? 40 : 64,
          });
        }
        for (const question of await page.locator('main .detail-list > details + details').all()) {
          if (await question.isVisible())
            expect(await question.evaluate(visibleDividerGaps)).toEqual({ above: 16, below: 16 });
        }
      }
    }
  }
});
