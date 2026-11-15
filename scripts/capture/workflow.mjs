import { createHash, randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { access, mkdir, open, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';

export const root = fileURLToPath(new URL('../../', import.meta.url));
export const stateRoot = resolve(root, '.output/capture-workflow');
export const hash = (value) => createHash('sha256').update(value).digest('hex');
export const absolute = (path) => resolve(root, path);

export async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw new Error(`Cannot read ${relative(root, path)}. ${error.message}`);
  }
}

export async function fileHash(path) {
  try {
    return hash(await readFile(path));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function saveJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

/** Hash declared inputs, including untracked files, without reading integration env files. */
export async function snapshot(inputs) {
  const files = {};
  const visit = async (path) => {
    let entries;
    try {
      entries = await readdir(absolute(path), { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOTDIR') {
        files[path] = await fileHash(absolute(path));
        return;
      }
      if (error.code === 'ENOENT') {
        files[path] = null;
        return;
      }
      throw error;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      if (/\.(?:test|pw)\.[cm]?[jt]sx?$/.test(entry.name)) continue;
      await visit(`${path}/${entry.name}`);
    }
  };
  for (const input of [...new Set(inputs)].sort()) {
    if (input.split('/').some((part) => part.startsWith('.env') || part === '.helm'))
      throw new Error(`Private capture input is forbidden: ${input}`);
    await visit(input);
  }
  return Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
}

export function changedInputs(previous = {}, current = {}) {
  return [...new Set([...Object.keys(previous), ...Object.keys(current)])]
    .filter((name) => previous[name] !== current[name])
    .sort();
}

export function commitId() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0)
    throw new Error('Run capture commands inside the Job Buddy Git checkout.');
  return result.stdout.trim();
}

export function options(args = process.argv.slice(2)) {
  return parseArgs({
    args,
    options: {
      check: { type: 'boolean', default: false },
      yes: { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
      'from-captures': { type: 'boolean', default: false },
      'user-guide': { type: 'boolean', default: false },
      chapter: { type: 'string' },
      'assemble-only': { type: 'boolean', default: false },
      'burn-subtitles': { type: 'boolean', default: false },
    },
  }).values;
}

export async function confirm(message, opts, signal) {
  if (opts.yes) return true;
  if (!process.stdin.isTTY) {
    throw new Error(
      'Review the report with --check, then run with --yes to confirm in a non-interactive terminal.',
    );
  }
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await prompt.question(`${message}\n1. Generate\n2. Cancel\nChoose [2]: `, {
      signal,
    });
    return answer.trim() === '1';
  } finally {
    prompt.close();
  }
}

export function requireTool(command, args, instruction) {
  const result = spawnSync(command, args, { stdio: 'ignore', cwd: root });
  if (result.status !== 0) throw new Error(`${command} is unavailable. ${instruction}`);
}

export async function requireBrowser() {
  try {
    await access(chromium.executablePath(), constants.R_OK);
  } catch {
    throw new Error('Playwright Chromium is missing. Run pnpm playwright install chromium.');
  }
}

export async function run(command, args, { signal, ...settings } = {}) {
  signal?.throwIfAborted();
  await new Promise((done, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', signal, ...settings });
    child.once('error', reject);
    child.once('exit', (code, reason) => {
      if (code === 0) done();
      else
        reject(
          new Error(`${command} failed${reason ? ` (${reason})` : ` with exit code ${code}`}.`),
        );
    });
  });
}

export const runtimeInputs = [
  'src',
  'entrypoints',
  'public',
  'wxt.config.ts',
  'postcss.config.js',
  'package.json',
  'pnpm-lock.yaml',
];

export async function ensureBuild(signal) {
  const inputs = await snapshot(runtimeInputs);
  const path = resolve(stateRoot, 'build.json');
  const previous = await readJson(path);
  const outputs = await snapshot(['.output/chrome-mv3']);
  if (
    previous &&
    JSON.stringify(previous.inputs) === JSON.stringify(inputs) &&
    JSON.stringify(previous.outputs) === JSON.stringify(outputs) &&
    (await fileHash(absolute('.output/chrome-mv3/manifest.json')))
  )
    return;
  console.log('Building the production extension for capture.');
  await run('pnpm', ['build'], { signal });
  if (changedInputs(inputs, await snapshot(runtimeInputs)).length)
    throw new Error('Source files changed during the build. Run the command again.');
  await saveJson(path, { inputs, outputs: await snapshot(['.output/chrome-mv3']) });
}

/** Reuse the isolated preview, or own and stop a newly started server process group. */
export async function ensurePreview(signal) {
  const url = 'http://127.0.0.1:4173/';
  const probe = async () => {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (
        !response.ok ||
        !(await response.text()).includes('<title>Job Buddy: Profile Preview</title>')
      )
        throw new Error('Port 4173 is serving another application. Free it before capturing.');
      return true;
    } catch (error) {
      if (error.message.includes('another application')) throw error;
      return false;
    }
  };
  if (await probe()) return async () => {};
  const child = spawn('pnpm', ['dev:preview'], {
    cwd: root,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let failure;
  let diagnostics = '';
  child.on('error', (error) => {
    failure = error;
  });
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (chunk) => {
      diagnostics = (diagnostics + chunk).slice(-4000);
    });
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode) return;
    const exited = new Promise((done) => child.once('exit', done));
    try {
      if (process.platform === 'win32') child.kill('SIGTERM');
      else process.kill(-child.pid, 'SIGTERM');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
    await Promise.race([exited, new Promise((done) => setTimeout(done, 2000))]);
    if (child.exitCode === null && !child.signalCode) {
      try {
        if (process.platform === 'win32') child.kill('SIGKILL');
        else process.kill(-child.pid, 'SIGKILL');
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
      await exited;
    }
  };
  try {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      signal?.throwIfAborted();
      if (failure || child.exitCode !== null)
        throw new Error(`Preview could not start. ${failure?.message ?? diagnostics}`);
      if (await probe()) return stop;
      await new Promise((done) => setTimeout(done, 200));
    }
    throw new Error(`Preview did not become ready within 30 seconds. ${diagnostics}`);
  } catch (error) {
    await stop();
    throw error;
  }
}

export async function outputsMatch(outputs) {
  if (!outputs || !Object.keys(outputs).length) return false;
  for (const [path, expected] of Object.entries(outputs))
    if (!expected || (await fileHash(absolute(path))) !== expected) return false;
  return true;
}

/** Prepare the entire asset set and restore completed writes if promotion fails. */
export async function publishFiles(writes) {
  const prepared = [];
  try {
    for (const { path, data } of writes) {
      if (!data.length) throw new Error(`Empty capture output: ${path}`);
      let original = null;
      try {
        original = await readFile(path);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      await mkdir(dirname(path), { recursive: true });
      const temporary = `${path}.${randomUUID()}.capture-tmp`;
      await writeFile(temporary, data);
      prepared.push({ path, data, original, temporary, done: false });
    }
    for (const item of prepared) {
      if ((await fileHash(item.path)) !== (item.original ? hash(item.original) : null))
        throw new Error(
          `Capture destination changed during publishing: ${relative(root, item.path)}`,
        );
      await rename(item.temporary, item.path);
      item.done = true;
    }
  } catch (error) {
    for (const item of prepared.filter((item) => item.done).reverse()) {
      if ((await fileHash(item.path)) !== hash(item.data)) continue;
      if (item.original) await writeFile(item.path, item.original);
      else await rm(item.path, { force: true });
    }
    throw error;
  } finally {
    await Promise.all(prepared.map((item) => rm(item.temporary, { force: true })));
  }
}

export async function withCaptureLock(action) {
  await mkdir(stateRoot, { recursive: true });
  const path = resolve(stateRoot, 'running.json');
  let lock;
  try {
    lock = await open(path, 'wx');
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const owner = await readJson(path);
    let alive = true;
    if (Number.isSafeInteger(owner?.pid)) {
      try {
        process.kill(owner.pid, 0);
      } catch (failure) {
        if (failure.code === 'ESRCH') alive = false;
      }
    }
    if (alive) throw new Error('Another capture is running. Finish it before starting another.');
    await rm(path);
    lock = await open(path, 'wx');
  }
  await lock.writeFile(JSON.stringify({ pid: process.pid }));
  const controller = new AbortController();
  const cancel = () => controller.abort(new Error('Capture cancelled.'));
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  try {
    return await action(controller.signal);
  } finally {
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
    await lock.close();
    await rm(path, { force: true });
  }
}

export function cli(action) {
  action().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
