import { test, expect, stubEmptyGemini, extensionUrl } from './fixtures';
import { RULE_PROFILE } from '../autofill/ruleMatching.fixture';
import type { FrameFillLog } from '../autofill/fillLog';
import { build } from 'vite';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

let reactBundle: string;
test.beforeAll(async () => {
  const directory = resolve('.output/writing-react-test');
  await build({
    configFile: false,
    envDir: false,
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: {
      lib: {
        entry: resolve('src/browser/fixtures/writing-react.ts'),
        formats: ['iife'],
        name: 'WritingReact',
        fileName: () => 'fixture.js',
      },
      outDir: directory,
      emptyOutDir: true,
    },
    logLevel: 'silent',
  });
  reactBundle = await readFile(resolve(directory, 'fixture.js'), 'utf8');
});
test.beforeEach(async ({ page, context, extension }) => {
  const profile = structuredClone(RULE_PROFILE);
  profile.personal.dateOfBirth = '1996-06-01';
  profile.personal.disabilityStatus = 'I do not have a disability';
  await extension.worker.evaluate(async (profile) => {
    await chrome.storage.local.set({ profile, learnedMappings: {} });
  }, profile);
  await stubEmptyGemini(context);
  await page.evaluate(() => {
    document.body.innerHTML = '<form><h1>Job application</h1></form>';
  });
});

test('keeps valid original answers on failure and honors year-first dates', async ({
  page,
  extension,
}) => {
  await page.locator('form').evaluate((form) => {
    form.innerHTML +=
      '<label>First name<input id="name" value="BOB" pattern="[A-Z]{3}"></label><label>Date of birth<input id="birth" placeholder="YYYY-MM-DD" pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}"></label>';
  });
  await extension.send('AUTOFILL_SCAN');
  const result = await extension.send('AUTOFILL_FILL', 'overwrite');
  await expect(page.locator('#name')).toHaveValue('BOB');
  await expect(page.locator('#birth')).toHaveValue('1996-06-01');
  expect(result.some((item) => item.failed === 1 && item.noReview === 1)).toBe(true);
  await extension.send('CLEAR');
  await expect(page.locator('#name')).toHaveValue('BOB');
  await expect(page.locator('#birth')).toHaveValue('');
});

test('updates React state, triggers onBlur, and preserves manual changes on Undo', async ({
  page,
  extension,
}) => {
  await page.evaluate(() => {
    document.body.innerHTML = '<div id="react-root"></div>';
  });
  await page.addScriptTag({ content: reactBundle });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await expect
    .poll(async () => JSON.parse((await page.locator('#react-state').textContent())!))
    .toMatchObject({ text: 'Alex', checked: true, blurred: true });
  await page.locator('#rerender').click();
  await expect(page.locator('#react-check')).toBeChecked();
  // A user edit remains theirs even when they later return to the filled value.
  await page.locator('#react-text').fill('Manual');
  await page.locator('#react-text').fill('Alex');
  await page.locator('#rerender').click();
  const undone = await extension.send('CLEAR');
  expect(undone.every((result) => result.success === true)).toBe(true);
  await expect(page.locator('#react-text')).toHaveValue('Alex');
  await expect(page.locator('#react-check')).not.toBeChecked();
  await expect
    .poll(async () => JSON.parse((await page.locator('#react-state').textContent())!))
    .toMatchObject({ text: 'Alex', checked: false });
});

test('rejects opposite options, unavailable controls, and incompatible files', async ({
  page,
  extension,
}) => {
  await page.locator('form').evaluate((form) => {
    form.innerHTML +=
      '<label>Disability status<select id="disability"><option value="">Select</option><option>I do have a disability</option><option>Decline to self-identify</option></select></label><label>First name<input id="disabled" value="Before"></label><label>Resume<input id="resume" type="file" accept=".docx"></label>';
    const input = document.querySelector<HTMLInputElement>('#disabled')!;
    input.onfocus = () => {
      input.disabled = true;
    };
  });
  await extension.send('AUTOFILL_SCAN');
  const result = await extension.send('AUTOFILL_FILL', 'overwrite');
  await expect(page.locator('#disability')).toHaveValue('');
  await expect(page.locator('#disabled')).toHaveValue('Before');
  expect(
    await page.locator('#resume').evaluate((input) => (input as HTMLInputElement).files!.length),
  ).toBe(0);
  expect(result.every((item) => item.noReview === 0)).toBe(true);
});

test('verifies rejected writes and accepts a valid phone mask', async ({ page, extension }) => {
  await page.locator('form').evaluate((form) => {
    form.innerHTML +=
      '<label>First name<input id="reject"></label><label>Summary<div id="editor" role="textbox" contenteditable></div></label><label>Phone<input id="phone" type="tel" autocomplete="tel-national"></label><label>Resume<input id="file" type="file"></label>';
    const reject = document.querySelector<HTMLInputElement>('#reject')!;
    reject.oninput = () =>
      queueMicrotask(() => {
        reject.value = '';
      });
    const editor = document.querySelector<HTMLElement>('#editor')!;
    editor.oninput = () => {
      editor.textContent = '';
    };
    const phone = document.querySelector<HTMLInputElement>('#phone')!;
    phone.oninput = () => {
      phone.value = phone.value.replace(/^(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3');
    };
    const file = document.querySelector<HTMLInputElement>('#file')!;
    file.oninput = () => {
      file.value = '';
    };
  });
  await extension.send('AUTOFILL_SCAN');
  const result = await extension.send('AUTOFILL_FILL', 'overwrite');
  await expect(page.locator('#reject')).toHaveValue('');
  await expect(page.locator('#editor')).toHaveText('');
  await expect(page.locator('#phone')).toHaveValue('(202) 555-0100');
  expect(
    await page.locator('#file').evaluate((input) => (input as HTMLInputElement).files!.length),
  ).toBe(0);
  expect(result.some((item) => item.failed === 3 && item.noReview === 1)).toBe(true);
});

test('does not use an unrelated open dropdown', async ({ page, extension }) => {
  await page.locator('form').evaluate((form) => {
    form.innerHTML +=
      '<label id="label">Country</label><button id="target" type="button" role="combobox" aria-labelledby="label">Select</button><input id="other"><div role="listbox"><div role="option">Thailand</div></div>';
    document.querySelector<HTMLElement>('[role="option"]')!.onclick = () => {
      (document.querySelector('#other') as HTMLInputElement).value = 'Wrong field';
    };
  });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await expect(page.locator('#target')).toHaveText('Select');
  await expect(page.locator('#other')).toHaveValue('');
});

test('blocks native submission from custom dropdown activation', async ({ page, extension }) => {
  await page.locator('form').evaluate((form) => {
    form.innerHTML +=
      '<label id="label">Country</label><button id="country" role="combobox" aria-labelledby="label" aria-controls="options">Select</button><div id="options" role="listbox"><a role="option" href="/unwanted">Thailand</a></div><output id="submits">0</output>';
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      document.querySelector('#submits')!.textContent = '1';
    });
    document.querySelector<HTMLElement>('[role="option"]')!.onclick = () => {
      const trigger = document.querySelector<HTMLElement>('#country')!;
      trigger.dataset.selected = 'Thailand';
      trigger.textContent = 'Thailand';
    };
  });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await expect(page.locator('#country')).toHaveText('Thailand');
  await expect(page.locator('#submits')).toHaveText('0');
  expect(page.url()).not.toContain('/unwanted');
});

test('handles slow, searchable and ARIA-named options and restores through clear controls', async ({
  page,
  extension,
}) => {
  await page.locator('form').evaluate((form) => {
    form.innerHTML += `<div><label id="slow-label">Country</label><button type="button" id="slow" role="combobox" aria-labelledby="slow-label" aria-controls="slow-options" aria-expanded="false">Select</button><button type="button" id="clear-slow" aria-label="Clear country">Clear</button><div id="slow-options" role="listbox"></div></div>
    <div><button type="button" id="clear-search" aria-label="Clear country">Clear</button><label>Country<input id="search" role="combobox" aria-controls="search-options" aria-expanded="false"></label><div id="search-options" role="listbox"></div></div>`;
    const slow = document.querySelector<HTMLElement>('#slow')!,
      search = document.querySelector<HTMLInputElement>('#search')!;
    slow.onclick = () => {
      const open = slow.getAttribute('aria-expanded') !== 'true';
      slow.setAttribute('aria-expanded', String(open));
      if (open)
        setTimeout(() => {
          const option = document.createElement('div');
          option.setAttribute('role', 'option');
          option.textContent = 'Thailand';
          option.onclick = () => {
            slow.textContent = 'Thailand';
            slow.dataset.selected = 'Thailand';
            slow.setAttribute('aria-expanded', 'false');
          };
          document.querySelector('#slow-options')!.replaceChildren(option);
        }, 700);
    };
    document.querySelector<HTMLElement>('#clear-slow')!.onclick = () => {
      slow.textContent = 'Select';
      slow.dataset.selected = '';
    };
    document.querySelector<HTMLElement>('#clear-search')!.onclick = () => {
      search.value = '';
      search.dataset.selected = '';
      search.setAttribute('aria-expanded', 'false');
    };
    search.oninput = () => {
      search.setAttribute('aria-expanded', 'true');
      setTimeout(() => {
        const option = document.createElement('div');
        option.setAttribute('role', 'option');
        option.setAttribute('aria-label', 'Thailand');
        option.onclick = () => {
          option.setAttribute('aria-selected', 'true');
          search.dataset.selected = 'Thailand';
          search.setAttribute('aria-expanded', 'false');
        };
        document.querySelector('#search-options')!.replaceChildren(option);
      }, 30);
    };
  });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await expect(page.locator('#slow')).toHaveText('Thailand');
  await expect(page.locator('#search')).toHaveValue('Thailand');
  expect((await extension.send('CLEAR')).every((result) => result.success === true)).toBe(true);
  await expect(page.locator('#slow')).toHaveText('Select');
  await expect(page.locator('#search')).toHaveValue('');
});

test('reports incomplete Undo for a widget without a reset surface', async ({
  page,
  extension,
}) => {
  await page.locator('form').evaluate((form) => {
    form.innerHTML +=
      '<label id="label">Country</label><button type="button" id="country" role="combobox" aria-labelledby="label" aria-controls="choices">Select</button><div id="choices" role="listbox"><div role="option">Thailand</div></div><fieldset><legend>Privacy consent</legend><label>Yes<input type="checkbox" name="consent" value="yes"></label></fieldset>';
    document.querySelector<HTMLElement>('[role="option"]')!.onclick = () => {
      const button = document.querySelector<HTMLElement>('#country')!;
      button.textContent = 'Thailand';
      button.dataset.selected = 'Thailand';
    };
  });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  const results = await extension.send('CLEAR');
  expect(results).toContainEqual({ success: false });
  await expect(page.locator('#country')).toHaveText('Thailand');
  const logs = (await extension.send('GET_FILL_LOG')) as unknown as {
    fields: { label: string; outcome: string }[];
  }[];
  expect(
    logs.flatMap((log) => log.fields).find((field) => field.label === 'Privacy consent')?.outcome,
  ).toBe('excluded');
});

test('fills and restores native multi-selects and clears shadow feedback', async ({
  page,
  extension,
}) => {
  await page.locator('form').evaluate((form) => {
    form.innerHTML +=
      '<label>Languages spoken<select id="languages" multiple><option value="en">English</option><option value="my">Burmese</option><option value="fr" selected>French</option></select></label><div id="host"></div>';
    const root = document.querySelector('#host')!.attachShadow({ mode: 'open' });
    root.innerHTML = '<label>Unusual questionnaire<input id="unmatched"></label>';
  });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  expect(
    await page
      .locator('#languages')
      .evaluate((select) => [...(select as HTMLSelectElement).selectedOptions].map((o) => o.value)),
  ).toEqual(['en', 'my']);
  await expect(page.locator('#unmatched')).toHaveCSS('background-color', 'rgba(239, 68, 68, 0.12)');
  await extension.send('CLEAR');
  expect(
    await page
      .locator('#languages')
      .evaluate((select) => [...(select as HTMLSelectElement).selectedOptions].map((o) => o.value)),
  ).toEqual(['fr']);
  await expect(page.locator('#unmatched')).not.toHaveAttribute('data-jb-highlighted');
});

test('reports retained values as rule fills when controlled inputs regenerate their IDs', async ({
  page,
  context,
  extension,
}) => {
  const profile = structuredClone(RULE_PROFILE);
  profile.address = {
    street: '88 Sample Street',
    city: 'Seattle',
    state: 'Washington',
    postalCode: '98109',
    country: 'US',
  };
  profile.professional.noticePeriod = { immediate: true };
  await extension.worker.evaluate(async (profile) => {
    await chrome.storage.local.set({ profile, learnedMappings: {} });
  }, profile);
  await page.evaluate(() => {
    document.body.innerHTML = '<div id="react-root" data-regenerated-ids></div>';
  });
  await page.addScriptTag({ content: reactBundle });
  const oldIds = await page
    .locator('input')
    .evaluateAll((inputs) => inputs.map((input) => input.id));
  await extension.send('AUTOFILL_SCAN');
  const results = await extension.send('AUTOFILL_FILL', 'overwrite');
  const expected = {
    'streetAddress.value': '88 Sample Street',
    'city.value': 'Seattle',
    'province.value': 'Washington',
    'postalCode.value': '98109',
  };
  for (const [name, value] of Object.entries(expected)) {
    const input = page.locator(`[name="${name}"]`);
    await expect(input).toHaveValue(value);
    await expect(input).toHaveAttribute('data-blurred', 'true');
    expect(await input.evaluate((element: HTMLInputElement) => element.checkValidity())).toBe(true);
  }
  await expect(page.locator('[name="dateAvailable"]')).toHaveValue(/^\d{2}\/\d{2}\/\d{4}$/);
  const newIds = await page
    .locator('input')
    .evaluateAll((inputs) => inputs.map((input) => input.id));
  expect(newIds.slice(0, 5).every((id, index) => id !== oldIds[index])).toBe(true);
  const logs = (await extension.send('GET_FILL_LOG')) as unknown as FrameFillLog[];
  const fields = logs.flatMap((log) => log.fields);
  for (const label of ['Address', 'City', 'Province', 'Postal Code', 'Date Available']) {
    expect(fields.find((field) => field.label === label)).toMatchObject({
      outcome: 'high_confidence',
      source: 'rules',
      rule: { outcome: 'filled', confidence: 0.85 },
      ai: { outcome: 'not_sent' },
    });
  }
  const pay = fields.find((field) => field.label === 'Desired Pay')!;
  expect(pay).toMatchObject({
    outcome: 'not_matched',
    source: null,
    rule: { outcome: 'not_matched' },
  });
  expect(pay.rule.confidence).toBeLessThan(0.6);
  await expect(page.locator('[name="desiredPay"]')).toHaveValue('');
  expect(results.reduce((count, result) => count + Number(result.noReview), 0)).toBe(5);
  const details = await context.newPage();
  await details.goto(extensionUrl(extension, 'options.html'));
  await details.getByRole('button', { name: 'Fill Details', exact: true }).click();
  await expect(details.getByRole('button', { name: 'Filled (5)', exact: true })).toBeVisible();
  await expect(details.getByRole('button', { name: 'Not filled (1)', exact: true })).toBeVisible();
  await details.getByRole('button', { name: 'Filled (5)', exact: true }).click();
  await expect(details.locator('summary')).toHaveCount(5);
  await expect(details.locator('summary').filter({ hasText: 'High confidence' })).toHaveCount(5);
  await extension.send('CLEAR');
  for (const name of [...Object.keys(expected), 'dateAvailable'])
    await expect(page.locator(`[name="${name}"]`)).toHaveValue('');
});
