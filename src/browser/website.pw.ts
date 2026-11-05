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
          '.svg': 'image/svg+xml',
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
  await page.getByRole('button', { name: 'Before filling', exact: true }).click();
  await expect(page.locator('[data-comparison="before"]')).toBeVisible();
  await expect(page.locator('[data-comparison="after"]')).toBeHidden();
  await page.getByRole('button', { name: 'Enlarge empty demo form', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Screenshot viewer' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Enlarge empty demo form', exact: true }),
  ).toBeFocused();
  const mode = await page.locator('html').evaluate((el) => el.classList.contains('dark'));
  await page.getByRole('button', { name: /Switch to .* mode/ }).click();
  await expect(page.locator('html')).toHaveClass(mode ? '' : 'dark');
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
