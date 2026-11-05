# Developing Job Buddy

Job Buddy is a Chrome MV3 extension built with WXT, React, TypeScript, and
Tailwind CSS v4. Profile data lives in Chrome's local storage; there is no backend.

## Run the extension

Use Node.js 22 (see [.nvmrc](../.nvmrc)) and pnpm 11.7.0.

```bash
git clone https://github.com/myowinthein/job-buddy.git
cd job-buddy
pnpm install
pnpm dev
```

In Chrome, open `chrome://extensions/`, enable **Developer mode**, select **Load
unpacked**, and choose `.output/chrome-mv3-dev/`. Keep `pnpm dev` running while
developing. Development builds use an amber logo; production uses blue.

Add a Gemini key in Settings to use autofill, resume import, and AI mapping review.
Google Drive setup is optional. See [Project Setup](../.github/SETUP.md) for
integration and release configuration.

The dev server uses `127.0.0.1`, with port 3000 by default. Restart it after adding
an HTML entrypoint so WXT discovers the new page. Already-open application pages
may retain an earlier content script; refresh them before testing autofill changes.

## Commands

| Command              | Purpose                                  |
| -------------------- | ---------------------------------------- |
| `pnpm dev`           | Start Chrome extension development.      |
| `pnpm compile`       | Check TypeScript without emitting files. |
| `pnpm lint`          | Run ESLint.                              |
| `pnpm test:run`      | Run Vitest once.                         |
| `pnpm build`         | Build the production Chrome extension.   |
| `pnpm zip`           | Build a Chrome Web Store archive.        |
| `pnpm serve:landing` | Serve the static website in `docs/`.     |

Build output is under `.output/`. Firefox scripts are also available in
[package.json](../package.json); production distribution targets Chrome.

## Check changes

CI runs TypeScript, ESLint, Vitest, and the production build. Before submitting code
changes, run:

```bash
pnpm compile
pnpm lint
pnpm test:run
pnpm build
```

Use focused existing tests while working. DOM tests opt into jsdom per file;
keep tests under `src/`, outside WXT's `entrypoints/`.

Autofill matching changes also need browser verification of actual filled values
and form events. Browser tests use Playwright with an isolated Chromium profile
and synthetic local forms. Install Chromium once:

```bash
pnpm exec playwright install chromium
```

Then run `pnpm test:browser`, which builds the extension and runs the browser tests.
After a build, use `pnpm exec playwright test --headed` to inspect a test in the
browser.

## Development tools

Every development options page has a **Profile** segmented control with
**Original**, **Empty**, **Required only**, and **Complete** modes, plus
**API key** and **Google Drive** toggles. These controls
open temporary data in the same tab, keep the current section, and respect
unsaved edits. The bar stays in place while the next isolated view loads.
Integration changes preserve edits. **Original** returns to saved extension data.
Temporary changes reset on refresh. Gemini and Drive are simulated. Popup and
job-form data are unaffected.

The top bar is the development interface. Production builds exclude it.

## Project references

- [AGENTS.md](../AGENTS.md): architecture, domain rules, and project conventions.
- [Project Setup](../.github/SETUP.md): Gemini, Drive OAuth, and automated releases.
- [User guide](USAGE.md): current product workflows.
- [Landing page](index.html) and [project overview](project-site/index.html).

Local development uses direct commits to `main`. Publication is separate: the
release workflow runs on `v*.*.*` tags and uploads to the Chrome Web Store.
