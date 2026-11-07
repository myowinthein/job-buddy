import { test, expect } from '@playwright/test';
import { build, type Rollup } from 'vite';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import type { runRuleExample } from './fixtures/rule-methods';

// Isolated illustrative fields, not a change to the approved public demo.
const examples = [
  {
    id: 'autocomplete',
    label: 'Autocomplete attribute',
    html: '<label for="entry">Email address</label><input id="entry" type="email" autocomplete="email">',
    layer: 'autocomplete',
    path: 'personal.email',
    score: 95,
    value: 'alex.morgan@example.com',
  },
  {
    id: 'exact',
    label: 'Exact dictionary match',
    html: '<label for="entry">First name</label><input id="entry">',
    layer: 'dictionary_exact',
    path: 'personal.firstName',
    score: 85,
    value: 'Alex',
  },
  {
    id: 'similar',
    label: 'Similar field label',
    html: '<label for="entry">First nam</label><input id="entry">',
    layer: 'fuzzy',
    path: 'personal.firstName',
    score: 76,
    value: 'Alex',
  },
  {
    id: 'custom',
    label: 'Custom link label',
    html: '<label for="entry">Design journal</label><input id="entry" type="url">',
    layer: 'custom_link',
    path: 'links.custom.0.url',
    score: 85,
    value: 'https://example.com/alex/journal',
  },
  {
    id: 'current',
    label: 'Current-status checkbox',
    html: '<fieldset><legend>Work experience</legend><label class="choice"><input type="checkbox">Currently working here</label></fieldset>',
    layer: 'checkbox_status',
    path: 'workHistory.0.isCurrent',
    score: 85,
    value: 'Yes',
  },
  {
    id: 'context',
    label: 'Nearby context',
    html: '<div class="form-field"><p>City</p><input aria-label="" placeholder="Enter your answer"></div>',
    layer: 'context',
    path: 'address.city',
    score: 70,
    value: 'Seattle',
  },
];
let probe: string;
test.beforeAll(async () => {
  const bundle = (await build({
    configFile: false,
    resolve: { alias: { '@': resolve('.') } },
    logLevel: 'error',
    build: {
      write: false,
      minify: false,
      lib: {
        entry: resolve('src/browser/fixtures/rule-methods.ts'),
        name: 'RuleMethodDemo',
        formats: ['iife'],
      },
    },
  })) as Rollup.RollupOutput | Rollup.RollupOutput[];
  const outputs = Array.isArray(bundle) ? bundle : [bundle];
  probe = (
    outputs
      .flatMap((output) => output.output)
      .find((item) => item.type === 'chunk') as Rollup.OutputChunk
  ).code;
});
test.use({ deviceScaleFactor: 3 });

for (const theme of ['light', 'dark'])
  for (const example of examples) {
    test(`${example.label} example matches production rules (${theme})`, async ({ page }) => {
      await page.setViewportSize({ width: 600, height: 160 });
      await page.setContent(`<!doctype html><html class="${theme}"><head><style>
      *{box-sizing:border-box}body{margin:0;font:16px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fff;color:#182335}
      .dark body{color-scheme:dark;background:#192232;color:#ecf0f7}
      main{padding:28px 32px;min-height:160px;display:flex;align-items:center}form{width:100%}
      label,.form-field p{display:block;font-weight:600;margin:0 0 8px}input:not([type=checkbox]){display:block;width:100%;height:48px;border:1px solid #9ba6b6;border-radius:6px;padding:10px 12px;font:inherit;color:inherit;background:transparent}
      fieldset{margin:0;padding:0;border:0}legend{font-weight:600;margin-bottom:16px}.choice{display:flex;align-items:center;gap:10px;font-weight:400}input[type=checkbox]{width:18px;height:18px;margin:0;accent-color:#2659cf}
    </style></head><body><main><form>${example.html}</form></main></body></html>`);
      await page.addScriptTag({ content: probe });
      const result = await page.evaluate(async () =>
        (
          window as unknown as {
            RuleMethodDemo: { runRuleExample: typeof runRuleExample };
          }
        ).RuleMethodDemo.runRuleExample(),
      );
      expect(result).toMatchObject({
        layer: example.layer,
        path: example.path,
        score: example.score,
        value: example.value,
        filled: true,
      });
      if (example.id === 'similar') expect(result.confidence).toBeCloseTo((8 / 9) * 0.85, 10);
      if (example.id === 'context') expect(result.nearbyText).toBe('City');
      if (example.id === 'current') await expect(page.locator('input')).toBeChecked();
      else await expect(page.locator('input')).toHaveValue(example.value);
      // Keep the displayed examples tied to the current implementation.
      const site = await readFile('docs/index.html', 'utf8');
      expect(site.replace(/\s+/g, ' ')).toContain(
        `data-rule-method="${example.layer}" data-rule-score="${example.score}"`,
      );
      // Also verify the lower-scoring examples explained in the notes.
      if (example.id === 'exact' || example.id === 'similar') {
        await page.locator('label').evaluate((el, exact) => {
          el.textContent = exact ? 'Tell us about yourself' : 'Compayn';
          const input = document.querySelector('input')!;
          input.value = '';
          if (exact) input.name = 'firstName';
        }, example.id === 'exact');
        const lower = await page.evaluate(async () =>
          (
            window as unknown as { RuleMethodDemo: { runRuleExample: typeof runRuleExample } }
          ).RuleMethodDemo.runRuleExample(),
        );
        expect(lower).toMatchObject({ score: example.id === 'exact' ? 50 : 54, filled: false });
        if (example.id === 'similar') expect(lower.confidence).toBeCloseTo((5 / 7) * 0.75, 10);
        await expect(page.locator('input')).toHaveValue('');
      }
    });
  }
