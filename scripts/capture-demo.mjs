// Run after `pnpm build`: node scripts/capture-demo.mjs
// Uses the public demo and isolated synthetic data through its real browser test.
import { execFileSync } from 'node:child_process';
import { copyFile, readdir, mkdir } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { log } from 'node:console';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
execFileSync(
  'pnpm',
  ['exec', 'playwright', 'test', 'src/browser/demo.pw.ts', '--grep', 'public screenshot'],
  {
    cwd: root,
    stdio: 'inherit',
  },
);
const results = resolve(root, '.output/browser-results');
const directories = (await readdir(results)).filter((name) => name.startsWith('demo.pw.ts-'));
const captures = [];
for (const directory of directories) {
  const files = await readdir(resolve(results, directory));
  if (files.includes('demo-autofill.jpg'))
    captures.push(resolve(results, directory, 'demo-autofill.jpg'));
}
if (captures.length !== 1) throw new Error('Expected exactly one reviewed demo capture.');
const output = resolve(root, 'docs/assets/images/autofill-demo.jpg');
await mkdir(resolve(root, 'docs/assets/images'), { recursive: true });
await copyFile(captures[0], output);
log(`Captured ${output}`);
