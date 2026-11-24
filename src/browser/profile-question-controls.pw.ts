import { test, expect, stubEmptyGemini } from './fixtures';
import type { Profile } from '../types/profile';

for (const roles of [true, false]) {
  test(`fills profile questions with ${roles ? 'ARIA' : 'legacy role-less'} React Select menus`, async ({
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
    await page.evaluate((roles) => {
      document.body.innerHTML = `<style>.react-select__control { border:1px solid; padding:10px; min-height:30px; } .react-select__value-container { display:flex; } .dummy { opacity:0; width:1px; } [role=option] { padding:8px; }</style><form><h1>Job application</h1>
    <label>First name<input name="firstName" required></label><label>Last name<input name="lastName"></label><label>Email<input type="email" name="email" required></label>
    <label>Address Line 1<input id="line1"></label><label>Address Line 2<input id="line2"></label>
    <label>Personal Summary This section is optional. Use it to tell us a little more about yourself.<textarea id="summary"></textarea></label>
    <label>Please provide your (legal) first name<input id="legal-first"></label><label>Please provide your (legal) last name<textarea id="legal-last"></textarea></label>
    <div id="choices"></div></form>`;
      const add = (id: string, label: string, options: string[], searchable = false) => {
        const area = document.createElement('div');
        area.innerHTML = `<label for="${id}">${label}</label><div class="react-select__control"><div class="react-select__value-container"><div class="react-select__placeholder">Select...</div><input id="${id}" role="combobox" inputmode="none" aria-readonly="true" aria-expanded="false" class="dummy"></div></div><input type="hidden" name="${id}" value="">`;
        document.getElementById('choices')!.append(area);
        const input = area.querySelector<HTMLInputElement>('input')!;
        const container = area.querySelector('.react-select__value-container')!;
        const backing = area.querySelector<HTMLInputElement>('input[type=hidden]')!;
        if (searchable) {
          input.removeAttribute('aria-readonly');
          input.removeAttribute('inputmode');
          input.className = '';
        }
        const close = () => {
          document.getElementById(`${id}-menu`)?.remove();
          input.setAttribute('aria-expanded', 'false');
        };
        input.addEventListener('blur', close);
        input.addEventListener('keydown', (event) => {
          if (event.key === 'ArrowDown') open();
          if (event.key === 'Escape') close();
        });
        input.addEventListener('input', () => {
          if (!searchable) input.dataset.unexpectedInput = 'true';
        });
        backing.addEventListener('change', () => {
          backing.dataset.changes = String(Number(backing.dataset.changes ?? 0) + 1);
        });
        const open = () => {
          if (input.getAttribute('aria-expanded') === 'true') return;
          input.setAttribute('aria-expanded', 'true');
          const menu = document.createElement('div');
          menu.id = `${id}-menu`;
          menu.className = 'react-select__menu';
          input.setAttribute('aria-controls', menu.id);
          if (roles) menu.setAttribute('role', 'listbox');
          for (const text of options) {
            const option = document.createElement('div');
            option.className = 'react-select__option';
            if (roles) option.setAttribute('role', 'option');
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
              backing.value = text;
              input.value = '';
              backing.dispatchEvent(new Event('change', { bubbles: true }));
              input.setAttribute('aria-expanded', 'false');
              menu.remove();
            });
            menu.append(option);
          }
          document.body.append(menu);
        };
        // Legacy widgets rely on keyboard/control handlers, not input clicks.
        if (roles) input.addEventListener('click', open);
      };
      add(
        'rtw',
        'Do you have the Right to Work (RTW) in the UK?',
        [
          'I am a British or Irish National',
          'I have Indefinite Leave to Remain in the UK',
          'I do not have the Right to Work in the UK without restrictions',
          'I do not have the Right to Work in the UK',
        ],
        true,
      );
      add('gender', 'Gender Identity', ['Male', 'Female', 'Prefer not to say']);
      add('ethnicity', 'Ethnicity', ['Asian', 'White', 'Prefer not to say']);
      add('birth-sex', 'Sex Assigned at Birth', ['Male', 'Female']);
      // An unrelated existing portal must never supply this field's choices.
      const other = document.createElement('div');
      other.innerHTML = '<div role=option class=react-select__option>Female</div>';
      document.body.append(other);
    }, roles);
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
    await expect(page.locator('[data-unexpected-input]')).toHaveCount(0);
    await expect(page.locator('input[type=hidden][data-changes="1"]')).toHaveCount(3);
    expect(
      await page
        .locator('form')
        .evaluate((form) => Object.fromEntries(new FormData(form as HTMLFormElement))),
    ).toMatchObject({
      rtw: 'I do not have the Right to Work in the UK',
      gender: 'Female',
      ethnicity: 'Asian',
      'birth-sex': '',
    });
    expect(
      await page.locator('form').evaluate((form) => (form as HTMLFormElement).checkValidity()),
    ).toBe(true);
    await extension.send('CLEAR');
    await expect(page.locator('#line1')).toHaveValue('');
    await expect(page.locator('#legal-first')).toHaveValue('');
  });
}
