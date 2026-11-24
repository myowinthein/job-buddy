import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';

const pages = [
  'index.html',
  'developers/index.html',
  'legal/privacy/index.html',
  'legal/disclaimer/index.html',
  '404.html',
];
let fixture: string;
const body = '<main id="main"><p>Keep this page’s content &amp; links.</p></main>';
beforeEach(() => {
  fixture = mkdtempSync(join(tmpdir(), 'job-buddy-site-layout-'));
  mkdirSync(join(fixture, 'scripts'));
  cpSync(resolve('scripts/build-site.mjs'), join(fixture, 'scripts/build-site.mjs'));
  cpSync(resolve('scripts/site-templates'), join(fixture, 'scripts/site-templates'), {
    recursive: true,
  });
  writeFileSync(join(fixture, 'package.json'), JSON.stringify({ version: '9.8.7' }));
  for (const page of pages) {
    const path = join(fixture, 'docs', page);
    mkdirSync(resolve(path, '..'), { recursive: true });
    writeFileSync(
      path,
      `<!doctype html><body>\n    <!-- site:header:start -->\n    <!-- site:header:end -->\n${body}\n    <!-- site:footer:start -->\n    <!-- site:footer:end -->\n</body>\n`,
    );
  }
});
afterEach(() => rmSync(fixture, { recursive: true, force: true }));
function build(...args: string[]) {
  return execFileSync(process.execPath, [join(fixture, 'scripts/build-site.mjs'), ...args], {
    encoding: 'utf8',
  });
}
function read(page: string) {
  return readFileSync(join(fixture, 'docs', page), 'utf8');
}

it('propagates shared template and package-version changes to every page without changing content', () => {
  build();
  const template = join(fixture, 'scripts/site-templates/header.html');
  writeFileSync(
    template,
    readFileSync(template, 'utf8').replace('Job Buddy</a', 'Shared header</a'),
  );
  writeFileSync(join(fixture, 'package.json'), JSON.stringify({ version: '9.8.8' }));
  build();
  for (const page of pages) {
    expect(read(page)).toContain(body);
    expect(read(page)).toContain('Shared header</a');
    expect(read(page)).toContain('releases/tag/v9.8.8');
    expect(read(page)).toContain('aria-label="Project links"');
    expect(read(page)).toContain('aria-label="Legal links"');
  }
  expect(read('index.html')).toContain('href="./#start" aria-current="page"');
  expect(read('developers/index.html')).toContain('href="../developers/" aria-current="page"');
  expect(read('legal/privacy/index.html')).toContain(
    'href="../../assets/icons/external-link.svg#external-link"',
  );
  expect(read('legal/privacy/index.html')).not.toContain('aria-current="page"');
  expect(build('--check')).toContain('is current');
  const snapshot = pages.map(read);
  build();
  expect(pages.map(read)).toEqual(snapshot);
});

it('reports stale generated pages without writing during --check', () => {
  const snapshot = pages.map(read);
  const check = spawnSync(process.execPath, [join(fixture, 'scripts/build-site.mjs'), '--check'], {
    encoding: 'utf8',
  });
  expect(check.status).toBe(1);
  expect(check.stderr).toContain('Run pnpm build:site');
  expect(pages.map(read)).toEqual(snapshot);
});

it.each(['missing', 'duplicate', 'reversed'])(
  'rejects %s markers before writing any page',
  (problem) => {
    const page = 'legal/disclaimer/index.html';
    const start = '    <!-- site:header:start -->';
    const end = '    <!-- site:header:end -->';
    const invalid =
      problem === 'missing'
        ? read(page).replace(start, '')
        : problem === 'duplicate'
          ? read(page) + start
          : read(page)
              .replace(start, 'PLACEHOLDER')
              .replace(end, start)
              .replace('PLACEHOLDER', end);
    writeFileSync(join(fixture, 'docs', page), invalid);
    const snapshot = pages.map(read);
    const build = spawnSync(process.execPath, [join(fixture, 'scripts/build-site.mjs')], {
      encoding: 'utf8',
    });
    expect(build.status).toBe(1);
    expect(build.stderr).toContain('header region in docs/legal/disclaimer/index.html');
    expect(pages.map(read)).toEqual(snapshot);
  },
);

it('rejects a footer region surrounding the header before it can overwrite page content', () => {
  const page = 'index.html';
  const start = '    <!-- site:footer:start -->';
  writeFileSync(join(fixture, 'docs', page), start + '\n' + read(page).replace(start, ''));
  const snapshot = pages.map(read);
  const build = spawnSync(process.execPath, [join(fixture, 'scripts/build-site.mjs')], {
    encoding: 'utf8',
  });
  expect(build.status).toBe(1);
  expect(build.stderr).toContain('Overlapping or misordered website regions');
  expect(pages.map(read)).toEqual(snapshot);
});
