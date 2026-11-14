import { build } from 'vite';
import { test, expect, stubEmptyGemini } from './fixtures';
import type { Profile } from '../types/profile';

let script: string;
test.beforeAll(async () => {
  const bundle = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      lib: {
        entry: 'src/browser/fixtures/deferred-select.tsx',
        formats: ['iife'],
        name: 'DeferredSelectFixture',
      },
    },
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  });
  const output = Array.isArray(bundle) ? bundle[0].output : 'output' in bundle ? bundle.output : [];
  const chunk = output.find((item) => item.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk') throw new Error('Missing deferred select fixture');
  script = chunk.code;
});

test('commits a deferred React country value before blur, Undo, refill and Next', async ({
  page,
  context,
  extension,
}) => {
  await stubEmptyGemini(context);
  await extension.worker.evaluate(async () => {
    const { profile } = await chrome.storage.local.get<{ profile: Profile }>('profile');
    profile.address.country = 'TH';
    await chrome.storage.local.set({
      profile,
      quickFillPreferences: {
        enabled: true,
        disabledSites: [],
        fillMode: 'overwrite',
      },
    });
  });
  await page.evaluate(() => {
    document.body.innerHTML = '<div id="root"></div>';
  });
  await page.addScriptTag({ content: script });
  const widget = page.locator('[data-job-buddy-ui]');
  const fill = widget.getByRole('button', { name: 'Fill Form', exact: true });
  await expect(page.locator('#model-country')).toHaveText('CAN');
  await fill.click();
  await expect(widget.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
  await expect(page.locator('#country')).toHaveValue('THA');
  await expect(page.locator('#model-country')).toHaveText('THA');
  await expect(page.locator('input[name=firstName]')).toHaveValue('Jane');
  await expect(page.locator('input[name=email]')).toHaveValue('jane@example.test');
  await expect(page.locator('#stage')).toHaveText('personal');
  await widget.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('#country')).toHaveValue('CAN');
  await expect(page.locator('#model-country')).toHaveText('CAN');
  await fill.click();
  await expect(fill).toBeEnabled();
  await expect(page.locator('#model-country')).toHaveText('THA');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('#stage')).toHaveText('experience');
  await expect(page.locator('#model-country')).toHaveText('THA');
  await expect(page.locator('#error')).toBeEmpty();
});
