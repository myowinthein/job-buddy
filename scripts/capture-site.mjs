// Run after pnpm build, with pnpm dev:preview on port 4173.
// Review the resulting images before committing them.
// --user-guide preserves the developer guide and its images.
// --from-captures converts existing reviewed browser output without recapturing.
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
if (!process.argv.includes('--from-captures'))
  execFileSync('pnpm', ['exec', 'playwright', 'test', 'src/browser/site-captures.pw.ts'], {
    cwd: root,
    env: { ...process.env, JB_CAPTURE_SITE: '1' },
    stdio: 'inherit',
  });
const results = resolve(root, '.output/browser-results');
const assets = resolve(root, 'docs/assets/screenshots');
const pages = process.argv.includes('--user-guide')
  ? ['docs/index.html']
  : ['docs/index.html', 'docs/developers/index.html'];
const expected = new Set();
for (const page of pages) {
  const html = await readFile(resolve(root, page), 'utf8');
  for (const match of html.matchAll(/assets\/screenshots\/([\w-]+\.webp)/g)) expected.add(match[1]);
}
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
const dimensions = new Map();
for (const [name, input] of captures) {
  const output = resolve(assets, name);
  // Lossless compression preserves the captured text and thin UI lines.
  execFileSync('cwebp', ['-quiet', '-lossless', '-exact', input, '-o', output]);
  const png = await readFile(input);
  dimensions.set(name, {
    width: Math.floor(png.readUInt32BE(16) / 3),
    height: Math.floor(png.readUInt32BE(20) / 3),
  });
  versions.set(
    name,
    createHash('sha256')
      .update(await readFile(output))
      .digest('hex')
      .slice(0, 12),
  );
}
for (const name of pages) {
  const file = resolve(root, name);
  const content = await readFile(file, 'utf8');
  await writeFile(
    file,
    content
      .replace(/(assets\/screenshots\/)([\w-]+\.webp)(?:\?v=[a-f0-9]+)?/g, (match, path, name) =>
        versions.has(name) ? `${path}${name}?v=${versions.get(name)}` : match,
      )
      .replace(/<img\b[^>]+>/g, (tag) => {
        const name = tag.match(/assets\/screenshots\/([\w-]+\.webp)/)?.[1];
        const size = dimensions.get(name);
        return size
          ? tag
              .replace(/width="\d+"/, `width="${size.width}"`)
              .replace(/height="\d+"/, `height="${size.height}"`)
          : tag;
      }),
  );
}
log(`Updated ${captures.size} lossless website screenshots.`);
