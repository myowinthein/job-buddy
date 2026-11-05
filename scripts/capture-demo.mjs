// Run after `pnpm build`: node scripts/capture-demo.mjs
// Uses the public demo and isolated synthetic data through its real browser test.
import { execFileSync } from 'node:child_process';
import { copyFile, readdir, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
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
  if (files.includes('demo-autofill.png'))
    captures.push(resolve(results, directory, 'demo-autofill.png'));
}
if (captures.length !== 1) throw new Error('Expected exactly one reviewed demo capture.');
const output = resolve(root, 'docs/assets/images/autofill-demo.png');
await mkdir(resolve(root, 'docs/assets/images'), { recursive: true });
await copyFile(captures[0], output);
const version = createHash('sha256')
  .update(await readFile(output))
  .digest('hex')
  .slice(0, 12);
for (const name of ['README.md', 'docs/index.html', 'docs/developers/index.html']) {
  const file = resolve(root, name);
  const content = await readFile(file, 'utf8');
  await writeFile(
    file,
    content.replace(
      /autofill-demo\.(?:jpg|png)(?:\?v=[a-f0-9]+)?/g,
      `autofill-demo.png?v=${version}`,
    ),
  );
}
log(`Captured ${output}`);
