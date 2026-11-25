import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { relative, resolve } from 'node:path';
import {
  absolute,
  changedInputs,
  cli,
  commitId,
  confirm,
  ensureBuild,
  ensurePreview,
  hash,
  options,
  outputsMatch,
  publishFiles,
  readJson,
  requireBrowser,
  requireTool,
  root,
  run,
  runtimeInputs,
  saveJson,
  snapshot,
  stateRoot,
  withCaptureLock,
} from './workflow.mjs';

const definitions = {
  demo: { title: 'Demo screenshot', spec: 'demo', directory: 'demo-capture' },
  site: { title: 'Website screenshots', spec: 'site-captures', directory: 'site-captures' },
  motion: { title: 'Autoplay demo videos', spec: 'demo-motion', directory: 'demo-motion' },
};

async function resultDirectories(directory, prefix) {
  return (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
    .map((entry) => resolve(directory, entry.name));
}

function pngSize(data) {
  if (data.length < 24 || data.subarray(1, 4).toString() !== 'PNG')
    throw new Error('Capture did not produce a valid PNG image.');
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  if (!width || !height) throw new Error('Capture has empty image dimensions.');
  return { width, height };
}

async function screenshotWrites(kind, directory, pages, expected, signal) {
  const captures = new Map();
  for (const folder of await resultDirectories(directory, `${definitions[kind].spec}.capture.ts-`)) {
    for (const file of await readdir(folder)) {
      if (!file.endsWith('.png')) continue;
      const name = kind === 'demo' ? file : file.replace(/\.png$/, '.webp');
      if (!expected.has(name)) continue;
      if (captures.has(name)) throw new Error(`Duplicate capture: ${name}`);
      captures.set(name, resolve(folder, file));
    }
  }
  if (captures.size !== expected.size)
    throw new Error(
      `Missing captures: ${[...expected].filter((name) => !captures.has(name)).join(', ')}`,
    );
  const writes = [];
  const versions = new Map();
  const dimensions = new Map();
  for (const [name, input] of captures) {
    const png = await readFile(input);
    const size = pngSize(png);
    let data = png;
    if (kind === 'site') {
      const output = resolve(directory, name);
      await run('cwebp', ['-quiet', '-lossless', '-exact', input, '-o', output], { signal });
      data = await readFile(output);
      if (data.subarray(0, 4).toString() !== 'RIFF' || data.subarray(8, 12).toString() !== 'WEBP')
        throw new Error(`Invalid WebP capture: ${name}`);
      dimensions.set(name, {
        width: Math.floor(size.width / 3),
        height: Math.floor(size.height / 3),
      });
    }
    writes.push({
      path: absolute(
        `docs/assets/${kind === 'demo' ? 'images/autofill-demo.png' : `screenshots/${name}`}`,
      ),
      data,
    });
    versions.set(kind === 'demo' ? 'autofill-demo.png' : name, hash(data).slice(0, 12));
  }
  for (const page of pages) {
    const content = await readFile(absolute(page), 'utf8');
    const updated =
      kind === 'demo'
        ? content.replace(
            /autofill-demo\.(?:jpg|png)(?:\?v=[a-f0-9]+)?/g,
            `autofill-demo.png?v=${versions.get('autofill-demo.png')}`,
          )
        : content
            .replace(
              /(assets\/screenshots\/)([\w-]+\.webp)(?:\?v=[a-f0-9]+)?/g,
              (match, prefix, name) =>
                versions.has(name) ? `${prefix}${name}?v=${versions.get(name)}` : match,
            )
            .replace(/<img\b[^>]+>/g, (tag) => {
              const name = tag.match(/assets\/screenshots\/([\w-]+\.webp)/)?.[1];
              const size = dimensions.get(name);
              return size
                ? tag
                    .replace(/width="\d+"/, `width="${size.width}"`)
                    .replace(/height="\d+"/, `height="${size.height}"`)
                : tag;
            });
    writes.push({ path: absolute(page), data: Buffer.from(updated) });
  }
  return writes;
}

export async function mediaInfo(path) {
  const result = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', path],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) throw new Error(`Cannot inspect media: ${relative(root, path)}`);
  const info = JSON.parse(result.stdout);
  const duration = Number(info.format?.duration);
  if (!(duration > 0)) throw new Error(`Invalid media duration: ${relative(root, path)}`);
  return { ...info, duration };
}

async function motionWrites(directory, signal) {
  const writes = [];
  const versions = new Map();
  for (const theme of ['light', 'dark']) {
    const folders = (await resultDirectories(directory, 'demo-motion.capture.ts-')).filter((path) =>
      path.endsWith(`-${theme}-mode`),
    );
    if (folders.length !== 1) throw new Error(`Expected one ${theme} recording.`);
    const folder = folders[0];
    const recording = await readJson(resolve(folder, 'frames.json'));
    if (!Array.isArray(recording?.frames) || !recording.frames.length)
      throw new Error(`Missing ${theme} recording frames.`);
    const lines = [];
    let duration = 0;
    for (const frame of recording.frames) {
      if (
        !/^frame-\d+\.png$/.test(frame.file) ||
        !Number.isFinite(frame.duration) ||
        frame.duration <= 0
      )
        throw new Error('Invalid recording frame.');
      pngSize(await readFile(resolve(folder, frame.file)));
      lines.push(`file '${frame.file}'`, `duration ${frame.duration}`);
      duration += frame.duration;
    }
    lines.push(`file '${recording.frames.at(-1).file}'`);
    await publishFiles([
      { path: resolve(folder, 'frames.ffconcat'), data: Buffer.from(`${lines.join('\n')}\n`) },
    ]);
    const name = `autofill-${theme}.mp4`;
    const output = resolve(directory, name);
    await run(
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
        resolve(folder, 'frames.ffconcat'),
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
        output,
      ],
      { signal },
    );
    const info = await mediaInfo(output);
    if (
      !info.streams.some((stream) => stream.codec_type === 'video') ||
      Math.abs(info.duration - duration) > 0.2
    )
      throw new Error(`Incomplete ${theme} video.`);
    const data = await readFile(output);
    writes.push({ path: absolute(`docs/assets/videos/${name}`), data });
    versions.set(name, hash(data).slice(0, 12));
  }
  const page = absolute('docs/index.html');
  const html = await readFile(page, 'utf8');
  writes.push({
    path: page,
    data: Buffer.from(
      html.replace(
        /(assets\/videos\/)(autofill-(?:light|dark)\.mp4)(?:\?v=[a-f0-9]+)?/g,
        (_, prefix, name) => `${prefix}${name}?v=${versions.get(name)}`,
      ),
    ),
  });
  return writes;
}

async function captureInputs(kind, expected) {
  const inputs = await snapshot([
    ...runtimeInputs,
    'scripts/capture',
    `scripts/capture-${kind === 'motion' ? 'demo-motion' : kind}.mjs`,
    'src/capture/fixtures.ts',
    'src/capture/fixtures',
    'src/capture/demoSupport.ts',
    `src/capture/${definitions[kind].spec}.capture.ts`,
    'docs/demo',
    'docs/assets/theme-init.js',
    'docs/assets/theme-toggle.css',
  ]);
  if (kind === 'site') inputs['@expected-screenshots'] = hash(JSON.stringify([...expected].sort()));
  return inputs;
}

export function captureCommand(kind) {
  cli(() =>
    withCaptureLock(async (signal) => {
      const opts = options();
      if (opts.chapter || opts['assemble-only'] || opts['burn-subtitles'])
        throw new Error('Chapter and subtitle options belong to pnpm capture:promo.');
      if (opts['user-guide'] && kind !== 'site')
        throw new Error('--user-guide belongs to capture-site.mjs.');
      const group = definitions[kind];
      const id = opts['user-guide'] ? 'site-user-guide' : kind;
      const manifestPath = resolve(stateRoot, `${id}.json`);
      const previous = await readJson(manifestPath);
      const directory = absolute(`.output/${group.directory}`);
      const pages =
        kind === 'demo'
          ? ['README.md', 'docs/index.html', 'docs/developers/index.html']
          : opts['user-guide']
            ? ['docs/index.html']
            : ['docs/index.html', 'docs/developers/index.html'];
      const expected = new Set(kind === 'demo' ? ['demo-autofill.png'] : []);
      if (kind === 'site') {
        for (const page of pages) {
          const html = await readFile(absolute(page), 'utf8');
          for (const match of html.matchAll(/assets\/screenshots\/([\w-]+\.webp)/g))
            expected.add(match[1]);
        }
      }
      const inputs = await captureInputs(kind, expected);
      const changed = changedInputs(previous?.inputs, inputs);
      const stale =
        opts.force ||
        opts['from-captures'] ||
        changed.length ||
        !(await outputsMatch(previous?.outputs));
      console.log(
        `${group.title}\n${stale ? 'Refresh needed' : 'Current'}${previous?.commit ? ` · last captured at ${previous.commit.slice(0, 7)}` : ' · first capture'}`,
      );
      if (previous && changed.length)
        console.log(`Changed inputs\n${changed.map((path) => `  ${path}`).join('\n')}`);
      console.log(
        `Output group · ${kind === 'site' ? `${expected.size} screenshots` : kind === 'demo' ? '1 screenshot' : '2 videos'}`,
      );
      if (opts.check || !stale) return;
      requireTool('pnpm', ['--version'], 'Install the pnpm version listed in package.json.');
      if (kind === 'site')
        requireTool(
          'cwebp',
          ['-version'],
          'Install cwebp from https://developers.google.com/speed/webp/download.',
        );
      if (kind === 'motion') {
        requireTool(
          'ffmpeg',
          ['-version'],
          'Install FFmpeg from https://ffmpeg.org/download.html.',
        );
        requireTool('ffprobe', ['-version'], 'Install FFprobe with FFmpeg.');
      }
      if (!opts['from-captures']) await requireBrowser();
      if (
        !(await confirm('Generate this capture group and update its website assets?', opts, signal))
      )
        return;
      let stopPreview = async () => {};
      try {
        if (!opts['from-captures']) {
          await ensureBuild(signal);
          if (kind === 'site') stopPreview = await ensurePreview(signal);
          const args = [
            'exec',
            'playwright',
            'test',
            '--config=scripts/capture/playwright.config.ts',
            `src/capture/${group.spec}.capture.ts`,
            `--output=${relative(root, directory)}`,
          ];
          await run('pnpm', args, {
            signal,
            env: {
              ...process.env,
              JB_CAPTURE_DEMO: '1',
              JB_CAPTURE_SITE: '1',
              JB_CAPTURE_MOTION: '1',
            },
          });
          await saveJson(resolve(directory, '.capture-source.json'), {
            inputs,
            commit: commitId(),
            files: await snapshot([relative(root, directory)]),
          });
        } else {
          const raw = await readJson(resolve(directory, '.capture-source.json'));
          if (
            !raw ||
            changedInputs(raw.inputs, inputs).length ||
            changedInputs(raw.files, await snapshot([relative(root, directory)])).length
          )
            throw new Error(
              'Cached captures are missing, modified or outdated. Run a fresh capture without --from-captures.',
            );
        }
        const writes =
          kind === 'motion'
            ? await motionWrites(directory, signal)
            : await screenshotWrites(kind, directory, pages, expected, signal);
        if (changedInputs(inputs, await captureInputs(kind, expected)).length)
          throw new Error('Capture inputs changed during recording. Run the command again.');
        const outputs = Object.fromEntries(
          writes
            .filter((item) => /\.(png|webp|mp4)$/.test(item.path))
            .map((item) => [relative(root, item.path), hash(item.data)]),
        );
        const metadata = {
          commit: commitId(),
          recordedAt: new Date().toISOString(),
          inputs,
          outputs,
        };
        writes.push({
          path: manifestPath,
          data: Buffer.from(JSON.stringify(metadata, null, 2) + '\n'),
        });
        writes.push({
          path: resolve(directory, '.capture-source.json'),
          data: Buffer.from(
            JSON.stringify(
              { inputs, commit: commitId(), files: await snapshot([relative(root, directory)]) },
              null,
              2,
            ) + '\n',
          ),
        });
        await publishFiles(writes);
        console.log(`Updated ${group.title.toLowerCase()}. Review the assets before committing.`);
      } finally {
        await stopPreview();
      }
    }),
  );
}
