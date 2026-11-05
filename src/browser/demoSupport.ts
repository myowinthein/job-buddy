import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { BrowserContext, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { calculateDerivedFields } from '../utils/derivedFields';
import type { Profile } from '../types/profile';
import type { AIFieldPayload } from '../resume-ai/types';

export const publicURL = 'http://demo.example.test/demo/';
export const sample = JSON.parse(
  await readFile(resolve('src/browser/fixtures/demo-profile.json'), 'utf8'),
) as { profile: Profile };
// Match a saved editor profile, including values computed from raw entries.
sample.profile.derived = calculateDerivedFields(sample.profile);

export async function serveDemo(context: BrowserContext) {
  const files: Map<string, { body: Buffer; contentType: string }> = new Map(
    await Promise.all(
      ['index.html', 'style.css', 'demo.js'].map(
        async (name) =>
          [
            `/demo/${name === 'index.html' ? '' : name}`,
            {
              body: await readFile(resolve('docs/demo', name)),
              contentType: name.endsWith('.html')
                ? 'text/html'
                : name.endsWith('.css')
                  ? 'text/css'
                  : name.endsWith('.js')
                    ? 'application/javascript'
                    : 'application/json',
            },
          ] as const,
      ),
    ),
  );
  await context.route(/http:\/\/(?:demo\.example\.test|127\.0\.0\.1)\/demo\//, (route) => {
    const file = files.get(new URL(route.request().url()).pathname);
    return route.fulfill(file ?? { status: 404, body: 'Not found' });
  });
  await context.route('http://demo.example.test/assets/theme-init.js', async (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: await readFile(resolve('docs/assets/theme-init.js'), 'utf8'),
    }),
  );
  // Keep capture and integration tests reproducible without a real API key.
  // The production matching, writing, feedback, and Undo code still runs.
  await context.route('https://generativelanguage.googleapis.com/**', (route) => {
    const prompt = route.request().postDataJSON().contents[0].parts[0].text as string;
    const { fields } = JSON.parse(prompt.slice(prompt.lastIndexOf('\n\n{') + 2)) as {
      fields: AIFieldPayload[];
    };
    const answers = fields
      .filter((field) => field.type === 'radio' && /sponsorship/i.test(field.label))
      .map((field) => ({
        fieldId: field.fieldId,
        selectedOption: field.options?.find((option) => option.label === 'No')?.id,
        confidence: 'high',
      }));
    return route.fulfill({
      json: { candidates: [{ content: { parts: [{ text: JSON.stringify(answers) }] } }] },
    });
  });
}

export async function ready(
  page: Page,
  send: (action: string, mode?: string) => Promise<unknown[]>,
) {
  await expect(page.getByRole('button', { name: /Submit application/ })).toBeEnabled();
  await expect
    .poll(async () => {
      const logs = (await send('AUTOFILL_SCAN')) as { totalMatched?: number }[];
      return logs.some((log) => Number(log.totalMatched) > 0);
    })
    .toBe(true);
}
