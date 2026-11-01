import { test, expect } from './fixtures';
import type { Profile } from '../types/profile';

test('scopes applications, includes fixed controls, and excludes unavailable or unsafe inputs', async ({
  page,
  extension,
}) => {
  await page.evaluate(() => {
    document.body.innerHTML = `<form id="application"><h1>Job application</h1>
      <label>First name<input id="fixed" name="firstName" required style="position:fixed;top:20px"></label>
      <label>Email<input id="email" type="email" name="email" required></label>
      <fieldset disabled><label>First name<input id="disabled" name="firstName"></label></fieldset>
      <div inert><input id="inert" name="firstName"></div>
      <div style="opacity:0"><input id="transparent" name="firstName"></div>
      <input id="password" type="password" name="firstName">
      </form><form><h2>Newsletter</h2><input id="newsletter" type="email" name="email"></form>`;
  });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'merge');
  await expect(page.locator('#fixed')).toHaveValue('Jane');
  await expect(page.locator('#email')).toHaveValue('jane@example.test');
  for (const id of ['disabled', 'inert', 'transparent', 'password', 'newsletter'])
    await expect(page.locator(`#${id}`)).toHaveValue('');
  expect(
    await page
      .locator('#application')
      .evaluate((form) => (form as HTMLFormElement).checkValidity()),
  ).toBe(true);
  const events = await page.evaluate(
    () =>
      (window as unknown as { events: { name: string; type: string; inputEvent: boolean }[] })
        .events,
  );
  expect(events).toContainEqual(
    expect.objectContaining({ name: 'firstName', type: 'input', inputEvent: true }),
  );
});

test('assigns repeated values in composed page order across native, editable and shadow controls', async ({
  page,
  extension,
}) => {
  await extension.worker.evaluate(async () => {
    const stored = await chrome.storage.local.get('profile');
    const profile = stored.profile as Profile;
    profile.languages = [
      { language: 'English', proficiency: 'native_bilingual' },
      { language: 'Burmese', proficiency: 'full_professional' },
      { language: 'Thai', proficiency: 'limited_working' },
    ];
    await chrome.storage.local.set({ profile });
  });
  await page.evaluate(() => {
    document.body.innerHTML =
      '<div id="editor" contenteditable="" aria-label="Language"></div><div id="host"></div><label>Language<input id="third"></label>';
    document.querySelector('#host')!.attachShadow({ mode: 'open' }).innerHTML =
      '<label>Language<input id="second" required></label>';
  });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'merge');
  await expect(page.locator('#editor')).toHaveText('English');
  await expect(page.locator('#second')).toHaveValue('Burmese');
  await expect(page.locator('#third')).toHaveValue('Thai');
  expect(
    await page.locator('#second').evaluate((input) => (input as HTMLInputElement).checkValidity()),
  ).toBe(true);
  await extension.send('CLEAR');
  await expect(page.locator('#editor')).toHaveText('');
  await expect(page.locator('#second')).toHaveValue('');
});

test('never fills a replaced snapshot node or newly disabled controls without rescanning', async ({
  page,
  extension,
}) => {
  await page.evaluate(() => {
    document.body.innerHTML =
      '<label>First name<input id="stale" name="firstName"></label><label>Email<input id="disabled" name="email"></label>';
  });
  await extension.send('AUTOFILL_SCAN');
  await page.evaluate(() => {
    const old = document.querySelector('#stale')!;
    old.replaceWith(old.cloneNode());
    document.querySelector<HTMLInputElement>('#disabled')!.disabled = true;
  });
  const results = await extension.send('AUTOFILL_FILL', 'overwrite');
  await expect(page.locator('#stale')).toHaveValue('');
  await expect(page.locator('#disabled')).toHaveValue('');
  expect(results.every((result) => result.noReview === 0 && result.needReview === 0)).toBe(true);
});

test('AI handles native and ARIA choices separately while leaving consent untouched', async ({
  page,
  context,
  extension,
}) => {
  const payloads: string[] = [];
  await context.route('https://generativelanguage.googleapis.com/**', async (route) => {
    payloads.push(route.request().postData() ?? '');
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify([
                    { fieldId: 'field_001', confidence: 'high', selectedOption: 'Yes' },
                    { fieldId: 'field_002', confidence: 'high', selectedOptions: ['Marketing'] },
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
      <div role="radiogroup" aria-label="Work authorization"><button type="button" id="yes" role="radio" aria-checked="false">Yes</button><button type="button" role="radio" aria-checked="false">No</button></div>
      <fieldset><legend>Which department?</legend><label><input id="marketing" type="checkbox" style="opacity:0">Marketing</label><label><input type="checkbox">Engineering</label></fieldset>
      <input id="aria-consent" type="checkbox" aria-label="I agree to the privacy policy">
      <input id="processing" type="checkbox" aria-label="I accept processing of my personal data">
      </form><form><fieldset><legend>Privacy consent</legend><label><input id="other-consent" type="radio" name="answer" value="yes">Yes</label><label><input type="radio" name="answer" value="no">No</label></fieldset></form>`;
    for (const button of document.querySelectorAll('[role="radio"]'))
      button.addEventListener('click', () => {
        for (const sibling of button.parentElement!.querySelectorAll('[role="radio"]'))
          sibling.setAttribute('aria-checked', String(sibling === button));
      });
  });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'merge');
  await expect(page.locator('#yes')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#marketing')).toBeChecked();
  for (const id of ['aria-consent', 'processing', 'other-consent'])
    await expect(page.locator(`#${id}`)).not.toBeChecked();
  expect(payloads.length).toBeGreaterThan(0);
  expect(payloads.join('')).not.toMatch(
    /privacy policy|processing of my personal data|Privacy consent/,
  );
});

test('AI discards responses for detached fields and newly changed consent questions', async ({
  page,
  context,
  extension,
}) => {
  let requestStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    requestStarted = resolve;
  });
  let releaseResponse!: () => void;
  const response = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  await context.route('https://generativelanguage.googleapis.com/**', async (route) => {
    requestStarted();
    await response;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify([
                    { fieldId: 'field_001', confidence: 'high', profilePath: 'personal.firstName' },
                    { fieldId: 'field_002', confidence: 'high', selectedOption: 'Yes' },
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
    document.body.innerHTML =
      '<form><h1>Job application</h1><label>Unknown detail<input id="stale"></label><fieldset><legend>Work authorization</legend><label><input id="yes" type="radio" name="answer" value="yes">Yes</label><label><input type="radio" name="answer" value="no">No</label></fieldset></form>';
  });
  await extension.send('AUTOFILL_SCAN');
  const fill = extension.send('AUTOFILL_FILL', 'overwrite');
  await started;
  await page.evaluate(() => {
    const old = document.querySelector('#stale')!;
    old.replaceWith(old.cloneNode());
    document.querySelector('legend')!.textContent = 'Privacy consent';
  });
  releaseResponse();
  await fill;
  await expect(page.locator('#stale')).toHaveValue('');
  await expect(page.locator('#yes')).not.toBeChecked();
});
