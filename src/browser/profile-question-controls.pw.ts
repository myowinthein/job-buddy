import { test, expect, stubEmptyGemini } from './fixtures';
import type { Profile } from '../types/profile';

test('fills literal profile questions and non-searchable choices without duplicating street or inferring birth sex', async ({
  page,
  context,
  extension,
}) => {
  await stubEmptyGemini(context);
  await extension.worker.evaluate(async () => {
    const { profile } = await chrome.storage.local.get<{ profile: Profile }>('profile');
    profile.address.street = '42 Example Road';
    profile.professional.summary = 'Saved synthetic professional summary';
    profile.personal.gender = 'female';
    profile.personal.ethnicity = 'Asian';
    profile.workAuthorization = [{ country: 'GB', status: 'requires_sponsorship' }];
    await chrome.storage.local.set({ profile });
  });
  await page.evaluate(() => {
    document.body.innerHTML = `<style>.react-select__control { border:1px solid; padding:10px; min-height:30px; } .react-select__value-container { display:flex; } .dummy { opacity:0; width:1px; } [role=option] { padding:8px; }</style><form><h1>Job application</h1>
    <label>First name<input name="firstName" required></label><label>Last name<input name="lastName"></label><label>Email<input type="email" name="email" required></label>
    <label>Address Line 1<input id="line1"></label><label>Address Line 2<input id="line2"></label>
    <label>Personal Summary This section is optional. Use it to tell us a little more about yourself.<textarea id="summary"></textarea></label>
    <label>Please provide your (legal) first name<input id="legal-first"></label><label>Please provide your (legal) last name<textarea id="legal-last"></textarea></label>
    <div id="choices"></div></form>`;
    const add = (id: string, label: string, options: string[]) => {
      const area = document.createElement('div');
      area.innerHTML = `<label for="${id}">${label}</label><div class="react-select__control"><div class="react-select__value-container"><div class="react-select__placeholder">Select...</div><input id="${id}" role="combobox" inputmode="none" aria-readonly="true" aria-expanded="false" class="dummy"></div></div>`;
      document.getElementById('choices')!.append(area);
      const input = area.querySelector<HTMLInputElement>('input')!;
      const container = area.querySelector('.react-select__value-container')!;
      input.addEventListener('input', () => {
        throw new Error('A non-searchable chooser must never receive text input');
      });
      input.addEventListener('click', () => {
        if (input.getAttribute('aria-expanded') === 'true') return;
        input.setAttribute('aria-expanded', 'true');
        const menu = document.createElement('div');
        menu.setAttribute('role', 'listbox');
        for (const text of options) {
          const option = document.createElement('div');
          option.setAttribute('role', 'option');
          option.textContent = text;
          option.addEventListener('click', () => {
            container.querySelector('.react-select__placeholder')?.remove();
            let value = container.querySelector('.react-select__single-value');
            if (!value) {
              value = document.createElement('div');
              value.className = 'react-select__single-value';
              container.prepend(value);
            }
            value.textContent = text;
            input.setAttribute('aria-expanded', 'false');
            menu.remove();
          });
          menu.append(option);
        }
        document.body.append(menu);
      });
    };
    add('rtw', 'Do you have the Right to Work (RTW) in the UK?', [
      'I am a British or Irish National',
      'I have Indefinite Leave to Remain in the UK',
      'I do not have the Right to Work in the UK without restrictions',
      'I do not have the Right to Work in the UK',
    ]);
    add('gender', 'Gender Identity', ['Male', 'Female', 'Prefer not to say']);
    add('ethnicity', 'Ethnicity', ['Asian', 'White', 'Prefer not to say']);
    add('birth-sex', 'Sex Assigned at Birth', ['Male', 'Female']);
  });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await expect(page.locator('#line1')).toHaveValue('42 Example Road');
  await expect(page.locator('#line2')).toHaveValue('');
  await expect(page.locator('#summary')).toHaveValue('Saved synthetic professional summary');
  await expect(page.locator('#legal-first')).toHaveValue('Jane');
  await expect(page.locator('#legal-last')).toHaveValue('Doe');
  const answer = (id: string) =>
    page.locator(`#${id}`).locator('..').locator('.react-select__single-value');
  await expect(answer('rtw')).toHaveText('I do not have the Right to Work in the UK');
  await expect(answer('gender')).toHaveText('Female');
  await expect(answer('ethnicity')).toHaveText('Asian');
  await expect(answer('birth-sex')).toHaveCount(0);
  expect(
    await page.locator('form').evaluate((form) => (form as HTMLFormElement).checkValidity()),
  ).toBe(true);
  await extension.send('CLEAR');
  await expect(page.locator('#line1')).toHaveValue('');
  await expect(page.locator('#legal-first')).toHaveValue('');
});
