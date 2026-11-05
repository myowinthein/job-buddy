// Run after pnpm build, with pnpm dev:preview on port 4173.
// Review the resulting images before committing them.
import { execFileSync } from 'node:child_process';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, URL } from 'node:url';
import { resolve } from 'node:path';
import { log } from 'node:console';
import process from 'node:process';

const root = fileURLToPath(new URL('../', import.meta.url));
// Fail before running captures if the lossless WebP encoder is unavailable.
execFileSync('cwebp', ['-version']);
execFileSync('pnpm', ['exec', 'playwright', 'test', 'src/browser/site-captures.pw.ts'], {
  cwd: root,
  env: { ...process.env, JB_CAPTURE_SITE: '1' },
  stdio: 'inherit',
});
const results = resolve(root, '.output/browser-results');
const assets = resolve(root, 'docs/assets/screenshots');
const expected = new Set((await readdir(assets)).filter((name) => name.endsWith('.webp')));
const captures = new Map();
for (const directory of await readdir(results)) {
  if (!directory.startsWith('site-captures.pw.ts-')) continue;
  for (const name of await readdir(resolve(results, directory))) {
    const output = name.replace(/\.png$/, '.webp');
    if (!name.endsWith('.png') || !expected.has(output)) continue;
    if (captures.has(output)) throw new Error(`Duplicate capture: ${output}`);
    captures.set(output, resolve(results, directory, name));
  }
}
if (captures.size !== expected.size) throw new Error('Missing website captures.');
const versions = new Map();
for (const [name, input] of captures) {
  const output = resolve(assets, name);
  // Lossless compression preserves the captured text and thin UI lines.
  execFileSync('cwebp', ['-quiet', '-lossless', '-exact', input, '-o', output]);
  versions.set(
    name,
    createHash('sha256')
      .update(await readFile(output))
      .digest('hex')
      .slice(0, 12),
  );
}
for (const name of ['docs/index.html', 'docs/developers/index.html']) {
  const file = resolve(root, name);
  const content = await readFile(file, 'utf8');
  await writeFile(
    file,
    content.replace(
      /(assets\/screenshots\/)([\w-]+\.webp)(?:\?v=[a-f0-9]+)?/g,
      (match, path, name) =>
        versions.has(name) ? `${path}${name}?v=${versions.get(name)}` : match,
    ),
  );
}
log(`Updated ${captures.size} lossless website screenshots.`);
