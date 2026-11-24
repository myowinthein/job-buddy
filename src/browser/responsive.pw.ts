import { test, expect, stubEmptyGemini, openPinnedPopup, extensionUrl } from './fixtures';
import { DEV_PROFILE } from '../utils/devProfile';
import type { Locator, Page } from '@playwright/test';

async function sectionNavigation(page: Page) {
  await page.addInitScript(() => {
    const section = new URL(location.href).searchParams.get('section');
    if (section) sessionStorage.setItem('jb:ui:section', section);
  });
}

async function overflow(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector('main')!;
    const box = main.getBoundingClientRect();
    return [
      ...main.querySelectorAll<HTMLElement>('input, select, textarea, button, summary, h2, h3'),
    ]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.width &&
          rect.height &&
          getComputedStyle(element).visibility !== 'hidden' &&
          (rect.right > box.right + 1 || rect.left < box.left - 1)
        );
      })
      .map((element) => ({
        text: element.getAttribute('aria-label') || element.textContent?.slice(0, 65) || element.id,
        width: Math.round(element.getBoundingClientRect().width),
        class: element.className,
      }));
  });
}

test('keeps preference recovery persistent and notification stacks reachable', async ({
  context,
  extension,
}, info) => {
  const page = await context.newPage();
  await sectionNavigation(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await page.goto(extensionUrl(extension, 'options.html?section=settings'));
  await page.getByRole('heading', { name: 'Appearance', exact: true }).waitFor();
  await page.evaluate(() => {
    const original = chrome.storage.local.set.bind(chrome.storage.local);
    Reflect.set(window, 'restorePreferenceWrites', () => {
      chrome.storage.local.set = original;
    });
    chrome.storage.local.set = (() => {
      throw new Error('Synthetic storage failure');
    }) as typeof chrome.storage.local.set;
  });
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  const failure = page
    .getByRole('alert')
    .filter({ hasText: 'Appearance changed for this page but could not be saved.' });
  await expect(failure).toBeVisible();
  await page.clock.fastForward(9000);
  await expect(failure).toBeVisible();
  await page.evaluate(() => Reflect.get(window, 'restorePreferenceWrites')());
  await failure.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(failure).toHaveCount(0);
  expect(
    await extension.worker.evaluate(
      async () => (await chrome.storage.local.get('themePreference')).themePreference,
    ),
  ).toBe('dark');
  for (let index = 0; index < 4; index++) {
    await page
      .locator('input[type=file][accept=".json"]')
      .setInputFiles({
        name: 'invalid.json',
        mimeType: 'application/json',
        buffer: Buffer.from('invalid JSON'),
      });
    await expect(
      page.getByRole('region', { name: 'Notifications' }).getByRole('alert'),
    ).toHaveCount(index + 1);
  }
  const stack = page.getByRole('region', { name: 'Notifications' });
  for (const [width, height] of [
    [1280, 800],
    [640, 300],
    [320, 240],
  ]) {
    await page.setViewportSize({ width, height });
    if (width === 320)
      await page.addStyleTag({
        content:
          'html{font-size:200%}*:not(svg):not(svg *){line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}',
      });
    const box = (await stack.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y + box.height).toBeLessThanOrEqual(height);
    for (const dismiss of await stack.getByRole('button', { name: 'Dismiss notification' }).all()) {
      await dismiss.focus();
      const button = (await dismiss.boundingBox())!;
      expect(button.y).toBeGreaterThanOrEqual(box.y);
      expect(button.y + button.height).toBeLessThanOrEqual(box.y + box.height);
    }
  }
  await stack.evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({ path: info.outputPath('notifications-short-enlarged.png') });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole('button', { name: 'Light', exact: true }).focus();
  await page.mouse.move(0, 0);
  await page.clock.fastForward(8500);
  await page.clock.fastForward(300);
  await expect(stack).toHaveCount(0);
  const link = page.getByRole('link', { name: 'View usage and limits' });
  await expect(link).toHaveCSS('text-decoration-skip-ink', 'none');
  await page.close();
});

test('audits options layouts', async ({ context, extension }, info) => {
  test.setTimeout(120_000);
  await extension.worker.evaluate(async (profile) => {
    await chrome.storage.local.set({
      profile,
      themePreference: 'dark',
      learnedMappings: {
        'long-careers-domain.example.test': {
          first: {
            path: 'personal.firstName',
            count: 2,
            label: 'First name',
            question: 'First name',
          },
        },
      },
    });
  }, DEV_PROFILE);
  const page = await context.newPage();
  await sectionNavigation(page);
  const findings: unknown[] = [];
  for (const width of [320, 390, 640, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 600 });
    for (const section of [
      'personal',
      'address',
      'workAuthorization',
      'workHistory',
      'education',
      'languages',
      'links',
      'documents',
      'salary',
      'settings',
      'learnedMappings',
      'fillDetails',
    ]) {
      await page.goto(new URL(`options.html?section=${section}`, extension.worker.url()).href);
      await expect(page.locator('main h2')).toBeVisible();
      while (await page.locator('[data-entry-toggle][aria-expanded="false"]').count())
        await page.locator('[data-entry-toggle][aria-expanded="false"]').first().click();
      await page
        .locator('main details')
        .evaluateAll((elements) =>
          elements.forEach((element) => ((element as HTMLDetailsElement).open = true)),
        );
      if (width <= 390) {
        for (const title of await page.locator('[data-entry-toggle] > span > span:first-child').all()) {
          expect((await title.boundingBox())!.width).toBeGreaterThanOrEqual(100);
        }
      }
      if (section === 'personal' && width === 320) {
        await page.locator('main details').first().scrollIntoViewIfNeeded();
        await page.screenshot({
          path: info.outputPath('personal-background-320.png'),
          animations: 'disabled',
        });
        expect(
          (await page.getByRole('combobox', { name: 'Month', exact: true }).boundingBox())!.width,
        ).toBeGreaterThanOrEqual(110);
      }
      const issues = await overflow(page);
      const scroll = await page
        .locator('main')
        .evaluate((element) => [element.clientWidth, element.scrollWidth]);
      if (width === 320 || width === 640)
        await page.screenshot({ path: info.outputPath(`${section}-${width}.png`) });
      if (issues.length || scroll[1] > scroll[0] + 1) {
        findings.push({ width, section, scroll, issues });
        await page.screenshot({ path: info.outputPath(`${section}-${width}.png`) });
      }
    }
  }
  expect(findings).toEqual([]);
});

test('audits dropdowns and short dialogs', async ({ context, extension }, info) => {
  test.setTimeout(90_000);
  await extension.worker.evaluate(
    async (profile) => chrome.storage.local.set({ profile, themePreference: 'dark' }),
    DEV_PROFILE,
  );
  const page = await context.newPage();
  await sectionNavigation(page);
  for (const width of [320, 640, 768, 1440]) {
    await page.setViewportSize({ width, height: 600 });
    for (const section of ['personal', 'address', 'workHistory', 'salary']) {
      await page.goto(new URL(`options.html?section=${section}`, extension.worker.url()).href);
      await expect(page.locator('main h2')).toBeVisible();
      while (await page.locator('[data-entry-toggle][aria-expanded="false"]').count())
        await page.locator('[data-entry-toggle][aria-expanded="false"]').first().click();
      const buttons = page.locator('main button[aria-haspopup="listbox"]');
      for (let i = 0; i < (await buttons.count()); i++) {
        await buttons.nth(i).click();
        const list = page.getByRole('listbox');
        await expect(list).toBeVisible();
        const bounds = await list.evaluate((el) => {
          const box = el.getBoundingClientRect();
          const row = el.querySelector('[aria-selected="true"]') ?? el.firstElementChild!;
          const rowBox = row.getBoundingClientRect();
          const hit = document.elementFromPoint(
            rowBox.x + 10,
            Math.min(rowBox.bottom - 2, box.bottom - 2),
          );
          return {
            x: box.x,
            right: box.right,
            top: box.top,
            bottom: box.bottom,
            hit: hit?.closest('[role="listbox"]') === el,
          };
        });
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.right).toBeLessThanOrEqual(width);
        expect(bounds.top).toBeGreaterThanOrEqual(0);
        expect(bounds.bottom).toBeLessThanOrEqual(600);
        expect(bounds.hit).toBe(true);
        await page.screenshot({ path: info.outputPath(`dropdown-${section}-${width}-${i}.png`) });
        await page.keyboard.press('Escape');
        await expect(list).toHaveCount(0);
      }
    }
  }
  await page.setViewportSize({ width: 640, height: 300 });
  await page.goto(extensionUrl(extension, 'options.html?section=resume'));
  await expect(page.getByRole('heading', { name: 'Import Resume' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Import Resume' })).toBeInViewport({ ratio: 1 });
  await page.getByRole('button', { name: 'Analyze Resume', exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Analyze Resume', exact: true })).toBeInViewport({
    ratio: 1,
  });
  await page.screenshot({ path: info.outputPath('resume-short.png') });
});

async function reachable(dialog: Locator) {
  const bounds = await dialog.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  const size = dialog.page().viewportSize()!;
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(size.width);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(size.height);
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true,
  );
  for (const button of await dialog.getByRole('button').all()) {
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeInViewport({ ratio: 1 });
  }
}

test('keeps reset, shared import review, and mapping review usable in short windows', async ({
  context,
  extension,
}, info) => {
  await extension.worker.evaluate(
    async (profile) =>
      chrome.storage.local.set({
        profile,
        themePreference: 'dark',
        learnedMappings: {
          'careers.long-example.test': {
            first: {
              path: 'personal.firstName',
              count: 2,
              label: 'First name',
              question: 'First name',
            },
          },
        },
      }),
    DEV_PROFILE,
  );
  const page = await context.newPage();
  await sectionNavigation(page);
  await page.setViewportSize({ width: 320, height: 300 });
  await page.goto(extensionUrl(extension, 'options.html?section=settings'));
  await page.getByRole('button', { name: 'Reset Now', exact: true }).click();
  await reachable(page.getByRole('dialog'));
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  const incoming = structuredClone(DEV_PROFILE);
  incoming.professional.summary = 'A new summary for comparison.';
  incoming.personal.email = 'other@example.test';
  incoming.personal.firstName = 'Other';
  incoming.workHistory[0].company = 'New employer';
  await page.locator('input[type="file"][accept=".json"]').setInputFiles({
    name: 'profile.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ profile: incoming })),
  });
  await expect(page.getByRole('dialog', { name: 'Import Profile' })).toBeVisible();
  await reachable(page.getByRole('dialog'));
  await page.getByRole('radio', { name: /Update profile/ }).check();
  await page.getByRole('button', { name: 'Review Changes', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Review Profile' })).toBeVisible();
  await page.getByRole('button', { name: 'Work History', exact: true }).last().click();
  await reachable(page.getByRole('dialog'));
  await page.screenshot({ path: info.outputPath('import-review-short.png') });
  await page.getByRole('button', { name: 'Close import review', exact: true }).click();
  await page.getByRole('button', { name: 'Learned Mappings', exact: true }).click();
  await page.getByRole('button', { name: 'How learned mappings work' }).click();
  await reachable(page.getByRole('tooltip'));
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Review Mappings', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Sites to review' })).toBeVisible();
  await reachable(page.getByRole('dialog'));
  await page.screenshot({ path: info.outputPath('mapping-review-short.png') });
});

test('keeps populated Fill Details, its help, and Quick Fill within the viewport', async ({
  page,
  context,
  extension,
}, info) => {
  await stubEmptyGemini(context);
  await extension.send('AUTOFILL_FILL', 'merge');
  const options = await context.newPage();
  await sectionNavigation(options);
  for (const width of [320, 640, 768, 1440]) {
    await options.setViewportSize({ width, height: width === 320 ? 300 : 600 });
    await options.goto(extensionUrl(extension, 'options.html?section=fillDetails'));
    await expect(options.locator('summary').first()).toBeVisible();
    await options.locator('summary').first().click();
    expect(await overflow(options)).toEqual([]);
    expect(
      await options.locator('main').evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    await options.getByRole('button', { name: 'How Fill Details works' }).hover();
    await reachable(options.getByRole('tooltip'));
    if (width === 320) {
      const tooltip = options.getByRole('tooltip');
      await tooltip.hover();
      // Allow the hover bridge's close delay to expire while over the panel.
      await options.waitForTimeout(200);
      await expect(tooltip).toBeVisible();
      await options.mouse.wheel(0, 180);
      await expect.poll(() => tooltip.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    }
    await options.screenshot({ path: info.outputPath(`details-${width}.png`) });
  }
  await page.setViewportSize({ width: 320, height: 300 });
  await extension.worker.evaluate(() =>
    chrome.storage.local.set({
      quickFillPreferences: {
        enabled: true,
        disabledSites: [],
        fillMode: 'merge',
        position: { x: 0, y: 0 },
      },
    }),
  );
  const host = page.locator('[data-job-buddy-ui]');
  await host.getByRole('button', { name: 'Quick fill options' }).click();
  const menu = host.locator('.menu');
  await reachable(menu);
  await page.screenshot({ path: info.outputPath('quick-fill-left-edge.png') });
});

test('keeps the toolbar popup within its Chrome surface for setup and choices', async ({
  context,
  extension,
}) => {
  const popup = await openPinnedPopup(context, extension.worker.url(), extension.sourceTabId);
  await popup.getByRole('button', { name: 'Fill Form', exact: true }).click();
  await expect(popup.getByRole('radio', { name: /^Empty fields only/ })).toBeVisible();
  for (const height of [300, 450, 600]) {
    await popup.setViewportSize({ width: 380, height });
    // Both choices must remain selectable, not merely present below visible actions.
    for (const name of [/^Empty and existing fields/, /^Empty fields only/]) {
      const choice = popup.getByRole('radio', { name });
      await choice.check();
      await expect(choice).toBeChecked();
    }
    await expect(popup.getByRole('button', { name: 'Fill Form', exact: true })).toBeInViewport({ ratio: 1 });
    await expect(popup.getByRole('button', { name: 'Cancel', exact: true })).toBeInViewport({ ratio: 1 });
  }
  expect(
    await popup.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth &&
        document.documentElement.scrollHeight <= innerHeight,
    ),
  ).toBe(true);
  await popup.getByRole('button', { name: 'Cancel', exact: true }).click();
  await extension.worker.evaluate(() =>
    chrome.storage.local.remove(['geminiApiKey', 'geminiModel']),
  );
  await popup.reload();
  await expect(popup.getByRole('button', { name: /Set Up AI/ })).toBeVisible();
  expect(
    await popup.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth &&
        document.documentElement.scrollHeight <= innerHeight,
    ),
  ).toBe(true);
});

test('keeps options controls and popup choices reachable with doubled text size', async ({
  context,
  extension,
}, info) => {
  test.setTimeout(90_000);
  await extension.worker.evaluate(async (profile) => chrome.storage.local.set({ profile }), DEV_PROFILE);
  const options = await context.newPage();
  await options.emulateMedia({ reducedMotion: 'reduce' });
  await sectionNavigation(options);
  await options.setViewportSize({ width: 640, height: 600 });
  for (const section of [
    'personal', 'address', 'workAuthorization', 'workHistory', 'education', 'languages',
    'links', 'documents', 'salary', 'settings', 'learnedMappings', 'fillDetails',
  ]) {
    await options.goto(extensionUrl(extension, `options.html?section=${section}`));
    await expect(options.locator('main h2')).toBeVisible();
    while (await options.locator('[data-entry-toggle][aria-expanded="false"]').count())
      await options.locator('[data-entry-toggle][aria-expanded="false"]').first().click();
    await options.locator('main details').evaluateAll((elements) =>
      elements.forEach((element) => ((element as HTMLDetailsElement).open = true)),
    );
    await options.addStyleTag({ content: 'html { font-size: 200%; }' });
    expect(await overflow(options), section).toEqual([]);
    expect(
      await options.locator('main').evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
      section,
    ).toBe(true);
    if (section === 'settings')
      await options.screenshot({ path: info.outputPath('settings-enlarged-text.png') });
  }

  const popup = await openPinnedPopup(context, extension.worker.url(), extension.sourceTabId, {
    width: 380, height: 300,
  });
  await popup.addStyleTag({ content: 'html { font-size: 200%; }' });
  await popup.getByRole('button', { name: 'Fill Form', exact: true }).click();
  for (const name of [/^Empty and existing fields/, /^Empty fields only/]) {
    const choice = popup.getByRole('radio', { name });
    await choice.check();
    await expect(choice).toBeChecked();
  }
  for (const name of ['Fill Form', 'Cancel']) {
    const button = popup.getByRole('button', { name, exact: true });
    await button.click({ trial: true });
    await expect(button).toBeInViewport({ ratio: 1 });
  }
  expect(await popup.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await popup.screenshot({ path: info.outputPath('popup-enlarged-text.png') });
});

test('lets native popup choices grow into available screen space', async ({ context, extension }) => {
  const popup = await openPinnedPopup(context, extension.worker.url(), extension.sourceTabId);
  await popup.addInitScript(() => {
    chrome.extension.getViews = () => [window];
    Object.defineProperty(screen, 'availHeight', { value: 600 });
    Object.defineProperty(screen, 'availTop', { value: 0 });
    Object.defineProperty(window, 'screenY', { value: 100 });
    Object.defineProperty(chrome.runtime, 'sendMessage', {
      value: async (message: { action: string }) => {
        if (message.action === 'AUTOFILL_RUN_BLOCKED') return false;
        if (message.action !== 'AUTOFILL_RUN_START') return null;
        return {
          tabId: 1, runId: 'responsive-test', startedAt: Date.now(),
          frames: [{ frameId: 0 }], stage: 'confirming',
        };
      },
    });
  });
  await popup.setViewportSize({ width: 380, height: 200 });
  await popup.reload();
  await popup.getByRole('button', { name: 'Fill Form', exact: true }).click();
  await expect(popup.getByRole('radio', { name: /^Empty fields only/ })).toBeVisible();
  expect(await popup.locator('fieldset').evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
});
