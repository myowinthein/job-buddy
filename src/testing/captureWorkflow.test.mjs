import { Buffer } from 'node:buffer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  changedInputs,
  hash,
  options,
  outputsMatch,
  publishFiles,
  saveJson,
  snapshot,
} from '../../scripts/capture/workflow.mjs';
import {
  subtitles,
  subtitleTime,
  speechKey,
  chapterInputs,
  validateChapters,
} from '../../scripts/promo/render.mjs';

let directory;
beforeEach(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'job-buddy-capture-test-'));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(directory, { recursive: true, force: true });
});

it('tracks additions, deletions and uncommitted content changes', async () => {
  await writeFile(resolve(directory, 'first.ts'), 'original');
  const before = await snapshot([directory]);
  await writeFile(resolve(directory, 'first.ts'), 'edited');
  await writeFile(resolve(directory, 'new.ts'), 'new');
  const after = await snapshot([directory]);
  expect(changedInputs(before, after)).toEqual(
    [resolve(directory, 'first.ts'), resolve(directory, 'new.ts')].sort(),
  );
  await rm(resolve(directory, 'first.ts'));
  expect(changedInputs(after, await snapshot([directory]))).toEqual([
    resolve(directory, 'first.ts'),
  ]);
});

it('excludes test and hidden integration files while allowing explicitly declared test inputs', async () => {
  await writeFile(resolve(directory, '.env.production'), 'synthetic-value');
  await writeFile(resolve(directory, 'runtime.ts'), 'source');
  await writeFile(resolve(directory, 'runtime.test.ts'), 'test');
  expect(Object.keys(await snapshot([directory]))).toEqual([resolve(directory, 'runtime.ts')]);
  expect(Object.keys(await snapshot([resolve(directory, 'runtime.test.ts')]))).toEqual([
    resolve(directory, 'runtime.test.ts'),
  ]);
  await expect(snapshot([resolve(directory, '.env.production')])).rejects.toThrow(
    'Private capture input',
  );
});

it('does not follow source symlinks or mark a missing output current', async () => {
  const { symlink } = await import('node:fs/promises');
  await mkdir(resolve(directory, 'source'));
  await writeFile(resolve(directory, 'outside.txt'), 'private sample');
  await symlink(resolve(directory, 'outside.txt'), resolve(directory, 'source', 'alias.txt'));
  expect(await snapshot([resolve(directory, 'source')])).toEqual({});
  expect(await outputsMatch({ [resolve(directory, 'missing.png')]: hash('missing') })).toBe(false);
});

it('validates cached output bytes and writes complete metadata', async () => {
  const path = resolve(directory, 'capture.png');
  await writeFile(path, 'image');
  expect(await outputsMatch({ [path]: hash('image') })).toBe(true);
  await writeFile(path, 'changed image');
  expect(await outputsMatch({ [path]: hash('image') })).toBe(false);
  const metadata = resolve(directory, 'capture.json');
  await saveJson(metadata, { commit: 'sample-commit', state: 'complete' });
  expect(JSON.parse(await readFile(metadata, 'utf8'))).toEqual({
    commit: 'sample-commit',
    state: 'complete',
  });
});

it('prepares every destination before replacing any previous asset', async () => {
  const image = resolve(directory, 'existing.png');
  await writeFile(image, 'original');
  await mkdir(resolve(directory, 'invalid-destination'));
  await expect(
    publishFiles([
      { path: image, data: Buffer.from('new image') },
      { path: resolve(directory, 'invalid-destination'), data: Buffer.from('invalid') },
    ]),
  ).rejects.toThrow();
  expect(await readFile(image, 'utf8')).toBe('original');
});

it('rolls back completed replacements when a later destination changes', async () => {
  const path = resolve(directory, 'image.png');
  await writeFile(path, 'original');
  await expect(
    publishFiles([
      { path, data: Buffer.from('first replacement') },
      { path, data: Buffer.from('second replacement') },
    ]),
  ).rejects.toThrow('destination changed');
  expect(await readFile(path, 'utf8')).toBe('original');
});

it('accepts the documented modes and rejects misspelled flags', () => {
  expect(options(['--chapter', 'mappings', '--check']).chapter).toBe('mappings');
  expect(options(['--assemble-only', '--burn-subtitles', '--yes'])['assemble-only']).toBe(true);
  expect(() => options(['--chaptr', 'mappings'])).toThrow();
});

it('offsets measured speech cues across scenes and chapters in both subtitle formats', () => {
  const result = subtitles([
    { duration: 3, audioDuration: 2, timings: [{ text: 'First sentence.', start: 0, end: 2 }] },
    {
      duration: 4,
      audioDuration: 2.5,
      timings: [{ text: 'Second sentence.', start: 0.5, end: 2.5 }],
    },
  ]);
  expect(result.srt).toContain('00:00:00,300 --> 00:00:02,300\nFirst sentence.');
  expect(result.srt).toContain('00:00:03,800 --> 00:00:05,800\nSecond sentence.');
  expect(result.vtt).toContain('00:00:03.800 --> 00:00:05.800');
  expect(subtitleTime(3661.007)).toBe('01:01:01,007');
});

it('refuses missing or out-of-range speech timings instead of inventing captions', () => {
  expect(() => subtitles([{ duration: 3, audioDuration: 2 }])).toThrow('timings are missing');
  expect(() =>
    subtitles([{ duration: 3, audioDuration: 2, timings: [{ text: 'Wrong.', start: 1, end: 4 }] }]),
  ).toThrow('outside');
});

it('reuses narration independently from other chapters and re-records edited text', async () => {
  const scene = { text: 'A recorded sentence.' };
  const config = { voice: 'af_heart', speed: 1, chapters: ['first'] };
  expect(await speechKey(scene, config)).toBe(
    await speechKey(scene, { ...config, chapters: ['edited second chapter'] }),
  );
  expect(await speechKey(scene, config)).not.toBe(
    await speechKey({ text: 'A revised sentence.' }, config),
  );
});

it('tracks the selected chapter independently of other narration', async () => {
  const chapter = {
    id: 'intro',
    inputs: [],
    scenes: [{ id: 'intro-form', text: 'Original narration.' }],
  };
  const config = { voice: 'af_heart', speed: 1 };
  expect(await chapterInputs(chapter, config)).toEqual(
    await chapterInputs(chapter, { ...config, chapters: ['other edits'] }),
  );
  expect((await chapterInputs(chapter, config))['@chapter']).not.toBe(
    (await chapterInputs({ ...chapter, scenes: [{ id: 'intro-form', text: 'Edited.' }] }, config))[
      '@chapter'
    ],
  );
});

it('rejects duplicate chapters and paths escaping the generated output folder', () => {
  const chapter = {
    id: 'intro',
    title: 'Introduction',
    inputs: [],
    scenes: [{ id: 'intro-form', text: 'Narration.' }],
  };
  const config = { voice: 'af_heart', speed: 1, chapters: [chapter] };
  expect(() => validateChapters(config)).not.toThrow();
  expect(() =>
    validateChapters({ ...config, chapters: [{ ...chapter, id: undefined }] }),
  ).toThrow();
  expect(() => validateChapters({ ...config, chapters: [chapter, chapter] })).toThrow('unique ID');
  expect(() =>
    validateChapters({ ...config, chapters: [{ ...chapter, id: '../outside' }] }),
  ).toThrow();
  expect(() =>
    validateChapters({
      ...config,
      chapters: [
        {
          ...chapter,
          scenes: [{ id: 'intro-form', text: 'Narration.', external: '../private.mp4' }],
        },
      ],
    }),
  ).toThrow('Invalid scene');
});
