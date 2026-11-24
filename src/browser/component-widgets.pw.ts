import { test, expect, geminiResponse, autofillRequest } from './fixtures';
import type { Profile } from '../types/profile';

test('fills component phone, education level and Material availability through committed values', async ({
  page,
  context,
  extension,
}) => {
  await extension.worker.evaluate(async () => {
    const { profile } = await chrome.storage.local.get('profile');
    await chrome.storage.local.set({
      profile: {
        ...(profile as Profile),
        personal: {
          ...(profile as Profile).personal,
          phone: { countryCode: 'TH', callingCode: '+66', number: '812345678' },
        },
        professional: { noticePeriod: { immediate: true } },
        education: [
          {
            institution: 'Synthetic University',
            degree: 'Bachelor of Science',
            fieldOfStudy: 'Computer Science',
            startDate: '2014',
            endDate: '2018',
            isCurrent: false,
          },
        ],
      },
    });
  });
  await context.route('https://generativelanguage.googleapis.com/**', (route) =>
    route.fulfill({
      json: geminiResponse(
        JSON.stringify(
          autofillRequest(route)
            .fields.filter((field) => /availability/i.test(field.label))
            .map((field) => ({
              fieldId: field.fieldId,
              profilePath: 'professional.noticePeriod.availableDate',
              confidence: 'high',
            })),
        ),
      ),
    }),
  );
  await page.evaluate(() => {
    document.body.innerHTML = `<style>ui-phone,ui-select,ui-date { display:block; margin:16px; } .cdk-overlay-pane { background:white; border:1px solid; padding:8px; } button { padding:8px; } .field { margin:20px; } ui-select input { opacity:0; width:1px; }</style>
      <form><h1>Job application</h1><label>First name<input name="firstName" required></label><label>Email<input name="email" type="email" required></label>
      <div class="field"><label>Phone</label><ui-phone formcontrolname="phone" class="ng-invalid"><button type="button" id="country">+33 keyboard_arrow_down</button><input id="phone" placeholder="06 12 34 56 78" required></ui-phone></div>
      <div class="field"><label>Your level of education</label><ui-select data-searchable="true" class="dropdown-close ng-invalid"><ui-input><div class="trigger"><span class="value placeholder">Choose...</span></div><input id="degree" placeholder="Search"></ui-input><button type="button" aria-label="Clear selection" hidden>×</button></ui-select></div>
      <div class="field"><label>Availability for any position</label><ui-date class="ng-invalid"><input id="availability" class="mat-datepicker-input" data-mat-calendar="calendar" aria-haspopup="dialog" required></ui-date></div>
      <button type="submit">Submit application</button></form>
      <div class="cdk-overlay-pane" id="unrelated"><button type="button"><span class="option-label">Bachelor from another form</span></button></div>`;
    const phone = document.querySelector<HTMLInputElement>('#phone')!;
    const country = document.querySelector<HTMLButtonElement>('#country')!;
    let code = '+33';
    const formatPhone = () => {
      const digits = phone.value.replace(/\D/g, '').slice(0, code === '+33' ? 10 : 9);
      phone.value = digits.replace(/(\d{3})(?=\d)/g, '$1 ').trim();
      const accepted = !digits || (code === '+66' && digits.length === 9);
      phone.setCustomValidity(accepted ? '' : 'Invalid national number');
      phone.parentElement!.classList.toggle('ng-invalid', !digits || !accepted);
    };
    phone.addEventListener('input', formatPhone);
    country.addEventListener('click', () => {
      document.getElementById('countries')?.remove();
      const panel = document.createElement('div');
      panel.id = 'countries';
      panel.className = 'cdk-overlay-pane';
      panel.innerHTML = '<input type="search"><div role="listbox"></div>';
      document.body.append(panel);
      const search = panel.querySelector('input')!;
      const render = () => {
        const list = panel.querySelector('[role=listbox]')!;
        const countries = [
          { label: 'France (+33)', code: '+33' },
          { label: 'Thaïlande (+66)', code: '+66' },
        ];
        // Virtual lists initially render only the selected country's neighborhood.
        const visible = search.value
          ? countries.filter((item) =>
              item.label
                .replace(/\s*\(\+\d+\)/, '')
                .toLowerCase()
                .includes(search.value.toLowerCase()),
            )
          : countries.filter((item) => item.code === code);
        list.replaceChildren(
          ...visible.map((item) => {
            const option = document.createElement('button');
            option.type = 'button';
            option.setAttribute('role', 'option');
            option.textContent = item.label;
            option.addEventListener('click', () => {
              code = item.code;
              country.textContent = `${code} keyboard_arrow_down`;
              panel.remove();
              formatPhone();
            });
            return option;
          }),
        );
      };
      search.addEventListener('input', render);
      render();
    });
    const degree = document.querySelector<HTMLInputElement>('#degree')!;
    const widget = degree.closest('ui-select')!;
    const clear = widget.querySelector<HTMLButtonElement>('button')!;
    clear.addEventListener('click', () => {
      widget.querySelector('.value')!.textContent = 'Choose...';
      widget.querySelector('.value')!.classList.add('placeholder');
      widget.classList.add('ng-invalid');
      clear.hidden = true;
    });
    widget.querySelector('.trigger')!.addEventListener('click', () => {
      const existing = document.getElementById('degrees');
      if (existing) {
        existing.remove();
        widget.classList.add('dropdown-close');
        return;
      }
      widget.classList.remove('dropdown-close');
      const panel = document.createElement('div');
      panel.id = 'degrees';
      panel.className = 'cdk-overlay-pane';
      for (const label of [
        'Baccalaureate (bac +0)',
        'Licence, Bachelor or equivalent (bac +3)',
        "Master's degree or equivalent (bac +5)",
      ]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.innerHTML = `<span class="option-label">${label}</span>`;
        button.addEventListener('click', () => {
          widget.querySelector('.value')!.textContent = label;
          widget.querySelector('.value')!.classList.remove('placeholder');
          widget.classList.remove('ng-invalid');
          widget.classList.add('dropdown-close');
          clear.hidden = false;
          panel.remove();
        });
        panel.append(button);
      }
      document.body.append(panel);
    });
    const date = document.querySelector<HTMLInputElement>('#availability')!;
    date.addEventListener('input', () => {
      const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.value);
      date.parentElement!.classList.toggle('ng-invalid', !parts);
      if (parts) date.value = `${parts[3]}/${parts[2]}/${parts[1]}`;
      // The native input remains valid even when its component rejected prose.
    });
    (window as unknown as { formEvents: Record<string, number> }).formEvents = {
      submits: 0,
      input: 0,
      change: 0,
      blur: 0,
    };
    const events = (window as unknown as { formEvents: Record<string, number> }).formEvents;
    document.querySelector('form')!.addEventListener('submit', (event) => {
      event.preventDefault();
      events.submits++;
    });
    for (const type of ['input', 'change', 'blur'])
      document.querySelector('form')!.addEventListener(type, () => events[type]++, true);
  });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await expect(page.locator('#country')).toHaveText('+66 keyboard_arrow_down');
  await expect(page.locator('#phone')).toHaveValue('812 345 678');
  await expect(page.locator('ui-phone')).not.toHaveClass(/ng-invalid/);
  await expect(page.locator('ui-select .value')).toHaveText(
    'Licence, Bachelor or equivalent (bac +3)',
  );
  await expect(page.locator('#degree')).toHaveValue('');
  await expect(page.locator('ui-select')).not.toHaveClass(/ng-invalid/);
  const expected = await page.evaluate(() => {
    const date = new Date();
    return [date.getDate(), date.getMonth() + 1, date.getFullYear()]
      .map((part, index) => (index < 2 ? String(part).padStart(2, '0') : String(part)))
      .join('/');
  });
  await expect(page.locator('#availability')).toHaveValue(expected);
  await expect(page.locator('ui-date')).not.toHaveClass(/ng-invalid/);
  expect(
    await page.locator('form').evaluate((form) => (form as HTMLFormElement).checkValidity()),
  ).toBe(true);
  const events = await page.evaluate(
    () => (window as unknown as { formEvents: Record<string, number> }).formEvents,
  );
  expect(events.submits).toBe(0);
  expect(events.input).toBeGreaterThan(0);
  expect(events.change).toBeGreaterThan(0);
  expect(events.blur).toBeGreaterThan(0);
  await extension.send('CLEAR');
  await expect(page.locator('#country')).toHaveText('+33 keyboard_arrow_down');
  await expect(page.locator('#phone')).toHaveValue('');
  await expect(page.locator('ui-select .value')).toHaveText('Choose...');
  await expect(page.locator('#availability')).toHaveValue('');
});
