import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const projectPath = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// This server renders the source UI with synthetic data, independently of WXT
// and the installed extension. Never load or expose integration environment keys.
export default defineConfig({
  root: projectPath('./src/preview'),
  publicDir: projectPath('./public'),
  envDir: false,
  envPrefix: [],
  cacheDir: projectPath('./node_modules/.vite-preview'),
  resolve: {
    alias: [
      { find: '@/src/utils/driveSync', replacement: projectPath('./src/preview/driveSync.ts') },
      { find: '@/src/resume-ai/gemini', replacement: projectPath('./src/preview/gemini.ts') },
      { find: '@', replacement: projectPath('.') },
    ],
  },
  server: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    headers: {
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws://127.0.0.1:4173; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'none'",
    },
  },
  build: {
    outDir: projectPath('./.output/preview'),
  },
});
