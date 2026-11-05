// Regression coverage for background learned mappings on throwaway forms.
import { test, expect } from './fixtures';
import { RULE_PROFILE } from '../autofill/ruleMatching.fixture';
import type { LearnedMappings } from '../types/storage';
test.beforeEach(async ({ page, context, extension }) => {
  await extension.worker.evaluate(async (profile) => {
    await chrome.storage.local.set({ profile, learnedMappings: {} });
  }, RULE_PROFILE);
  await context.route('https://generativelanguage.googleapis.com/**', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ candidates: [{ content: { parts: [{ text: '[]' }] } }] }),
    }),
  );
  await page.evaluate(() => {
    document.body.innerHTML =
      '<form><h1>Job application</h1></form><button type="button" id="outside">Continue</button>';
  });
});
async function settle(page: import('@playwright/test').Page) {
  await page.waitForTimeout(200);
}

test('records full long questions and reuses the trusted mapping after real corrections', async ({
  page,
  extension,
}) => {
  const question =
    'Which contact detail should be used for this application? '.repeat(24) +
    'Keep this complete ending.';
  await page.locator('form').evaluate((form, text) => {
    const label = document.createElement('label');
    label.textContent = text;
    const input = document.createElement('input');
    input.id = 'long-question';
    input.type = 'email';
    input.required = true;
    input.addEventListener('input', () => (input.dataset.inputEvent = 'received'));
    label.append(input);
    form.append(label);
  }, question);
  const input = page.locator('#long-question');
  for (const count of [1, 2]) {
    await input.evaluate((el) => {
      (el as HTMLInputElement).value = '';
    });
    await extension.send('AUTOFILL_SCAN');
    await extension.send('AUTOFILL_FILL', 'overwrite');
    await expect(input).toHaveValue('');
    await input.fill(RULE_PROFILE.personal.email);
    await page.locator('#outside').focus();
    await expect
      .poll(() =>
        extension.worker.evaluate(async () => {
          const mappings = (await chrome.storage.local.get('learnedMappings'))
            .learnedMappings as LearnedMappings;
          return mappings['127.0.0.1']?.longquestion;
        }),
      )
      .toEqual({ path: 'personal.email', count, label: question, question });
  }
  // A later run fills from the saved mapping, preserving the framework input event.
  await input.evaluate((el) => {
    (el as HTMLInputElement).value = '';
    delete (el as HTMLElement).dataset.inputEvent;
  });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await expect(input).toHaveValue(RULE_PROFILE.personal.email);
  await expect(input).toHaveAttribute('data-input-event', 'received');
  expect(await input.evaluate((el) => (el as HTMLInputElement).checkValidity())).toBe(true);
});

test('JSON import keeps a trusted school mapping attached after reordering, then fills the real form', async ({ page, context, extension }) => {
  await extension.worker.evaluate(async () => {
    await chrome.storage.local.set({ learnedMappings: { '127.0.0.1': {
      novelresponse: { path: 'education.0.institution', count: 2, scope: 'entry' },
    } } });
  });
  const options = await context.newPage();
  await options.goto(new URL('options.html', extension.worker.url()).href);
  await options.getByRole('button', { name: 'Settings', exact: true }).click();
  await options.locator('input[type="file"][accept=".json"]').setInputFiles({
    name: 'reordered.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ profile: { ...RULE_PROFILE, education: [...RULE_PROFILE.education].reverse() } })),
  });
  await options.getByRole('button', { name: 'Import All', exact: true }).click();
  await expect.poll(() => extension.worker.evaluate(async () => {
    const mappings = (await chrome.storage.local.get('learnedMappings')).learnedMappings as LearnedMappings;
    const mapping = mappings['127.0.0.1'].novelresponse;
    return typeof mapping === 'string' ? mapping : mapping.path;
  })).toBe('education.1.institution');
  await page.locator('form').evaluate(form => {
    form.innerHTML += '<label>Novel response<input id="q7" required></label>';
    const input = form.querySelector('input')!;
    input.addEventListener('input', () => input.dataset.inputEvent = 'received');
  });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await expect(page.locator('#q7')).toHaveValue(RULE_PROFILE.education[0].institution);
  await expect(page.locator('#q7')).toHaveAttribute('data-input-event', 'received');
  expect(await page.locator('#q7').evaluate(el => (el as HTMLInputElement).checkValidity())).toBe(true);
});

test('an inactive known path is preserved but cannot autofill a real input', async ({ page, extension }) => {
  await extension.worker.evaluate(async () => {
    await chrome.storage.local.set({ learnedMappings: { '127.0.0.1': {
      novelresponse: { path: 'personal.email', count: 2, inactive: true },
    } } });
  });
  await page.locator('form').evaluate(form => {
    form.innerHTML += '<label>Novel response<input id="q7" required></label>';
  });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await expect(page.locator('#q7')).toHaveValue('');
  expect(await page.locator('#q7').evaluate(el => (el as HTMLInputElement).checkValidity())).toBe(false);
  expect(await extension.worker.evaluate(async () => {
    const mappings = (await chrome.storage.local.get('learnedMappings')).learnedMappings as LearnedMappings;
    return mappings['127.0.0.1'].novelresponse;
  })).toMatchObject({ inactive: true, count: 2 });
});
test('learns a real user correction to a green field', async ({ page, extension }) => {
  await page.locator('form').evaluate((form) => {
    form.innerHTML += '<label>First name<input id="q"></label>';
  });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await expect(page.locator('#q')).toHaveValue('Alex');
  await page.locator('#q').fill('Sample');
  await page.locator('#outside').focus();
  await settle(page);
  expect(
    await extension.worker.evaluate(
      async () => (await chrome.storage.local.get('learnedMappings')).learnedMappings,
    ),
  ).toMatchObject({ '127.0.0.1': { q: { path: 'personal.lastName', count: 1 } } });
});
test('does not learn programmatic changes even across repeated runs', async ({
  page,
  extension,
}) => {
  await page.locator('form').evaluate((form) => {
    form.innerHTML += '<label>Novel response<input id="q7"></label>';
  });
  for (let i = 1; i <= 2; i++) {
    await page.locator('#q7').evaluate((el) => {
      (el as HTMLInputElement).value = '';
    });
    await extension.send('AUTOFILL_SCAN');
    await extension.send('AUTOFILL_FILL', 'overwrite');
    await page.locator('#q7').evaluate((el) => {
      (el as HTMLInputElement).value = 'alex@example.test';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('blur'));
    });
    await settle(page);
    expect(
      await extension.worker.evaluate(
        async () => (await chrome.storage.local.get('learnedMappings')).learnedMappings,
      ),
    ).toEqual({});
  }
  await page.locator('#q7').evaluate((el) => {
    (el as HTMLInputElement).value = '';
  });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await expect(page.locator('#q7')).toHaveValue('');
});
test('learns later corrections after an unrelated first edit', async ({ page, extension }) => {
  await page.locator('form').evaluate((form) => {
    form.innerHTML += '<label>Novel response<input id="q7"></label>';
  });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await page.locator('#q7').fill('still thinking');
  await page.locator('#outside').focus();
  await page.locator('#q7').fill('alex@example.test');
  await page.locator('#outside').focus();
  await settle(page);
  expect(
    await extension.worker.evaluate(
      async () => (await chrome.storage.local.get('learnedMappings')).learnedMappings,
    ),
  ).toMatchObject({ '127.0.0.1': { q7: { path: 'personal.email', count: 1 } } });
});
test('never trusts a shared placeholder for an unrelated question', async ({ page, extension }) => {
  await extension.worker.evaluate(async () => {
    await chrome.storage.local.set({
      learnedMappings: {
        '127.0.0.1': {
          enteryouranswer: { path: 'personal.firstName', count: 2, label: 'Preferred first name' },
        },
      },
    });
  });
  await page.locator('form').evaluate((form) => {
    form.innerHTML +=
      '<label>Why would you like this role?<input id="q8" placeholder="Enter your answer"></label>';
  });
  await extension.send('AUTOFILL_SCAN');
  const results = await extension.send('AUTOFILL_FILL', 'overwrite');
  await expect(page.locator('#q8')).toHaveValue('');
  expect(results.some((result) => result.noReview === 1)).toBe(false);
});
test('resolves learned generic education labels by row', async ({ page, extension }) => {
  await extension.worker.evaluate(async () => {
    await chrome.storage.local.set({
      learnedMappings: {
        '127.0.0.1': {
          institution: { path: 'education.1.institution', count: 2, label: 'Institution' },
        },
      },
    });
  });
  await page.locator('form').evaluate((form) => {
    form.innerHTML +=
      '<fieldset><legend>First education</legend><label>Institution<input id="school1"></label></fieldset><fieldset><legend>Second education</legend><label>Institution<input id="school2"></label></fieldset>';
  });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await expect(page.locator('#school1')).toHaveValue('Old University');
  await expect(page.locator('#school2')).toHaveValue('New University');
});
test('does not recreate mappings from a completed form after reset', async ({
  page,
  extension,
}) => {
  await page.locator('form').evaluate((form) => {
    form.innerHTML += '<label>Novel response<input id="q7"></label>';
  });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await extension.worker.evaluate(async () => {
    await chrome.storage.local.remove(['profile', 'learnedMappings']);
  });
  await page.locator('#q7').fill('alex@example.test');
  await page.locator('#outside').focus();
  await settle(page);
  expect(
    await extension.worker.evaluate(
      async () => (await chrome.storage.local.get('learnedMappings')).learnedMappings ?? {},
    ),
  ).toEqual({});
});
test('keeps an unidentified historical ID pending alongside legacy mappings', async ({ page, extension }) => {
  await extension.worker.evaluate(async () => {
    await chrome.storage.local.set({
      learnedMappings: {
        '127.0.0.1': { legacy: 'personal.email', q7: { path: 'personal.firstName', count: 1 } },
      },
    });
  });
  await page.locator('form').evaluate((form) => {
    form.innerHTML += '<label>Novel response<input id="q7"></label>';
  });
  await extension.send('AUTOFILL_SCAN');
  await settle(page);
  const entry = await extension.worker.evaluate(
    async () =>
      (
        (await chrome.storage.local.get('learnedMappings')).learnedMappings as
          | LearnedMappings
          | undefined
      )?.['127.0.0.1']?.q7,
  );
  expect(entry).toEqual({ path: 'personal.firstName', count: 1 });
});
test('rejects a reused legacy internal key', async ({ page, extension }) => {
  await extension.worker.evaluate(async () => {
    await chrome.storage.local.set({ learnedMappings: { '127.0.0.1': { q7: 'personal.email' } } });
  });
  await page.locator('form').evaluate((form) => {
    form.innerHTML += '<label>Company<input id="q7"></label>';
  });
  await extension.send('AUTOFILL_SCAN');
  const results = await extension.send('AUTOFILL_FILL', 'overwrite');
  await expect(page.locator('#q7')).toHaveValue('New Company');
  expect(results.some((result) => result.noReview === 1)).toBe(true);
});
test('does not conflate punctuation-different email addresses', async ({ page, extension }) => {
  await page.locator('form').evaluate((form) => {
    form.innerHTML += '<label>Novel response<input id="q7"></label>';
  });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await page.locator('#q7').fill('a.lex@example.test');
  await page.locator('#outside').focus();
  await settle(page);
  expect(
    await extension.worker.evaluate(
      async () => (await chrome.storage.local.get('learnedMappings')).learnedMappings,
    ),
  ).toEqual({});
});
test('ignores controls repurposed after the original fill', async ({ page, extension }) => {
  await page.locator('form').evaluate((form) => {
    form.innerHTML += '<label>Novel response<input id="q7"></label>';
  });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await page.locator('#q7').evaluate((el) => {
    el.id = 'newq';
    el.parentElement!.firstChild!.textContent = 'Different question';
  });
  await page.locator('#newq').fill('alex@example.test');
  await page.locator('#outside').focus();
  await settle(page);
  expect(
    await extension.worker.evaluate(
      async () => (await chrome.storage.local.get('learnedMappings')).learnedMappings,
    ),
  ).toEqual({});
});
test('never executes a learned mapping to document bytes', async ({ page, extension }) => {
  await extension.worker.evaluate(async () => {
    await chrome.storage.local.set({
      learnedMappings: { '127.0.0.1': { q7: { path: 'documents.cv.file.base64', count: 2 } } },
    });
  });
  await page.locator('form').evaluate((form) => {
    form.innerHTML += '<label>Novel response<input id="q7"></label>';
  });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await expect(page.locator('#q7')).toHaveValue('');
});
test('trusts two independent real confirmations and reuses the result without training itself', async ({
  page,
  extension,
}) => {
  await page.locator('form').evaluate((form) => {
    form.innerHTML += '<label>Novel response<input id="q7"></label>';
  });
  for (let count = 1; count <= 2; count++) {
    await page.locator('#q7').evaluate((el) => {
      (el as HTMLInputElement).value = '';
    });
    await extension.send('AUTOFILL_SCAN');
    await extension.send('AUTOFILL_FILL', 'overwrite');
    await expect(page.locator('#q7')).toHaveValue('');
    await page.locator('#q7').fill('alex@example.test');
    await page.locator('#outside').focus();
    await expect
      .poll(() =>
        extension.worker.evaluate(async () => {
          const mappings = (await chrome.storage.local.get('learnedMappings'))
            .learnedMappings as LearnedMappings;
          const entry = mappings['127.0.0.1']?.q7;
          return typeof entry === 'object' ? entry.count : null;
        }),
      )
      .toBe(count);
  }
  await page.locator('#q7').evaluate((el) => {
    (el as HTMLInputElement).value = '';
  });
  await extension.send('AUTOFILL_SCAN');
  const result = await extension.send('AUTOFILL_FILL', 'overwrite');
  await expect(page.locator('#q7')).toHaveValue('alex@example.test');
  expect(result.some((frame) => frame.noReview === 1)).toBe(true);
  const mappings = await extension.worker.evaluate(
    async () =>
      (await chrome.storage.local.get('learnedMappings')).learnedMappings as LearnedMappings,
  );
  expect(mappings['127.0.0.1'].q7).toMatchObject({ count: 2 });
});
test('learns a user correction after an AI-green result, without learning the AI result', async ({
  page,
  context,
  extension,
}) => {
  await context.route('https://generativelanguage.googleapis.com/**', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify([
                    { fieldId: 'field_001', profilePath: 'personal.firstName', confidence: 'high' },
                  ]),
                },
              ],
            },
          },
        ],
      }),
    }),
  );
  await page.locator('form').evaluate((form) => {
    form.innerHTML += '<label>Novel response<input id="q7"></label>';
  });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await expect(page.locator('#q7')).toHaveValue('Alex');
  expect(
    await extension.worker.evaluate(
      async () => (await chrome.storage.local.get('learnedMappings')).learnedMappings,
    ),
  ).toEqual({});
  await page.locator('#q7').fill('alex@example.test');
  await page.locator('#outside').focus();
  await expect
    .poll(() =>
      extension.worker.evaluate(
        async () => (await chrome.storage.local.get('learnedMappings')).learnedMappings,
      ),
    )
    .toMatchObject({ '127.0.0.1': { q7: { path: 'personal.email', count: 1 } } });
});
for (const [value, path] of [
  ['+1 (202) 555-0100', 'personal.phone.full'],
  ['Senior', 'workHistory.1.title'],
  ['2015-01', 'workHistory.0.startDate.formatted'],
  ['January 2015', 'workHistory.0.startDate.formatted'],
] as const) {
  test(`learns the displayed value ${value}`, async ({ page, extension }) => {
    await page.locator('form').evaluate((form) => {
      form.innerHTML += '<label>Novel response<input id="q7"></label>';
    });
    await extension.send('AUTOFILL_SCAN');
    await extension.send('AUTOFILL_FILL', 'overwrite');
    await page.locator('#q7').fill(value);
    await page.locator('#outside').focus();
    await expect
      .poll(() =>
        extension.worker.evaluate(
          async () => (await chrome.storage.local.get('learnedMappings')).learnedMappings,
        ),
      )
      .toMatchObject({ '127.0.0.1': { q7: { path, count: 1 } } });
  });
}
