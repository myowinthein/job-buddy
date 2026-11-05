// Re-record the real demo flow after pnpm build. Providers and profile data are
// isolated by the browser fixture; the public demo source is left untouched.
import { execFileSync } from 'node:child_process';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
if (!process.argv.includes('--from-captures'))
  execFileSync('pnpm', ['exec', 'playwright', 'test', 'src/browser/demo-motion.pw.ts'], {
    cwd: root,
    env: { ...process.env, JB_CAPTURE_MOTION: '1' },
    stdio: 'inherit',
  });
const results = resolve(root, '.output/browser-results');
const output = resolve(root, 'docs/assets/videos');
await mkdir(output, { recursive: true });
const versions = new Map();
for (const theme of ['light', 'dark']) {
  const directories = (await readdir(results)).filter(
    (name) => name.startsWith('demo-motion.pw.ts-') && name.endsWith(`-${theme}-mode`),
  );
  if (directories.length !== 1) throw new Error(`Expected one ${theme} recording`);
  const directory = resolve(results, directories[0]);
  const { frames } = JSON.parse(await readFile(resolve(directory, 'frames.json'), 'utf8'));
  const duration = frames.reduce((total, frame) => total + frame.duration, 0);
  const lines = frames.flatMap(({ file, duration }) => {
    if (!/^frame-\d+\.png$/.test(file) || !(duration > 0)) throw new Error('Invalid frame');
    return [`file ${file}`, `duration ${duration}`];
  });
  lines.push(`file ${frames.at(-1).file}`);
  const input = resolve(directory, 'frames.ffconcat');
  await writeFile(input, lines.join('\n') + '\n');
  const name = `autofill-${theme}.mp4`;
  const file = resolve(output, name);
  execFileSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      input,
      '-vf',
      'fps=15',
      '-c:v',
      'libx264',
      '-preset',
      'slow',
      '-crf',
      '16',
      '-g',
      '15',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-t',
      String(duration),
      '-an',
      file,
    ],
    { stdio: 'inherit' },
  );
  versions.set(
    name,
    createHash('sha256')
      .update(await readFile(file))
      .digest('hex')
      .slice(0, 12),
  );
  process.stdout.write(`Recorded ${name}\n`);
}
const page = resolve(root, 'docs/index.html');
const html = await readFile(page, 'utf8');
await writeFile(
  page,
  html.replace(
    /(assets\/videos\/)(autofill-(?:light|dark)\.mp4)(?:\?v=[a-f0-9]+)?/g,
    (_, prefix, name) => `${prefix}${name}?v=${versions.get(name)}`,
  ),
);
