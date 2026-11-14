import { test, expect, autofillRequest, geminiResponse } from './fixtures';
import type { Profile } from '../types/profile';

for (const { authorized, via } of [false, true].flatMap((authorized) =>
  ['floating', 'message'].map((via) => ({ authorized, via })),
)) {
  test(`fills structured application fields via ${via}; UK authorized=${authorized}`, async ({
    context,
    page,
    extension,
  }) => {
    let dateAnswers = 0;
    await context.route('https://generativelanguage.googleapis.com/**', (route) => {
      const { fields } = autofillRequest(route);
      const answers = fields
        .filter((field) => field.type === 'radio' && /right to work in the UK/.test(field.label))
        .map((field) => ({
          fieldId: field.fieldId,
          selectedOption: field.options?.find(
            (option) => option.label.toLowerCase() === (authorized ? 'yes' : 'no'),
          )?.id,
          confidence: 'high',
        }));
      const dates = fields.flatMap((field) => {
        if (!['education', 'workHistory'].includes(field.section ?? '')) return [];
        const part = /^start date/i.test(field.label)
          ? 'startDate'
          : /^end date/i.test(field.label)
            ? 'endDate'
            : null;
        return part
          ? [
              {
                fieldId: field.fieldId,
                profilePath: `${field.section}.1.${part}`,
                confidence: 'high',
              },
            ]
          : [];
      });
      dateAnswers += dates.length;
      return route.fulfill({ json: geminiResponse(JSON.stringify([...answers, ...dates])) });
    });
    await extension.worker.evaluate(async (authorized) => {
      const { profile } = await chrome.storage.local.get<{ profile: Profile }>('profile');
      profile.personal.phone = { countryCode: 'TH', callingCode: '+66', number: '812345678' };
      profile.address = {
        street: '10 Test Road',
        city: 'Bangkok',
        state: 'Bangkok',
        postalCode: '10310',
        country: 'TH',
      };
      profile.professional.summary = 'A detailed career summary. '.repeat(20);
      profile.workHistory = [
        {
          company: 'Older Company',
          title: 'Developer',
          startDate: '2018-01',
          endDate: '2020-12',
          isCurrent: false,
        },
        {
          company: 'Recent Company',
          title: 'Technical Lead',
          description: 'Owned the backend platform.',
          startDate: '2021-12',
          endDate: '2025-08',
          isCurrent: false,
        },
      ];
      profile.education = [
        {
          institution: 'Older University',
          degree: 'BSc',
          fieldOfStudy: 'Engineering',
          startDate: '2008-01',
          endDate: '2012-01',
          isCurrent: false,
        },
        {
          institution: 'Recent University',
          degree: 'BSc (Honours)',
          fieldOfStudy: 'Computing',
          startDate: '2023-07',
          endDate: '2024-07',
          isCurrent: false,
        },
      ];
      profile.languages = [
        { language: 'th', proficiency: 'native_bilingual' },
        { language: 'en', proficiency: 'full_professional' },
      ];
      profile.workAuthorization = [
        { country: 'US', status: 'citizen_or_pr' },
        { country: 'GB', status: authorized ? 'citizen_or_pr' : 'requires_sponsorship' },
      ];
      await chrome.storage.local.set({ profile });
    }, authorized);
    await page.evaluate(() => {
      document.body.innerHTML = `<form><h1>Job application</h1><label>First name<input name="firstName" required></label><label>Last name<input name="lastName"></label><label>Email<input name="email" type="email" required></label>
        <label>Headline (Optional)<input id="headline" name="headline" maxlength="255"></label>
        <label id="phone-label">Phone</label><div class="iti"><button type="button" class="iti__selected-country" aria-label="Change country, Thailand (+66)"></button><input id="phone" name="phone" type="tel" autocomplete="tel" aria-labelledby="phone-label" required pattern="[0-9]{2} [0-9]{3} [0-9]{4}"></div>
        <label>Address (Optional)<input id="address" name="address" aria-describedby="address-help"></label><p id="address-help">Include your city, region, and country.</p>
        <div id="education"><div>Education (Optional)<button type="button" id="add-education">Add Education</button></div><ul></ul></div>
        <div id="experience"><div>Experience (Optional)<button type="button" id="add-experience">Add Experience</button></div><ul></ul></div>
        <label>Summary (Optional)<textarea id="summary" name="summary"></textarea></label>
        <fieldset><legend>You must have the right to work in the UK for this role. We are unable to offer visa sponsorship now or in the future. Do you have the right to work in the UK and not require visa sponsorship now or at any point in the future?</legend><label><input type="radio" name="uk" value="Yes">YES</label><label><input type="radio" name="uk" value="No">NO</label></fieldset>
        <label id="english-label">What is your level of proficiency in English?</label><input id="english" name="english" readonly role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-controls="english-options" aria-owns="english-options" aria-labelledby="english-label" placeholder="Select an option…"><div role="listbox" id="english-options" hidden>${['None', 'Conversational', 'Professional', 'Native or bilingual'].map((text) => `<div role="option"><span role="presentation"><span class="option-label">${text}</span></span></div>`).join('')}</div>
        <output id="row-saves">0</output><output id="submissions">0</output><output id="invalid-date-writes">0</output><button type="submit">Submit application</button></form>`;
      const phone = document.querySelector<HTMLInputElement>('#phone')!;
      phone.addEventListener('input', () => {
        const digits = phone.value.replace(/\D/g, '');
        if (phone.value.startsWith('+66'))
          phone.value = digits.slice(2).replace(/^(\d{2})(\d{3})(\d{4})$/, '$1 $2 $3');
      });
      document
        .querySelector('#headline')!
        .setAttribute('value', 'An overlong summary. '.repeat(20));
      const row = (education: boolean) =>
        `<li><label>${education ? '*School' : '*Title'}<input id="${education ? 'school' : 'title'}" name="${education ? 'school' : 'title'}" required><svg><title>SVGs not supported by this browser.</title></svg></label>${education ? '<label>Field of study<input id="study" name="field_of_study"></label><label>Degree<input id="degree" name="degree"></label>' : '<label>Company<input id="company" name="company"></label><label>Summary (Optional)<textarea id="work-summary" name="work-summary"></textarea></label>'}<label>Start date (Optional)<input id="${education ? 'school' : 'work'}-start" name="start_date" placeholder="MM/YYYY" inputmode="tel" pattern="[0-9]{2}/[0-9]{4}"></label><label>End date (Optional)<input id="${education ? 'school' : 'work'}-end" name="end_date" placeholder="MM/YYYY" inputmode="tel" pattern="[0-9]{2}/[0-9]{4}"></label><button type="button" class="update">Update</button><button type="button">Cancel</button></li>`;
      for (const education of [true, false]) {
        document
          .querySelector(`#add-${education ? 'education' : 'experience'}`)!
          .addEventListener('click', () => {
            document
              .querySelector(`#${education ? 'education' : 'experience'} ul`)!
              .insertAdjacentHTML('beforeend', row(education));
            document
              .querySelectorAll<HTMLInputElement>('input[name=start_date],input[name=end_date]')
              .forEach((input) => {
                input.addEventListener('focus', () => {
                  const calendar = document.createElement('div');
                  calendar.setAttribute('role', 'grid');
                  calendar.textContent = '2026 Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec';
                  input.parentElement!.append(calendar);
                });
                input.addEventListener('blur', () =>
                  input.parentElement!.querySelector('[role=grid]')?.remove(),
                );
                let previous: string | undefined;
                input.addEventListener('keydown', () => {
                  previous = input.value;
                });
                input.addEventListener('input', () => {
                  if (previous === undefined) input.value = '';
                  if (input.value && !/^\d{2}\/\d{4}$/.test(input.value))
                    document.querySelector('#invalid-date-writes')!.textContent = '1';
                });
              });
            document
              .querySelectorAll('li input[required]')
              .forEach((input) =>
                input.addEventListener('input', () =>
                  input.parentElement!.querySelector('svg')?.remove(),
                ),
              );
            document.querySelectorAll('.update').forEach((button) =>
              button.addEventListener('click', () => {
                document.querySelector('#row-saves')!.textContent = '1';
              }),
            );
          });
      }
      const english = document.querySelector<HTMLInputElement>('#english')!;
      const list = document.querySelector<HTMLElement>('#english-options')!;
      english.addEventListener('click', () => {
        list.hidden = false;
        english.setAttribute('aria-expanded', 'true');
      });
      list.querySelectorAll<HTMLElement>('[role=option]').forEach((option) => {
        option.querySelector('[role=presentation]')!.addEventListener('mousedown', () => {
          const label = option.querySelector('.option-label')!;
          label.replaceWith(label.cloneNode(true));
        });
      });
      list.querySelectorAll<HTMLElement>('[role=option]').forEach((option) =>
        option.querySelector('[role=presentation]')!.addEventListener('click', () => {
          english.value = option.textContent!;
          option.setAttribute('aria-selected', 'true');
          list.hidden = true;
          english.setAttribute('aria-expanded', 'false');
        }),
      );
      document.querySelector('form')!.addEventListener('submit', (event) => {
        event.preventDefault();
        document.querySelector('#submissions')!.textContent = '1';
      });
    });
    if (!authorized) await page.locator('input[name=uk][value=Yes]').check();
    await page.getByRole('button', { name: 'Add Education', exact: true }).click();
    await page.getByRole('button', { name: 'Add Experience', exact: true }).click();
    const widget = page.locator('[data-job-buddy-ui]');
    if (via === 'floating') {
      await page.bringToFront();
      await widget.getByRole('button', { name: 'Fill Form', exact: true }).click();
      await expect(widget.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
    } else {
      await extension.send('AUTOFILL_SCAN');
      await extension.send('AUTOFILL_FILL', 'overwrite');
    }
    await expect(page.locator('#headline')).toHaveValue('Technical Lead');
    await expect(page.locator('#phone')).toHaveValue('81 234 5678');
    await expect(page.locator('#address')).toHaveValue('10 Test Road, Bangkok, 10310, Thailand');
    await expect(page.locator('#school')).toHaveValue('Recent University');
    await expect(page.locator('#school-start')).toHaveValue('07/2023');
    await expect(page.locator('#school-end')).toHaveValue('07/2024');
    await expect(page.locator('#title')).toHaveValue('Technical Lead');
    await expect(page.locator('#company')).toHaveValue('Recent Company');
    await expect(page.locator('#work-summary')).toHaveValue('Owned the backend platform.');
    await expect(page.locator('#work-start')).toHaveValue('12/2021');
    await expect(page.locator('#work-end')).toHaveValue('08/2025');
    await expect(page.locator('#invalid-date-writes')).toHaveText('0');
    expect(dateAnswers).toBeGreaterThanOrEqual(4);
    await expect(page.locator('#summary')).toHaveValue('A detailed career summary. '.repeat(20));
    await expect(page.locator('#english')).toHaveValue('Professional');
    await expect(page.locator(`input[name=uk][value=${authorized ? 'Yes' : 'No'}]`)).toBeChecked();
    expect(
      await page.locator('form').evaluate((form) => (form as HTMLFormElement).checkValidity()),
    ).toBe(true);
    await expect(page.locator('#education li')).toHaveCount(1);
    await expect(page.locator('#experience li')).toHaveCount(1);
    await expect(page.locator('#row-saves')).toHaveText('0');
    await expect(page.locator('#submissions')).toHaveText('0');
    if (via === 'floating') await widget.getByRole('button', { name: 'Undo', exact: true }).click();
    else await extension.send('CLEAR');
    await expect(page.locator('#phone')).toHaveValue('');
    await expect(page.locator('#school')).toHaveValue('');
    await expect(page.locator('#title')).toHaveValue('');
    await expect(page.locator('#english')).toHaveValue('');
  });
}
