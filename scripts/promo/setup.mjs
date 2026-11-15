import { mkdir, rename, rm } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { resolve } from 'node:path';
import {
  absolute,
  cli,
  confirm,
  fileHash,
  options,
  readJson,
  withCaptureLock,
} from '../capture/workflow.mjs';

cli(() =>
  withCaptureLock(async (signal) => {
    const opts = options();
    const directory = absolute('.output/promo/models');
    const models = await readJson(absolute('scripts/promo/models.json'));
    const missing = [];
    for (const [name, digest] of models)
      if ((await fileHash(resolve(directory, name))) !== digest) missing.push([name, digest]);
    if (!missing.length) {
      console.log('Kokoro model files are ready.');
      return;
    }
    console.log(
      `Kokoro model setup\nDownloads up to 354 MB into ${directory}.\nSource https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.1`,
    );
    if (opts.check || !(await confirm('Download the missing model files?', opts, signal))) return;
    await mkdir(directory, { recursive: true });
    for (const [name, digest] of missing) {
      const output = resolve(directory, name);
      const partial = `${output}.download`;
      try {
        const response = await fetch(
          `https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/${name}`,
          { signal },
        );
        if (!response.ok || !response.body)
          throw new Error(`Model download failed with HTTP ${response.status}.`);
        await pipeline(Readable.fromWeb(response.body), createWriteStream(partial), { signal });
        if ((await fileHash(partial)) !== digest)
          throw new Error(`Model checksum mismatch for ${name}.`);
        await rename(partial, output);
        console.log(`Ready ${name}`);
      } finally {
        await rm(partial, { force: true });
      }
    }
  }),
);
