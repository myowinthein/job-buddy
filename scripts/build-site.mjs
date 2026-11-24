import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--check'))
  throw new Error('Usage: node scripts/build-site.mjs [--check]');
const check = args.includes('--check');
const { version } = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)) throw new Error('Invalid website version');

const pages = [
  { path: 'index.html', root: './', current: 'walkthrough' },
  { path: 'developers/index.html', root: '../', current: 'developers' },
  { path: 'legal/privacy/index.html', root: '../../' },
  { path: 'legal/disclaimer/index.html', root: '../../' },
  // The error page's base element resolves these URLs from any missing path.
  { path: '404.html', root: './' },
];
const templates = Object.fromEntries(
  await Promise.all(
    ['header', 'footer'].map(async (name) => [
      name,
      (await readFile(resolve(root, `scripts/site-templates/${name}.html`), 'utf8')).trimEnd(),
    ]),
  ),
);

function render(template, data) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!Object.hasOwn(data, key)) throw new Error(`Unknown website template value: ${key}`);
    return data[key];
  });
}

// Prepare every page before writing, so a missing/ambiguous region changes nothing.
const output = await Promise.all(
  pages.map(async (page) => {
    const path = resolve(root, 'docs', page.path);
    const before = await readFile(path, 'utf8');
    let after = before;
    if (
      before.indexOf('    <!-- site:footer:start -->') <
      before.indexOf('    <!-- site:header:end -->')
    )
      throw new Error(`Overlapping or misordered website regions in docs/${page.path}`);
    const data = {
      root: page.root,
      version,
      walkthroughCurrent: page.current === 'walkthrough' ? ' aria-current="page"' : '',
      developersCurrent: page.current === 'developers' ? ' aria-current="page"' : '',
      demoFrom: page.current === 'developers' ? 'developers' : 'walkthrough',
    };
    for (const [name, template] of Object.entries(templates)) {
      const start = `    <!-- site:${name}:start -->`;
      const end = `    <!-- site:${name}:end -->`;
      if (after.split(start).length !== 2 || after.split(end).length !== 2)
        throw new Error(`Expected one ${name} region in docs/${page.path}`);
      const from = after.indexOf(start) + start.length;
      const to = after.indexOf(end);
      if (to < from) throw new Error(`Reversed ${name} region in docs/${page.path}`);
      after = after.slice(0, from) + '\n' + render(template, data) + '\n' + after.slice(to);
    }
    return { path, before, after, name: `docs/${page.path}` };
  }),
);

const changed = output.filter(({ before, after }) => before !== after);
if (check) {
  if (changed.length) {
    console.error(
      'Shared website layout is out of date. Run pnpm build:site:\n' +
        changed.map(({ name }) => name).join('\n'),
    );
    process.exitCode = 1;
  } else console.log(`Shared website layout is current (${pages.length} pages, v${version}).`);
} else {
  for (const { path, after } of changed) await writeFile(path, after);
  console.log(`Updated shared website layout in ${changed.length} pages (v${version}).`);
}
