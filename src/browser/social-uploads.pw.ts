import { test, expect, stubEmptyGemini } from './fixtures';
import type { Profile } from '../types/profile';

test('keeps GitLab and GitHub separate, fills custom social links and uploads a technically named resume', async ({
  context,
  page,
  extension,
}) => {
  await stubEmptyGemini(context);
  await extension.worker.evaluate(async () => {
    const { profile } = await chrome.storage.local.get<{ profile: Profile }>('profile');
    profile.links = {
      linkedin: 'https://linkedin.example.test/me',
      github: 'https://github.example.test/me',
      custom: ['GitLab', 'Instagram', 'Facebook', 'VK', 'TikTok'].map((label) => ({
        label,
        url: `https://${label.toLowerCase()}.example.test/me`,
      })),
    };
    await chrome.storage.local.set({ profile });
  });
  await page.evaluate(() => {
    document.body.innerHTML = `<form><h1>Job application</h1><input name="name" placeholder="Full Name"><input name="email" type="email" placeholder="Email Address">
    ${['GitHub', 'GitLab', 'Instagram', 'Facebook', 'VK', 'TikTok'].map((label) => `<input name="${label.toLowerCase()}" placeholder="${label} Profile">`).join('')}
    <p>Resume or Curriculum Vitae</p><p><span><input name="resume-file" type="file" accept=".pdf,.doc,.docx" required></span></p><output></output></form>`;
    const file = document.querySelector<HTMLInputElement>('input[type=file]')!;
    file.addEventListener('change', () => {
      document.querySelector('output')!.textContent = file.files?.[0]?.name ?? '';
    });
  });
  await extension.send('AUTOFILL_SCAN');
  await extension.send('AUTOFILL_FILL', 'overwrite');
  for (const name of ['github', 'gitlab', 'instagram', 'facebook', 'vk', 'tiktok'])
    await expect(page.locator(`input[name=${name}]`)).toHaveValue(
      `https://${name}.example.test/me`,
    );
  await expect(page.locator('output')).toHaveText('synthetic.pdf');
  expect(
    await page.locator('form').evaluate((form) => (form as HTMLFormElement).checkValidity()),
  ).toBe(true);
  await extension.send('CLEAR');
  await expect(page.locator('input[name=gitlab]')).toHaveValue('');
  await expect(page.locator('output')).toHaveText('');
});

test('shows Quick Fill for locally unlinked labels and uploads past the generic chooser label', async ({
  context,
  page,
  extension,
}) => {
  await stubEmptyGemini(context);
  await extension.worker.evaluate(async () => {
    const { profile } = await chrome.storage.local.get<{ profile: Profile }>('profile');
    profile.derived = {
      fullName: 'Jane Doe',
      currentTitle: '',
      currentCompany: '',
      totalExperience: { years: 0, months: 0, totalMonths: 0, label: '0 years' },
    };
    await chrome.storage.local.set({ profile });
  });
  await page.evaluate(() => {
    document.body.innerHTML = `<form><h3>Your details</h3>
      <div class="form-group"><label for="">Full Name: *</label><div><input type="text" name="932779" required></div></div>
      <div class="form-group"><label for="">Email: *</label><div><input type="text" name="932780" required></div></div>
      <div class="form-group"><label for="">Resume:</label><div class="custom-file" style="position:relative;width:300px;height:40px"><input type="file" name="932783" style="position:absolute;inset:0;opacity:0;width:100%;height:100%" required><label for="">Choose file</label></div></div>
      <output></output></form>`;
    const file = document.querySelector<HTMLInputElement>('input[type=file]')!;
    file.addEventListener('change', () => {
      document.querySelector('output')!.textContent = file.files?.[0]?.name ?? '';
    });
  });
  await page.bringToFront();
  await expect(page.locator('[data-job-buddy-ui] .fill')).toBeVisible();
  await page.locator('[data-job-buddy-ui] .fill').click();
  await expect(page.locator('output')).toHaveText('synthetic.pdf');
  await expect(page.locator('input[name="932779"]')).toHaveValue('Jane Doe');
  await expect(page.locator('input[name="932780"]')).toHaveValue('jane@example.test');
  expect(
    await page.locator('form').evaluate((form) => (form as HTMLFormElement).checkValidity()),
  ).toBe(true);
  await extension.send('CLEAR');
  await expect(page.locator('output')).toHaveText('');
});
