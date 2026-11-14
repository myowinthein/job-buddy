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
        entry: 'src/browser/fixtures/history-calendar.tsx',
        formats: ['iife'],
        name: 'HistoryCalendarFixture',
      },
    },
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  });
  const output = Array.isArray(bundle) ? bundle[0].output : 'output' in bundle ? bundle.output : [];
  const chunk = output.find((item) => item.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk') throw new Error('Missing calendar fixture');
  script = chunk.code;
});
test('floating fill handles scoped From/To dates, year-only widgets and closes calendars; Undo preserves manual edits', async ({
  context,
  extension,
  page,
}) => {
  await stubEmptyGemini(context);
  await extension.worker.evaluate(async () => {
    const { profile } = await chrome.storage.local.get<{ profile: Profile }>('profile');
    profile.workHistory = [
      {
        company: 'Latest company',
        title: 'Engineer',
        startDate: '2021-12',
        endDate: '2025-08',
        isCurrent: false,
        description: '',
      },
    ];
    profile.education = [
      {
        institution: 'Older school',
        degree: 'Diploma',
        fieldOfStudy: 'Computing',
        startDate: '2012-09',
        endDate: '2013-10',
        isCurrent: false,
      },
      {
        institution: 'Recent school',
        degree: 'Bachelor',
        fieldOfStudy: 'Computing',
        startDate: '2023-07',
        endDate: '2024-07',
        isCurrent: false,
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
  await expect(widget.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
  for (const [id, value] of Object.entries({
    'work-start': '12/2021',
    'work-end': '08/2025',
    'edu-0-start': '2023',
    'edu-0-end': '2024',
    'edu-1-start': '2012',
    'edu-1-end': '2013',
  })) {
    await expect(page.locator(`[id="${id}"]`)).toHaveValue(value);
    await expect(page.locator(`[data-model="${id}"]`)).toHaveText(value);
  }
  await expect(page.locator('.react-datepicker-popper')).toHaveCount(0);
  await page.locator('#edu-0-start').fill('2022');
  await page.locator('#edu-0-start').press('Escape');
  await widget.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('#edu-0-start')).toHaveValue('2022');
  await expect(page.locator('#edu-1-start')).toHaveValue('');
  await expect(page.locator('.react-datepicker-popper')).toHaveCount(0);
});
