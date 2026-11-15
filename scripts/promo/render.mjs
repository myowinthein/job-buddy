import { spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import {
  absolute,
  changedInputs,
  cli,
  commitId,
  confirm,
  fileHash,
  hash,
  options,
  outputsMatch,
  publishFiles,
  readJson,
  requireBrowser,
  requireTool,
  root,
  run,
  saveJson,
  snapshot,
  withCaptureLock,
  ensureBuild,
  ensurePreview,
} from '../capture/workflow.mjs';
import { mediaInfo } from '../capture/groups.mjs';

export const promoRoot = absolute('.output/promo');
const python = resolve(
  promoRoot,
  'kokoro',
  process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
);
const voiceInputs = [
  'scripts/promo/speech.py',
  'scripts/promo/requirements.txt',
  'scripts/promo/models.json',
];

export function subtitleTime(seconds, separator = ',') {
  const total = Math.round(seconds * 1000);
  const milliseconds = String(total % 1000).padStart(3, '0');
  const whole = Math.floor(total / 1000);
  return `${String(Math.floor(whole / 3600)).padStart(2, '0')}:${String(Math.floor(whole / 60) % 60).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}${separator}${milliseconds}`;
}

/** Each caption uses its recorded audio duration and is offset by the assembled scenes. */
export function subtitles(scenes) {
  const cues = [];
  let offset = 0;
  for (const scene of scenes) {
    if (!Array.isArray(scene.timings) || !scene.timings.length)
      throw new Error('Recorded speech timings are missing. Refresh the affected chapter.');
    for (const cue of scene.timings) {
      if (!(cue.start >= 0 && cue.end > cue.start && cue.end <= scene.audioDuration + 0.01))
        throw new Error('Subtitle timing falls outside its recorded narration.');
      cues.push({ start: offset + 0.3 + cue.start, end: offset + 0.3 + cue.end, text: cue.text });
    }
    offset += scene.duration;
  }
  return {
    srt: cues
      .map(
        (cue, index) =>
          `${index + 1}\n${subtitleTime(cue.start)} --> ${subtitleTime(cue.end)}\n${cue.text}\n`,
      )
      .join('\n'),
    vtt: `WEBVTT\n\n${cues.map((cue) => `${subtitleTime(cue.start, '.')} --> ${subtitleTime(cue.end, '.')}\n${cue.text}\n`).join('\n')}`,
  };
}

/** Validate source-controlled chapter identities before deriving output paths. */
export function validateChapters(config) {
  if (
    !Array.isArray(config?.chapters) ||
    !config.chapters.length ||
    typeof config.voice !== 'string' ||
    !(config.speed >= 0.5 && config.speed <= 2)
  )
    throw new Error('Promo chapters need a voice and a speed between 0.5 and 2.');
  const ids = new Set();
  for (const chapter of config.chapters) {
    if (
      typeof chapter.id !== 'string' ||
      !/^[a-z][a-z0-9-]*$/.test(chapter.id) ||
      ids.has(chapter.id) ||
      !chapter.title ||
      !Array.isArray(chapter.inputs) ||
      !chapter.scenes?.length
    )
      throw new Error('Each promo chapter needs a unique ID, title, inputs and scenes.');
    ids.add(chapter.id);
    const scenes = new Set();
    for (const scene of chapter.scenes) {
      if (
        typeof scene.id !== 'string' ||
        !/^[a-z][a-z0-9-]*$/.test(scene.id) ||
        scenes.has(scene.id) ||
        typeof scene.text !== 'string' ||
        !scene.text.trim() ||
        (scene.external && !/^[a-z0-9-]+\.mp4$/.test(scene.external))
      )
        throw new Error(
          `Invalid scene in ${chapter.id}. Check IDs, narration and external clip names.`,
        );
      scenes.add(scene.id);
    }
  }
}

export async function speechKey(scene, config) {
  return hash(
    JSON.stringify({
      voice: config.voice,
      speed: config.speed,
      text: scene.text,
      source: await snapshot(voiceInputs),
    }),
  );
}

export async function chapterInputs(chapter, config) {
  const shared = [
    'scripts/capture',
    'scripts/capture-promo.mjs',
    'scripts/promo/render.mjs',
    ...voiceInputs,
    'src/browser/promo.pw.ts',
    'src/browser/promoSupport.ts',
    'src/browser/fixtures.ts',
    'src/browser/demoSupport.ts',
    'src/browser/fixtures/demo-profile.json',
    'src/components/ui',
    'src/components/options/shared',
    'src/components/options/Sidebar.tsx',
    'src/components/options/CompletionBanner.tsx',
    'src/styles',
    'src/utils/branding.ts',
    'entrypoints/options/style.css',
    'entrypoints/options/App.tsx',
    'src/profile',
    'src/ui',
    'src/utils/storage.ts',
    'wxt.config.ts',
    'src/types',
    'public',
    'package.json',
    'pnpm-lock.yaml',
  ];
  const inputs = await snapshot(shared);
  // Prefixes cover related helpers such as backupImport.ts and backupValidation.ts.
  const runtime = await snapshot(['src', 'entrypoints', 'docs/demo']);
  for (const [path, digest] of Object.entries(runtime))
    if (
      chapter.inputs.some(
        (prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(prefix),
      )
    )
      inputs[path] = digest;
  for (const path of chapter.inputs.filter((path) => path.startsWith('docs/')))
    Object.assign(inputs, await snapshot([path]));
  // The chapter's own text is hashed independently so editing one narration keeps other chapters reusable.
  inputs['@chapter'] = hash(JSON.stringify(chapter));
  inputs['@voice'] = hash(JSON.stringify({ voice: config.voice, speed: config.speed }));
  for (const scene of chapter.scenes.filter((scene) => scene.external))
    inputs[`external/${scene.external}`] = await fileHash(
      resolve(promoRoot, 'external', scene.external),
    );
  return Object.fromEntries(Object.entries(inputs).sort(([a], [b]) => a.localeCompare(b)));
}

async function speech(scene, config, signal) {
  const directory = resolve(promoRoot, 'audio');
  await mkdir(directory, { recursive: true });
  const key = await speechKey(scene, config);
  const output = resolve(directory, `${key}.wav`);
  const saved = await readJson(resolve(directory, `${key}.json`));
  if (saved?.hash && saved.hash === (await fileHash(output)) && saved.timings)
    return { path: output, duration: (await mediaInfo(output)).duration, timings: saved.timings };
  const request = resolve(directory, `${key}.request.json`);
  await saveJson(request, {
    text: scene.text,
    voice: config.voice,
    speed: config.speed,
    model: resolve(promoRoot, 'models/kokoro-v1.0.onnx'),
    voices: resolve(promoRoot, 'models/voices-v1.0.bin'),
  });
  await run(python, [absolute('scripts/promo/speech.py'), request, output], { signal });
  const info = await mediaInfo(output);
  if (!info.streams.some((stream) => stream.codec_type === 'audio'))
    throw new Error('Kokoro produced no audio stream.');
  const timings = await readJson(resolve(directory, `${key}.timing.json`));
  if (!timings?.length) throw new Error('Kokoro did not produce speech timings.');
  await saveJson(resolve(directory, `${key}.json`), { hash: await fileHash(output), timings });
  return { path: output, duration: info.duration, timings };
}

async function speechNeeded(chapters, config) {
  for (const chapter of chapters)
    for (const scene of chapter.scenes) {
      const key = await speechKey(scene, config);
      const saved = await readJson(resolve(promoRoot, 'audio', `${key}.json`));
      if (
        !saved?.hash ||
        !saved.timings ||
        saved.hash !== (await fileHash(resolve(promoRoot, 'audio', `${key}.wav`)))
      )
        return true;
    }
  return false;
}

async function joinClips(clips, output, signal) {
  const directory = resolve(output, '..');
  const list = resolve(directory, 'join.ffconcat');
  await writeFile(
    list,
    clips.map((clip) => `file '${clip.replaceAll("'", "'\\''")}'`).join('\n') + '\n',
  );
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
      list,
      '-c',
      'copy',
      '-movflags',
      '+faststart',
      output,
    ],
    { signal },
  );
  const info = await mediaInfo(output);
  if (
    !info.streams.some((stream) => stream.codec_type === 'audio') ||
    !info.streams.some((stream) => stream.codec_type === 'video')
  )
    throw new Error('The rendered video must contain both picture and narration.');
  return info;
}

async function renderChapter(chapter, config, inputs, signal) {
  const directory = resolve(promoRoot, 'chapters', chapter.id);
  const staging = resolve(directory, 'rendering');
  await mkdir(staging, { recursive: true });
  const scenes = [];
  for (const scene of chapter.scenes) {
    const audio = await speech(scene, config, signal);
    scenes.push({
      ...scene,
      audio: audio.path,
      audioDuration: audio.duration,
      timings: audio.timings,
    });
  }
  const request = resolve(promoRoot, 'requests', `${chapter.id}.json`);
  await saveJson(request, { id: chapter.id, scenes });
  if (scenes.some((scene) => !scene.external)) {
    const output = resolve(directory, 'browser');
    await run(
      'pnpm',
      [
        'exec',
        'playwright',
        'test',
        'src/browser/promo.pw.ts',
        '--grep',
        `record promo ${chapter.id}$`,
        `--output=${relative(root, output)}`,
      ],
      {
        signal,
        env: { ...process.env, JB_PROMO_REQUEST: request },
      },
    );
    const folders = (await readdir(output, { withFileTypes: true })).filter((item) =>
      item.isDirectory(),
    );
    const results = [];
    for (const folder of folders) {
      const recording = await readJson(resolve(output, folder.name, 'recording.json'));
      if (recording) results.push({ recording, directory: resolve(output, folder.name) });
    }
    if (results.length !== 1) throw new Error(`Expected one browser recording for ${chapter.id}.`);
    for (const scene of scenes.filter((scene) => !scene.external)) {
      const recorded = results[0].recording.find((item) => item.id === scene.id);
      if (!recorded?.frames.length) throw new Error(`No live frames recorded for ${scene.id}.`);
      scene.recorded = { ...recorded, directory: results[0].directory };
    }
  }
  const clips = [];
  for (const scene of scenes) {
    let source;
    let duration;
    if (scene.external) {
      source = resolve(promoRoot, 'external', scene.external);
      const info = await mediaInfo(source);
      if (!info.streams.some((stream) => stream.codec_type === 'video'))
        throw new Error(`External clip has no video: ${scene.external}`);
      duration = info.duration;
      if (duration < scene.audioDuration + 1.1)
        throw new Error(
          `${scene.external} needs at least ${(scene.audioDuration + 1.1).toFixed(1)} seconds for its narration. Record a longer reviewed clip.`,
        );
    } else {
      const recording = scene.recorded;
      duration = recording.duration;
      const lines = [];
      for (let i = 0; i < recording.frames.length; i++) {
        const frame = recording.frames[i];
        if (!/^scene-[a-z0-9-]+-\d+\.jpg$/.test(frame.file))
          throw new Error('Invalid browser frame path.');
        const next = recording.frames[i + 1]?.time ?? duration;
        lines.push(
          `file '${resolve(recording.directory, frame.file).replaceAll("'", "'\\''")}'`,
          `duration ${Math.max(0.001, next - frame.time)}`,
        );
      }
      lines.push(lines.at(-2));
      source = resolve(staging, `${scene.id}.ffconcat`);
      await writeFile(source, lines.join('\n') + '\n');
    }
    const output = resolve(staging, `${scene.id}.mp4`);
    const videoInput = scene.external
      ? ['-i', source]
      : ['-f', 'concat', '-safe', '0', '-i', source];
    await run(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        ...videoInput,
        '-i',
        scene.audio,
        '-vf',
        'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fps=30,setsar=1',
        '-af',
        'loudnorm=I=-16:TP=-1.5:LRA=11,adelay=300:all=1,apad',
        '-c:v',
        'libx264',
        '-preset',
        'fast',
        '-crf',
        '19',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-ar',
        '48000',
        '-ac',
        '2',
        '-t',
        String(duration),
        '-movflags',
        '+faststart',
        output,
      ],
      { signal },
    );
    const info = await mediaInfo(output);
    scene.duration = info.duration;
    clips.push(output);
  }
  const output = resolve(staging, 'chapter.mp4');
  await joinClips(clips, output, signal);
  const captions = subtitles(scenes);
  const writes = [
    { path: resolve(directory, 'chapter.mp4'), data: await readFile(output) },
    { path: resolve(directory, 'chapter.srt'), data: Buffer.from(captions.srt) },
    { path: resolve(directory, 'chapter.vtt'), data: Buffer.from(captions.vtt) },
  ];
  if (changedInputs(inputs, await chapterInputs(chapter, config)).length)
    throw new Error(
      `Inputs changed while recording ${chapter.id}. Its previous recording is preserved.`,
    );
  const metadata = {
    sourceFiles: Object.keys(await snapshot(['src', 'entrypoints'])),
    commit: commitId(),
    recordedAt: new Date().toISOString(),
    inputs,
    scenes: scenes.map(({ id, text, duration, audioDuration, timings }) => ({
      id,
      text,
      duration,
      audioDuration,
      timings,
    })),
    outputs: Object.fromEntries(writes.map((item) => [relative(root, item.path), hash(item.data)])),
  };
  writes.push({
    path: resolve(directory, 'capture.json'),
    data: Buffer.from(JSON.stringify(metadata, null, 2) + '\n'),
  });
  await publishFiles(writes);
  return metadata;
}

export async function assemble(chapters, opts, signal, destination = promoRoot) {
  const captures = [];
  for (const chapter of chapters) {
    const saved = await readJson(resolve(promoRoot, 'chapters', chapter.id, 'capture.json'));
    if (!saved || !(await outputsMatch(saved.outputs))) {
      console.log(
        `Full video awaits a completed recording of ${chapter.title}. Saved chapter previews remain in .output/promo/chapters/.`,
      );
      return;
    }
    captures.push({ chapter, saved });
  }
  const staging = resolve(destination, 'assembly');
  await mkdir(staging, { recursive: true });
  const path = resolve(staging, 'job-buddy-promo.mp4');
  await joinClips(
    captures.map(({ chapter }) => resolve(promoRoot, 'chapters', chapter.id, 'chapter.mp4')),
    path,
    signal,
  );
  const captions = subtitles(captures.flatMap(({ saved }) => saved.scenes));
  const writes = [
    { path: resolve(destination, 'job-buddy-promo.mp4'), data: await readFile(path) },
    { path: resolve(destination, 'job-buddy-promo.srt'), data: Buffer.from(captions.srt) },
    { path: resolve(destination, 'job-buddy-promo.vtt'), data: Buffer.from(captions.vtt) },
  ];
  if (opts['burn-subtitles']) {
    await writeFile(resolve(staging, 'captions.srt'), captions.srt);
    const burned = resolve(staging, 'job-buddy-promo-captioned.mp4');
    await run(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-i',
        path,
        '-vf',
        'subtitles=captions.srt',
        '-c:v',
        'libx264',
        '-crf',
        '19',
        '-preset',
        'fast',
        '-c:a',
        'copy',
        burned,
      ],
      { cwd: staging, signal },
    );
    await mediaInfo(burned);
    writes.push({
      path: resolve(destination, 'job-buddy-promo-captioned.mp4'),
      data: await readFile(burned),
    });
  }
  const manifest = {
    assembledAt: new Date().toISOString(),
    chapters: Object.fromEntries(
      captures.map(({ chapter, saved }) => [
        chapter.id,
        {
          commit: saved.commit,
          recordedAt: saved.recordedAt,
          inputs: saved.inputs,
          outputs: saved.outputs,
        },
      ]),
    ),
    outputs: Object.fromEntries(writes.map((item) => [relative(root, item.path), hash(item.data)])),
  };
  writes.push({
    path: resolve(destination, 'manifest.json'),
    data: Buffer.from(JSON.stringify(manifest, null, 2) + '\n'),
  });
  await publishFiles(writes);
  console.log(
    `Video and subtitles ready for review\n${resolve(destination, 'job-buddy-promo.mp4')}`,
  );
}

export function promoCommand() {
  cli(() =>
    withCaptureLock(async (signal) => {
      const opts = options();
      if (opts['from-captures'] || opts['user-guide'])
        throw new Error('Use --assemble-only to reuse promo recordings.');
      if (opts.chapter && opts['assemble-only'])
        throw new Error('Choose either --chapter or --assemble-only.');
      const config = await readJson(absolute('scripts/promo/chapters.json'));
      validateChapters(config);
      if (opts.chapter && !config.chapters.some((chapter) => chapter.id === opts.chapter))
        throw new Error(
          `Unknown chapter. Choose ${config.chapters.map((chapter) => chapter.id).join(', ')}.`,
        );
      const selected = [];
      const missingClips = [];
      const knownSourceFiles = new Set();
      let hasSourceBaseline = false;
      console.log('Job Buddy promotional video\n');
      for (const chapter of config.chapters) {
        const inputs = await chapterInputs(chapter, config);
        const previous = await readJson(resolve(promoRoot, 'chapters', chapter.id, 'capture.json'));
        if (previous?.sourceFiles) {
          hasSourceBaseline = true;
          for (const path of previous.sourceFiles) knownSourceFiles.add(path);
        }
        const changed = changedInputs(previous?.inputs, inputs);
        const valid = await outputsMatch(previous?.outputs);
        const stale = opts.force || opts.chapter === chapter.id || changed.length || !valid;
        const refresh =
          !opts['assemble-only'] && (opts.chapter ? chapter.id === opts.chapter : stale);
        console.log(
          `${chapter.id.padEnd(10)} ${refresh ? 'Refresh' : valid ? 'Reuse' : 'Missing'} · ${chapter.title}${previous?.commit ? ` · ${previous.commit.slice(0, 7)}` : ''}`,
        );
        if (previous && changed.length) console.log(`  Changed ${changed.join(', ')}`);
        if (opts['assemble-only'] && !valid)
          throw new Error(`Record ${chapter.id} before assembling the full video.`);
        if (opts['assemble-only'] && changed.length)
          console.log(
            '  Saved recording has older inputs. Assembly keeps its recorded narration and subtitles.',
          );
        if (refresh) {
          selected.push({ chapter, inputs });
          for (const scene of chapter.scenes.filter((scene) => scene.external)) {
            const path = resolve(promoRoot, 'external', scene.external);
            if (!(await fileHash(path))) missingClips.push(path);
          }
        }
      }
      if (hasSourceBaseline) {
        const added = Object.keys(await snapshot(['src', 'entrypoints'])).filter(
          (path) => !knownSourceFiles.has(path),
        );
        if (added.length)
          console.log(
            `New source files need a chapter coverage review\n${added.map((path) => `  ${path}`).join('\n')}`,
          );
      }
      console.log(
        '\nReview narration and browser steps when a feature changes. New features need a chapter decision before recording.',
      );
      console.log(
        'External clips must be reviewed for account details, notifications and keys before generation.',
      );
      for (const path of missingClips) console.log(`Missing reviewed external clip\n  ${path}`);
      if (opts.check) return;
      if (missingClips.length)
        throw new Error(
          'Supply the reviewed desktop clips listed above, or use --chapter to record a ready chapter.',
        );
      requireTool('ffmpeg', ['-version'], 'Install FFmpeg from https://ffmpeg.org/download.html.');
      requireTool('ffprobe', ['-version'], 'Install FFprobe with FFmpeg.');
      if (opts['burn-subtitles']) {
        const filters = spawnSync('ffmpeg', ['-hide_banner', '-filters'], { encoding: 'utf8' });
        if (filters.status !== 0 || !/\bsubtitles\b/.test(filters.stdout))
          throw new Error(
            'Subtitle burn-in needs an FFmpeg build with libass and the subtitles filter. SRT and VTT files work with the standard assembly command.',
          );
      }
      if (
        await speechNeeded(
          selected.map(({ chapter }) => chapter),
          config,
        )
      ) {
        requireTool(
          python,
          ['-c', 'import kokoro_onnx, soundfile'],
          'Create .output/promo/kokoro with Python 3.12 or 3.13 and install scripts/promo/requirements.txt.',
        );
        for (const [name, digest] of await readJson(absolute('scripts/promo/models.json'))) {
          if ((await fileHash(resolve(promoRoot, 'models', name))) !== digest)
            throw new Error(
              'Kokoro model files are missing or changed. Run node scripts/promo/setup.mjs after reviewing its download report.',
            );
        }
      }
      if (selected.length) await requireBrowser();
      if (!(await confirm('Generate the selected chapters and assemble the video?', opts, signal)))
        return;
      let stopPreview = async () => {};
      try {
        if (selected.length) {
          await ensureBuild(signal);
          if (selected.some(({ chapter }) => chapter.id === 'backups'))
            stopPreview = await ensurePreview(signal);
        }
        for (const { chapter, inputs } of selected) {
          console.log(`Recording ${chapter.title}`);
          await renderChapter(chapter, config, inputs, signal);
        }
        await assemble(config.chapters, opts, signal);
      } finally {
        await stopPreview();
      }
    }),
  );
}
