import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--check'))
  throw new Error('Usage: node scripts/build-site.mjs [--check]');
const check = args.includes('--check');
const { version } = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)) throw new Error('Invalid website version');

const pages = [
  { path: 'index.html', root: './', current: 'walkthrough', versionAssets: true },
  { path: 'developers/index.html', root: '../', current: 'developers', versionAssets: true },
  { path: 'legal/privacy/index.html', root: '../../', current: 'privacy' },
  { path: 'legal/disclaimer/index.html', root: '../../', current: 'disclaimer' },
  // The error page's base element resolves these URLs from any missing path.
  { path: '404.html', root: './', versionAssets: true },
  { path: 'demo/index.html', versionAssets: true, standalone: true },
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

const assetVersions = new Map();
async function versionAssets(html, page) {
  const tags = [...html.matchAll(/<(script|link)\b[^>]*>/gi)];
  const replacements = await Promise.all(
    tags.map(async (match) => {
      const tag = match[0];
      const script = match[1].toLowerCase() === 'script';
      if (!script && !/\brel\s*=\s*(["'])stylesheet\1/i.test(tag)) return tag;
      const attribute = new RegExp(`\\b${script ? 'src' : 'href'}\\s*=\\s*(["'])(.*?)\\1`, 'i');
      const reference = attribute.exec(tag);
      if (!reference || /^(?:[a-z][\w+.-]*:|\/\/)/i.test(reference[2])) return tag;
      const source = reference[2].replace(/&amp;/g, '&');
      const url = new URL(source, new URL(page, 'https://site.invalid/job-buddy/'));
      if (!url.pathname.startsWith('/job-buddy/'))
        throw new Error(`Asset outside website: ${source}`);
      const file = resolve(
        root,
        'docs',
        decodeURIComponent(url.pathname.slice('/job-buddy/'.length)),
      );
      if (!file.startsWith(resolve(root, 'docs') + '/'))
        throw new Error(`Asset outside website: ${source}`);
      if (!assetVersions.has(file))
        assetVersions.set(
          file,
          readFile(file).then((bytes) =>
            createHash('sha256').update(bytes).digest('hex').slice(0, 12),
          ),
        );
      url.searchParams.set('v', await assetVersions.get(file));
      const versioned = (source.split(/[?#]/)[0] + url.search + url.hash).replace(/&/g, '&amp;');
      return tag.replace(attribute, (value) => value.replace(reference[2], () => versioned));
    }),
  );
  for (let index = tags.length - 1; index >= 0; index--) {
    const match = tags[index];
    html =
      html.slice(0, match.index) + replacements[index] + html.slice(match.index + match[0].length);
  }
  return html;
}

// Prepare every page before writing, so a missing/ambiguous region changes nothing.
const output = await Promise.all(
  pages.map(async (page) => {
    const path = resolve(root, 'docs', page.path);
    const before = await readFile(path, 'utf8');
    let after = before;
    if (
      !page.standalone &&
      before.indexOf('    <!-- site:footer:start -->') <
        before.indexOf('    <!-- site:header:end -->')
    )
      throw new Error(`Overlapping or misordered website regions in docs/${page.path}`);
    const data = {
      root: page.root,
      version,
      walkthroughCurrent: page.current === 'walkthrough' ? ' aria-current="page"' : '',
      developersCurrent: page.current === 'developers' ? ' aria-current="page"' : '',
      privacyCurrent: page.current === 'privacy' ? ' aria-current="page"' : '',
      disclaimerCurrent: page.current === 'disclaimer' ? ' aria-current="page"' : '',
      demoFrom: page.current === 'developers' ? 'developers' : 'walkthrough',
    };
    for (const [name, template] of Object.entries(templates)) {
      if (page.standalone) break;
      const start = `    <!-- site:${name}:start -->`;
      const end = `    <!-- site:${name}:end -->`;
      if (after.split(start).length !== 2 || after.split(end).length !== 2)
        throw new Error(`Expected one ${name} region in docs/${page.path}`);
      const from = after.indexOf(start) + start.length;
      const to = after.indexOf(end);
      if (to < from) throw new Error(`Reversed ${name} region in docs/${page.path}`);
      after = after.slice(0, from) + '\n' + render(template, data) + '\n' + after.slice(to);
    }
    if (page.versionAssets) after = await versionAssets(after, page.path);
    return { path, before, after, name: `docs/${page.path}` };
  }),
);

const changed = output.filter(({ before, after }) => before !== after);
if (check) {
  if (changed.length) {
    console.error(
      'Website layout or asset versions are out of date. Run pnpm build:site:\n' +
        changed.map(({ name }) => name).join('\n'),
    );
    process.exitCode = 1;
  } else console.log(`Website build is current (${pages.length} pages, v${version}).`);
} else {
  for (const { path, after } of changed) await writeFile(path, after);
  console.log(
    `Updated website layout and asset versions in ${changed.length} pages (v${version}).`,
  );
}
