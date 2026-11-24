import { test, expect, geminiResponse, autofillRequest } from './fixtures';
import type { AIFieldPayload } from '../resume-ai/types';
import type { Profile } from '../types/profile';

test('leaves tailored narrative answers manual and preserves checkbox state contrast after AI and edits', async ({
  page,
  context,
  extension,
}, info) => {
  await extension.worker.evaluate(async () => {
    const { profile } = await chrome.storage.local.get('profile');
    await chrome.storage.local.set({
      profile: {
        ...(profile as Profile),
        professional: { summary: 'Synthetic engineering summary' },
      },
    });
  });
  await page.evaluate(() => {
    document.body.innerHTML = `<style>
      body { background:#171717; color:white; padding:24px; font:16px system-ui; }
      label { display:block; margin:16px 0; padding:8px; }
      input[type=checkbox] { appearance:none; width:24px; height:24px; border:1px solid white; background-color:white; vertical-align:middle; }
      input[type=checkbox]:checked { background-color:rgb(40,40,40); }
      input[type=checkbox]:checked::after { content:'✓'; color:white; display:block; text-align:center; }
      input:focus-visible { outline:2px solid orange; }
    </style><form><h1>Job application</h1>
    <label>First name<input name="firstName" required></label>
    <label>Email<input name="email" type="email" required></label>
    <label>Professional summary<textarea id="summary" name="summary"></textarea></label>
    <label>How would you describe your hands-on experience with AWS, Terraform and cloud infrastructure in production environments?<textarea id="experience" name="summary"></textarea></label>
    <label>Can you describe a service you developed and helped deploy to production? Which parts of the code, infrastructure and security were you responsible for?<textarea id="service" name="description"></textarea></label>
    <fieldset><legend>Locations</legend><label id="north-label"><input type="checkbox" name="locations" value="north" id="north">North office</label><label><input type="checkbox" name="locations" value="south">South office</label></fieldset>
    </form>`;
  });
  const sent: AIFieldPayload[] = [];
  await context.route('https://generativelanguage.googleapis.com/**', (route) => {
    const fields = autofillRequest(route).fields;
    sent.push(...fields);
    return route.fulfill({
      json: geminiResponse(
        JSON.stringify(
          fields.map((field) =>
            field.type === 'checkbox'
              ? { fieldId: field.fieldId, selectedOptions: [], confidence: 'high' }
              : { fieldId: field.fieldId, profilePath: 'professional.summary', confidence: 'high' },
          ),
        ),
      ),
    });
  });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await expect(page.locator('[name=firstName]')).toHaveValue('Jane');
  await expect(page.locator('[name=email]')).toHaveValue('jane@example.test');
  await expect(page.locator('#summary')).toHaveValue('Synthetic engineering summary');
  await expect(page.locator('#experience')).toHaveValue('');
  await expect(page.locator('#service')).toHaveValue('');
  expect(sent.some((field) => field.type === 'checkbox')).toBe(true);
  expect(sent.some((field) => /describe/i.test(field.label))).toBe(false);
  const checkbox = page.locator('#north');
  const label = page.locator('#north-label');
  await expect(label).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(checkbox).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await checkbox.check();
  await expect(checkbox).toBeChecked();
  await expect(checkbox).toHaveCSS('background-color', 'rgb(40, 40, 40)');
  expect(await checkbox.evaluate((element) => getComputedStyle(element, '::after').color)).toBe(
    'rgb(255, 255, 255)',
  );
  await page.keyboard.press('Tab');
  await checkbox.focus();
  await expect(checkbox).toHaveCSS('outline-color', 'rgb(255, 165, 0)');
  await label.screenshot({ path: info.outputPath('checked-choice.png') });
  await extension.send('CLEAR');
  // Undo preserves the applicant's later manual choice and its site-defined colors.
  await expect(checkbox).toBeChecked();
  await expect(checkbox).toHaveCSS('background-color', 'rgb(40, 40, 40)');
  await expect(label).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  expect(
    await page.locator('form').evaluate((form) => (form as HTMLFormElement).checkValidity()),
  ).toBe(false);
});
