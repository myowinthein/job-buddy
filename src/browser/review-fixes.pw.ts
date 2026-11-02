import { test, expect } from './fixtures';
import { RULE_PROFILE } from '../autofill/ruleMatching.fixture';
import type { BrowserContext } from '@playwright/test';

const emptyAI = { candidates: [{ content: { parts: [{ text: '[]' }] } }] };
test.beforeEach(async ({ context, extension }) => {
  await extension.worker.evaluate(async (profile) => {
    await chrome.storage.local.set({ profile, learnedMappings: {} });
  }, RULE_PROFILE);
  await context.route('https://generativelanguage.googleapis.com/**', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(emptyAI) }),
  );
});
async function popupFor(context: BrowserContext, url: string, tabId: number) {
  const popup = await context.newPage();
  await popup.addInitScript((id) => {
    chrome.tabs.query = async () => [{ id } as chrome.tabs.Tab];
  }, tabId);
  await popup.goto(new URL('popup.html', url).href);
  return popup;
}

test('writes correct sponsorship, phone and graduation values while leaving hourly salary manual', async ({
  page,
  extension,
}) => {
  await extension.worker.evaluate(async (profile) => {
    await chrome.storage.local.set({
      profile: {
        ...profile,
        education: [profile.education[0]],
        workAuthorization: [{ country: 'US', status: 'citizen_or_pr' }],
      },
    });
  }, RULE_PROFILE);
  await page.evaluate(() => {
    document.body.innerHTML = `<form id="main"><h1>Job application</h1>
      <label for="auth">Work authorization</label><select id="auth" aria-describedby="policy" required><option value="">Select</option><option>Yes</option><option>No</option></select>
      <p id="policy">Will you require sponsorship? We do not sponsor visas.</p>
      <label>Phone<input id="phone" type="tel" required></label>
      <fieldset><legend>Education</legend><label>Year graduated<input id="year" pattern="[0-9]{4}" required></label></fieldset>
      <label>Expected salary per hour<input id="hourly" name="expectedSalary"></label>
      </form><form><h2>Talent community upload resume</h2><label>Country code<input id="code"></label><label>Mobile<input id="mobile"></label></form>`;
    const year = document.querySelector<HTMLInputElement>('#year')!;
    year.addEventListener('input', (event) => {
      year.dataset.inputEvent = String(event instanceof InputEvent);
    });
  });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await expect(page.locator('#auth')).toHaveValue('No');
  await expect(page.locator('#phone')).toHaveValue('+1 2025550100');
  await expect(page.locator('#year')).toHaveValue('2013');
  await expect(page.locator('#year')).toHaveAttribute('data-input-event', 'true');
  await expect(page.locator('#hourly')).toHaveValue('');
  expect(
    await page.locator('#main').evaluate((form) => (form as HTMLFormElement).checkValidity()),
  ).toBe(true);
});

test('does not ask AI to answer unsupported groups or unstructured consent', async ({
  page,
  context,
  extension,
}) => {
  let requests = 0;
  await context.route('https://generativelanguage.googleapis.com/**', (route) => {
    requests++;
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify([
                    { fieldId: 'field_001', selectedOption: 'option_001', confidence: 'high' },
                  ]),
                },
              ],
            },
          },
        ],
      }),
    });
  });
  await page.evaluate(() => {
    document.body.innerHTML = `<form><h1>Job application</h1>
      <fieldset><legend>Nationality</legend><label><input type="radio" name="nation" value="TH">Thai</label><label><input type="radio" name="nation" value="Other">Other</label></fieldset>
      <fieldset><legend>Emergency contact relationship</legend><label><input type="checkbox" name="emergency" value="spouse">Spouse</label></fieldset>
      <p>Do you consent to retaining your data?</p><label><input type="radio" name="gdpr_consent" value="yes">Yes</label><label><input type="radio" name="gdpr_consent" value="no">No</label>
    </form>`;
  });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  expect(requests).toBe(0);
  expect(await page.locator('input:checked').count()).toBe(0);
});

test('reopened popup retains the partial result and Undo after a profile edit aborts AI', async ({
  page,
  context,
  extension,
}) => {
  let release = () => {};
  let requests = 0;
  await context.route('https://generativelanguage.googleapis.com/**', async (route) => {
    requests++;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route
      .fulfill({ contentType: 'application/json', body: JSON.stringify(emptyAI) })
      .catch(() => {});
  });
  await page.evaluate(() => {
    document.body.innerHTML =
      '<form><h1>Job application</h1><label>First name<input id="first"></label><label>Novel response<input id="custom"></label></form>';
  });
  try {
    await extension.send('AUTOFILL_SCAN');
    const filling = extension.send('AUTOFILL_FILL', 'overwrite');
    await expect.poll(() => requests).toBe(1);
    await expect(page.locator('#first')).toHaveValue('Alex');
    await extension.worker.evaluate(async (profile) => {
      await chrome.storage.local.set({
        profile: { ...profile, address: { ...profile.address, city: 'Updated city' } },
      });
    }, RULE_PROFILE);
    const results = await filling;
    expect(
      results.some((result) => result.noReview === 1 && result.aiStatus === 'unavailable'),
    ).toBe(true);
    release();
    const popup = await popupFor(context, extension.worker.url(), extension.sourceTabId);
    await expect(popup.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
    await popup.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.locator('#first')).toHaveValue('');
    expect(requests).toBe(1);
  } finally {
    release();
  }
});

test('a replaced profile cannot silently refill an old form', async ({ page, extension }) => {
  const profile = { ...RULE_PROFILE, personal: { ...RULE_PROFILE.personal, nickname: '' } };
  await extension.worker.evaluate(async (data) => {
    await chrome.storage.local.set({ profile: data });
  }, profile);
  await page.evaluate(() => {
    document.body.innerHTML =
      '<form><h1>Job application</h1><label>Nickname<input id="nickname"></label></form>';
  });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await extension.worker.evaluate(async (data) => {
    await chrome.storage.local.set({
      profile: {
        ...data,
        id: 'replacement-person',
        personal: { ...data.personal, nickname: 'Other person' },
      },
    });
  }, profile);
  await page.bringToFront();
  await page.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(150);
  await expect(page.locator('#nickname')).toHaveValue('');
});

test('a fuzzy option written during refill remains yellow and satisfies native validation', async ({
  page,
  extension,
}) => {
  const profile = { ...RULE_PROFILE, address: { ...RULE_PROFILE.address, country: '' } };
  await extension.worker.evaluate(async (data) => {
    await chrome.storage.local.set({ profile: data });
  }, profile);
  await page.evaluate(() => {
    document.body.innerHTML =
      '<form><h1>Job application</h1><label>Country<select id="country" required><option value="">Select</option><option value="uk-option">United Kingdon</option></select></label></form>';
  });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await extension.worker.evaluate(async (data) => {
    await chrome.storage.local.set({
      profile: { ...data, address: { ...data.address, country: 'GB' } },
    });
  }, profile);
  await page.bringToFront();
  await page.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#country')).toHaveValue('uk-option');
  const results = await extension.send('GET_STATUS');
  expect(results.some((result) => result.needReview === 1 && result.noReview === 0)).toBe(true);
  expect(
    await page
      .locator('#country')
      .evaluate((select) => (select as HTMLSelectElement).checkValidity()),
  ).toBe(true);
});
