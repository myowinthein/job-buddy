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
      lib: {
        entry: 'src/browser/fixtures/education-choice.tsx',
        formats: ['iife'],
        name: 'EducationChoiceFixture',
      },
    },
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  });
  const output = Array.isArray(bundle) ? bundle[0].output : 'output' in bundle ? bundle.output : [];
  const chunk = output.find((item) => item.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk') throw new Error('Missing education choice fixture');
  script = chunk.code;
});

test('selects a loaded honours-degree equivalent without a failing search or wait; Undo restores the actual value', async ({
  context,
  extension,
  page,
}) => {
  await stubEmptyGemini(context);
  await extension.worker.evaluate(async () => {
    const { profile } = await chrome.storage.local.get<{ profile: Profile }>('profile');
    profile.education = [
      {
        institution: 'Synthetic University',
        degree: 'Bachelor of Science (Honours)',
        fieldOfStudy: 'Computing',
        startDate: '2023',
        endDate: '2024',
      },
    ];
    await chrome.storage.local.set({
      profile,
      quickFillPreferences: { enabled: true, disabledSites: [], fillMode: 'overwrite' },
    });
  });
  await page.evaluate(() => {
    document.body.innerHTML = '<div id="root"></div>';
  });
  await page.addScriptTag({ content: script });
  const widget = page.locator('[data-job-buddy-ui]');
  await widget.getByRole('button', { name: 'Fill Form', exact: true }).click();
  await expect(page.locator('#selected')).toHaveText('science');
  await expect(page.locator('#degree')).toHaveValue('science');
  await expect(page.locator('#searches')).toHaveText('0');
  await expect(widget.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
  await expect(page.locator('[role=listbox]')).toHaveCount(0);
  await widget.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('#selected')).toHaveText('');
  await expect(page.locator('#degree')).toHaveValue('');
});
