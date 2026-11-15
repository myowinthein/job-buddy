import { build } from 'vite';

interface FixtureBuildOptions {
  entry: string;
  name: string;
  missingChunkMessage: string;
  minify?: false;
}

export async function buildFixtureScript(options: FixtureBuildOptions): Promise<string> {
  const bundle = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      ...(options.minify === false ? { minify: false } : {}),
      lib: {
        entry: options.entry,
        formats: ['iife'],
        name: options.name,
      },
    },
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  });
  const output = Array.isArray(bundle) ? bundle[0].output : 'output' in bundle ? bundle.output : [];
  const chunk = output.find((item) => item.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk') throw new Error(options.missingChunkMessage);
  return chunk.code;
}
