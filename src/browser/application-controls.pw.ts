import { test, expect, stubEmptyGemini } from './fixtures';
import type { Profile } from '../types/profile';
import type { FrameFillLog } from '../autofill/fillLog';

test('fills qualified dial codes, rejected full phone numbers, hidden resume inputs and separate authorization forms', async ({
  context,
  page,
  extension,
}) => {
  await stubEmptyGemini(context);
  await extension.worker.evaluate(async () => {
    const { profile } = await chrome.storage.local.get<{ profile: Profile }>('profile');
    profile.personal.phone = { countryCode: 'CA', callingCode: '+1', number: '2045550123' };
    profile.workAuthorization = [
      { country: 'US', status: 'citizen_or_pr' },
      { country: 'CA', status: 'requires_sponsorship' },
    ];
    await chrome.storage.local.set({ profile });
  });
  await page.evaluate(() => {
    document.body.innerHTML = `<main>
      <form id="application-form"><h1>Job application</h1>
        <label>First name<input name="firstName" required></label>
        <label>Email<input name="email" type="email" required></label>
        <div><label>Dial code<input id="dial" role="combobox" name="phoneNumber_dialCode" autocomplete="off" aria-expanded="false" required></label>
          <label>Phone number<input id="phone" name="phoneNumber" autocomplete="tel" type="tel" required></label></div>
        <div role="button" id="dropzone" style="width:400px;min-height:80px"><label><input id="resume-file" type="file" aria-label="Please upload your resume (preferably as a PDF file) *" accept="application/pdf" tabindex="-1" style="display:none" required></label><p>Click or drag file to upload</p><span id="uploaded"></span></div>
      </form>
      <form action="#" id="questions"><div><p>Are you authorized to work in Canada *</p><div><label>Select one<input id="authorization" name="custom-question-1" role="combobox" autocomplete="off" aria-expanded="false" required></label></div></div>
        <div><p>By submitting this application, you consent to background verifications.</p><label>Select one<input id="consent" role="combobox"></label></div>
      </form>
      <form id="contact"><label>Email<input id="unrelated-email" name="email"></label></form>
    </main>`;
    const dial = document.querySelector<HTMLInputElement>('#dial')!;
    const auth = document.querySelector<HTMLInputElement>('#authorization')!;
    const dropdown = (
      input: HTMLInputElement,
      choices: string[],
      choose: (text: string) => void,
    ) => {
      input.addEventListener('click', () => {
        document.getElementById(`${input.id}-options`)?.remove();
        const list = document.createElement('div');
        list.id = `${input.id}-options`;
        list.setAttribute('role', 'listbox');
        input.setAttribute('aria-controls', list.id);
        input.setAttribute('aria-expanded', 'true');
        for (const text of choices) {
          const option = document.createElement('div');
          option.setAttribute('role', 'option');
          option.textContent = text;
          option.addEventListener('click', () => {
            choose(text);
            input.setAttribute('aria-expanded', 'false');
            option.setAttribute('aria-selected', 'true');
            list.remove();
          });
          list.append(option);
        }
        document.body.append(list);
      });
    };
    dropdown(dial, ['US +1', 'CA +1', 'TH +66'], (text) => {
      dial.value = text.split(' ')[1];
      dial.dataset.country = text.split(' ')[0];
      dial.dispatchEvent(new Event('change', { bubbles: true }));
    });
    dropdown(auth, ['Yes', 'No'], (text) => {
      auth.value = text;
    });
    const phone = document.querySelector<HTMLInputElement>('#phone')!;
    phone.addEventListener('input', () => {
      if (phone.value.startsWith('+')) {
        phone.dataset.rejectedFull = 'yes';
        phone.value = '';
      }
      phone.dataset.inputObserved = 'yes';
    });
    const file = document.querySelector<HTMLInputElement>('#resume-file')!;
    file.addEventListener('change', () => {
      file.dataset.changeObserved = 'yes';
      document.querySelector('#uploaded')!.textContent = file.files?.[0]?.name ?? '';
      document.querySelector('#remove-upload')?.remove();
      if (file.files?.length) {
        const remove = document.createElement('button');
        remove.id = 'remove-upload';
        remove.type = 'button';
        remove.textContent = 'Remove file';
        document.querySelector('#dropzone')!.append(remove);
      }
    });
  });
  await expect
    .poll(async () => {
      const scans = await extension.send('AUTOFILL_SCAN');
      return scans.some((scan) => Number(scan.totalMatched) >= 6);
    })
    .toBe(true);
  await extension.send('AUTOFILL_FILL', 'merge');
  await expect(page.locator('#dial')).toHaveValue('+1');
  await expect(page.locator('#dial')).toHaveAttribute('data-country', 'CA');
  await expect(page.locator('#phone')).toHaveValue('2045550123');
  await expect(page.locator('#phone')).toHaveAttribute('data-rejected-full', 'yes');
  await expect(page.locator('#phone')).toHaveAttribute('data-input-observed', 'yes');
  await expect(page.locator('#uploaded')).toHaveText('synthetic.pdf');
  await expect(page.locator('#resume-file')).toHaveAttribute('data-change-observed', 'yes');
  await expect(page.locator('#authorization')).toHaveValue('No');
  await expect(page.locator('#consent')).toHaveValue('');
  await expect(page.locator('#unrelated-email')).toHaveValue('');
  for (const id of ['dial', 'phone', 'resume-file', 'authorization']) {
    expect(
      await page.locator(`#${id}`).evaluate((el) => (el as HTMLInputElement).checkValidity()),
    ).toBe(true);
  }
  const logs = (await extension.send('GET_FILL_LOG')) as unknown as FrameFillLog[];
  expect(
    logs.flatMap((log) => log.fields).find((field) => field.label === 'Phone number')?.rule
      .profilePath,
  ).toBe('personal.phone.number');
  await extension.send('CLEAR');
  await expect(page.locator('#dial')).toHaveValue('');
  await expect(page.locator('#phone')).toHaveValue('');
  await expect(page.locator('#authorization')).toHaveValue('');
  await expect(page.locator('#uploaded')).toHaveText('');
  expect(
    await page.locator('#resume-file').evaluate((el) => (el as HTMLInputElement).files?.length),
  ).toBe(0);
});

test('keeps an accepted autocomplete tel value intact when a calling-code sibling exists', async ({
  context,
  page,
  extension,
}) => {
  await stubEmptyGemini(context);
  await page.evaluate(() => {
    document.body.innerHTML =
      '<form><h1>Job application</h1><label>Phone number<input id="phone" type="tel" autocomplete="tel"></label><label>Calling code<select id="dial"><option value="">Choose</option><option value="+1">+1</option></select></label></form>';
  });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  await expect(page.locator('#phone')).toHaveValue('+1 1234567890');
  await expect(page.locator('#dial')).toHaveValue('+1');
  await extension.send('CLEAR');
  await expect(page.locator('#phone')).toHaveValue('');
});
