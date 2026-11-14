import { test, expect, autofillRequest, geminiResponse } from './fixtures';
import type { Profile } from '../types/profile';

for (const layout of ['fieldset', 'list'])
  for (const mode of ['merge', 'overwrite'] as const) {
    test(`fills only open history rows in recency order with ${layout} rows and ${mode}`, async ({
      page,
      context,
      extension,
    }) => {
      await extension.worker.evaluate(async () => {
        const { profile } = await chrome.storage.local.get<{ profile: Profile }>('profile');
        profile.workHistory = [
          {
            company: 'Recent Company',
            title: 'Recent Title',
            description: 'Recent detail',
            startDate: '2023-01',
            endDate: '2025-01',
            isCurrent: false,
          },
          {
            company: 'Old Company',
            title: 'Old Title',
            description: 'Old detail',
            startDate: '2010-01',
            endDate: '2019-01',
            isCurrent: false,
          },
          {
            company: 'Current Company',
            title: 'Current Title',
            startDate: '2020-01',
            isCurrent: true,
          },
        ];
        profile.education = profile.workHistory.map((entry, index) => ({
          institution: `School ${index}`,
          degree: `Degree ${index}`,
          fieldOfStudy: index === 2 ? '' : `Subject ${index}`,
          startDate: entry.startDate,
          endDate: entry.endDate,
          isCurrent: entry.isCurrent,
        }));
        await chrome.storage.local.set({
          profile,
          quickFillPreferences: { enabled: true, disabledSites: [], fillMode: 'overwrite' },
        });
      });
      // Try to switch every AI refinement to the oldest entry, including surplus
      // select rows. Rules' row assignments must remain authoritative.
      let seen = 0;
      await context.route('https://generativelanguage.googleapis.com/**', (route) => {
        const { fields } = autofillRequest(route);
        seen += fields.filter((field) => field.profileEntryIndex !== undefined).length;
        const answers = fields
          .filter((field) => field.section === 'workHistory' || field.section === 'education')
          .map((field) => ({
            fieldId: field.fieldId,
            ...(field.type === 'select'
              ? { selectedOption: field.options?.[0]?.id }
              : {
                  profilePath: `${field.section}.1.${/Start/i.test(field.label) ? 'startDate' : /End/i.test(field.label) ? 'endDate' : field.section === 'workHistory' ? 'description' : 'fieldOfStudy'}`,
                }),
            confidence: 'high',
          }));
        return route.fulfill({ json: geminiResponse(JSON.stringify(answers)) });
      });
      await page.evaluate((layout) => {
        const rows = (education: boolean) =>
          Array.from({ length: 4 }, (_, index) => {
            const prefix = education ? 'e' : 'w';
            const content = `<label>${education ? 'Institution' : 'Company'}<input id="${prefix}${index}-name"></label>${education ? `<label>Degree<select id="${prefix}${index}-degree"><option value="">Choose</option>${[0, 1, 2].map((i) => `<option>Degree ${i}</option>`).join('')}</select></label>` : index === 1 ? '' : `<label>Job Title<input id="${prefix}${index}-title"></label>`}<label>${education ? 'Field of Study' : 'Summary'}<textarea id="${prefix}${index}-detail"></textarea></label><label>Start Date<input id="${prefix}${index}-start" placeholder="MM/YYYY"></label><label>End Date<input id="${prefix}${index}-end" placeholder="MM/YYYY"></label><label><input id="${prefix}${index}-current" type="checkbox">${education ? 'Currently studying here' : 'I currently work here'}</label>`;
            return layout === 'list' ? `<li>${content}</li>` : `<fieldset>${content}</fieldset>`;
          }).join('');
        const section = (education: boolean) =>
          layout === 'list'
            ? `<section><div>${education ? 'Education' : 'Experience'}<button type="button" class="add">Add</button></div><ul>${rows(education)}</ul></section>`
            : `<fieldset><legend>${education ? 'Education' : 'Work History'}</legend>${rows(education)}</fieldset>`;
        document.body.innerHTML = `<form><label>First name<input name="firstName" required></label><label>Email<input type="email" name="email" required></label>${section(false)}${section(true)}<output id="submissions">0</output><output id="adds">0</output><button type="submit">Submit</button></form>`;
        document.querySelector('form')!.addEventListener('submit', (event) => {
          event.preventDefault();
          document.querySelector('#submissions')!.textContent = '1';
        });
        document.querySelectorAll('.add').forEach((button) =>
          button.addEventListener('click', () => {
            document.querySelector('#adds')!.textContent = '1';
          }),
        );
      }, layout);
      await extension.send('AUTOFILL_SCAN');
      await extension.send('AUTOFILL_FILL', mode);
      const order = [2, 0, 1];
      for (const [row, index] of order.entries()) {
        await expect(page.locator(`#w${row}-name`)).toHaveValue(
          ['Recent Company', 'Old Company', 'Current Company'][index],
        );
        await expect(page.locator(`#e${row}-name`)).toHaveValue(`School ${index}`);
        await expect(page.locator(`#e${row}-degree`)).toHaveValue(`Degree ${index}`);
        for (const prefix of ['w', 'e']) {
          await expect(page.locator(`#${prefix}${row}-start`)).toHaveValue(
            ['01/2023', '01/2010', '01/2020'][index],
          );
          await expect(page.locator(`#${prefix}${row}-end`)).toHaveValue(
            ['01/2025', '01/2019', ''][index],
          );
          if (index === 2) await expect(page.locator(`#${prefix}${row}-current`)).toBeChecked();
          else await expect(page.locator(`#${prefix}${row}-current`)).not.toBeChecked();
        }
      }
      await expect(page.locator('#w0-detail')).toHaveValue('');
      await expect(page.locator('#e0-detail')).toHaveValue('');
      await expect(page.locator('#w1-detail')).toHaveValue('Recent detail');
      await expect(page.locator('#e1-detail')).toHaveValue('Subject 0');
      for (const prefix of ['w', 'e'])
        for (const suffix of ['name', 'detail', 'start', 'end'])
          await expect(page.locator(`#${prefix}3-${suffix}`)).toHaveValue('');
      await expect(page.locator('#e3-degree')).toHaveValue('');
      expect(seen).toBeGreaterThan(0);
      await expect(page.locator('#adds')).toHaveText('0');
      await expect(page.locator('#submissions')).toHaveText('0');
      expect(
        await page.locator('form').evaluate((form) => (form as HTMLFormElement).checkValidity()),
      ).toBe(true);
      expect(
        await extension.worker.evaluate(async () =>
          (await chrome.storage.local.get<{ profile: Profile }>('profile')).profile.workHistory.map(
            (entry) => entry.company,
          ),
        ),
      ).toEqual(['Recent Company', 'Old Company', 'Current Company']);
      await extension.send('CLEAR');
      await expect(page.locator('#w0-name')).toHaveValue('');
      await expect(page.locator('#e0-current')).not.toBeChecked();
    });
  }
