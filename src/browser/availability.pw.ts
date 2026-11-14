import { test, expect, autofillRequest, geminiResponse } from './fixtures';
import type { Profile } from '../types/profile';

for (const immediate of [true, false]) {
  test(`formats free-text availability while preserving dates and durations, immediate=${immediate}`, async ({
    context,
    page,
    extension,
  }) => {
    await context.route('https://generativelanguage.googleapis.com/**', (route) => {
      const { fields } = autofillRequest(route);
      return route.fulfill({
        json: geminiResponse(
          JSON.stringify(
            fields
              .filter((field) => /When could you join/.test(field.label ?? ''))
              .map((field) => ({
                fieldId: field.fieldId,
                profilePath: 'professional.noticePeriod.availableDate',
                confidence: 'high',
              })),
          ),
        ),
      });
    });
    await extension.worker.evaluate(async (immediate) => {
      const { profile } = await chrome.storage.local.get<{ profile: Profile }>('profile');
      profile.professional.noticePeriod = immediate
        ? { immediate: true }
        : { immediate: false, value: 2, unit: 'week' };
      await chrome.storage.local.set({ profile });
    }, immediate);
    await page.evaluate(() => {
      document.body.innerHTML = `<form><h1>Job application</h1><label>First name<input name="firstName" required></label><label>Email<input type="email" name="email" required></label>
        <label>When could you join our team?<input id="when" required></label>
        <label>Start availability<input id="rules" required></label>
        <label>Date available<input id="date" type="date" required></label>
        <label>Available from<input id="mask" placeholder="MM/DD/YYYY" required></label>
        <label>Notice period<select id="duration" required><option value="">Select</option><option>Immediate</option><option>2 Weeks</option></select></label><output></output></form>`;
      document.querySelector('#when')!.addEventListener('change', (event) => {
        document.querySelector('output')!.textContent = (event.target as HTMLInputElement).value;
      });
    });
    const date = await page.evaluate((immediate) => {
      const d = new Date();
      if (!immediate) d.setDate(d.getDate() + 14);
      return {
        iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
        masked: `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`,
      };
    }, immediate);
    await extension.send('AUTOFILL_SCAN');
    await extension.send('AUTOFILL_FILL', 'overwrite');
    const sentence = immediate ? 'Available immediately.' : "Available after 2 weeks' notice.";
    await expect(page.locator('#when')).toHaveValue(sentence);
    await expect(page.locator('#rules')).toHaveValue(sentence);
    await expect(page.locator('output')).toHaveText(sentence);
    await expect(page.locator('#date')).toHaveValue(date.iso);
    await expect(page.locator('#mask')).toHaveValue(date.masked);
    await expect(page.locator('#duration')).toHaveValue(immediate ? 'Immediate' : '2 Weeks');
    expect(
      await page.locator('form').evaluate((form) => (form as HTMLFormElement).checkValidity()),
    ).toBe(true);
    await extension.send('CLEAR');
    await expect(page.locator('#when')).toHaveValue('');
    await expect(page.locator('#date')).toHaveValue('');
    await expect(page.locator('#duration')).toHaveValue('');
  });
}
