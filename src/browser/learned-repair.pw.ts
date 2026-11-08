import { test, expect, stubEmptyGemini, extensionUrl } from './fixtures';
import { RULE_PROFILE } from '../autofill/ruleMatching.fixture';
import type { LearnedMappings } from '../types/storage';

test('repairs historical aliases during scan, fills once, and skips repeat repair writes', async ({
  context,
  page,
  extension,
}) => {
  const employer = { path: 'workHistory.0.company', count: 1, label: 'Current Employer' };
  const mappings: LearnedMappings = {
    '127.0.0.1': {
      currentemployer: { ...employer, count: 2 },
      customattribute2523329: employer,
      fieldcustomattribute2523329: employer,
      typeyourresponse: { path: 'personal.nickname', count: 2, label: 'Type your response' },
      oldcv: { path: 'documents.cv.file.name', count: 1 },
    },
  };
  await extension.worker.evaluate(
    async ({ profile, mappings }) => {
      await chrome.storage.local.set({ profile, learnedMappings: mappings });
    },
    { profile: RULE_PROFILE, mappings },
  );
  await stubEmptyGemini(context);
  await page.evaluate(() => {
    document.body.innerHTML = `
      <header><button role="combobox" aria-label="Select language">English</button></header>
      <form><h1>Job application</h1><label for="field-custom_attribute_2523329">Current Employer</label>
      <input id="field-custom_attribute_2523329" name="custom_attribute_2523329" placeholder="Current Employer" required></form>`;
    document.querySelector('input')!.addEventListener('input', (event) => {
      (event.target as HTMLInputElement).dataset.observed = 'yes';
    });
  });
  await extension.send('AUTOFILL_SCAN');
  const read = () =>
    extension.worker.evaluate(
      async () =>
        await chrome.storage.local.get<{
          learnedMappings: LearnedMappings;
          learnedMappingRepairs: unknown;
        }>(['learnedMappings', 'learnedMappingRepairs']),
    );
  const repaired = await read();
  const entries = repaired.learnedMappings['127.0.0.1'] as LearnedMappings[string];
  expect(entries.currentemployer).toEqual({ ...employer, count: 2, question: employer.label });
  expect(entries.customattribute2523329).toEqual({ ...employer, question: employer.label });
  expect(entries.typeyourresponse).toMatchObject({ inactive: true, count: 2 });
  expect(entries.oldcv).toMatchObject({ inactive: true, count: 1 });
  const filled = await extension.send('AUTOFILL_FILL', 'overwrite');
  expect(filled[0].totalScanned).toBe(1);
  const input = page.locator('#field-custom_attribute_2523329');
  await expect(input).toHaveValue(RULE_PROFILE.workHistory[0].company);
  await expect(input).toHaveAttribute('data-observed', 'yes');
  expect(await input.evaluate((element) => (element as HTMLInputElement).checkValidity())).toBe(
    true,
  );
  const options = await context.newPage();
  await options.goto(extensionUrl(extension, 'options.html'));
  await options.getByRole('button', { name: 'Learned Mappings', exact: true }).click();
  await options.getByRole('button', { name: /^127\.0\.0\.1/ }).click();
  const row = options.getByRole('group', { name: 'Current Employer', exact: true });
  await expect(row).toHaveCount(1);
  await expect(row.getByText('Trusted', { exact: true })).toBeVisible();
  // Observe local events, so an identical checkpoint write cannot pass unnoticed.
  await extension.worker.evaluate(() => {
    (globalThis as unknown as { repairWrites: number }).repairWrites = 0;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && (changes.learnedMappings || changes.learnedMappingRepairs))
        (globalThis as unknown as { repairWrites: number }).repairWrites++;
    });
  });
  await extension.send('AUTOFILL_SCAN');
  expect(await read()).toEqual(repaired);
  expect(
    await extension.worker.evaluate(
      () => (globalThis as unknown as { repairWrites: number }).repairWrites,
    ),
  ).toBe(0);
});
