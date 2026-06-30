# Developer Onboarding

## 1. What this is

Job Buddy is a Chrome MV3 extension that autofills job application forms from a
structured user profile. The non-trivial part is the four-layer field mapper
that classifies every form field on a page into a confidence tier (green /
yellow / red / gray) and learns from user corrections on a per-domain basis.
The extension is entirely local-first -- no backend, no user accounts -- with
three optional integrations (Google Drive, Gemini AI, Chrome Web Store deploy)
that are off by default.

---

## 2. Local setup

**Prerequisites:** Node 22 (use `nvm use` to switch automatically), pnpm 11.

```bash
git clone https://github.com/myowinthein/job-buddy.git
cd job-buddy
pnpm install
pnpm dev          # dev build with hot reload -> .output/chrome-mv3-dev/
```

Load the extension in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select `.output/chrome-mv3-dev/`

The WXT dev server runs on port 3000 and hot-reloads most changes without
needing to re-load the extension in Chrome. Background script and manifest
changes do require a manual reload.

**Other useful commands:**

```bash
pnpm compile      # TypeScript type-check (no emit) — run before committing
pnpm lint         # ESLint
pnpm format       # Prettier
pnpm test         # Vitest in watch mode
pnpm test:run     # single run — run before committing
pnpm build        # production build -> .output/chrome-mv3/
pnpm zip          # production build + zip for Chrome Web Store upload
pnpm serve:demo   # demo job application form at localhost:8000 (for manual fill testing)
```

**Environment variables:**

Copy `.env.example` to `.env.development` before running `pnpm dev`. The only
variable needed for local development is `VITE_GOOGLE_DRIVE_CLIENT_ID` -- and
only if you are working on the Drive backup feature. AI features use a key the
user pastes into Settings at runtime; nothing goes in `.env` for that.

Never commit `.env.development` or `.env.production` -- they contain real OAuth
client IDs. See `.github/SETUP.md` for how to obtain them.

---

## 3. Where things live

```
entrypoints/
  background.ts         service worker — routes OPEN_OPTIONS, retries Drive sync
  content.ts            injected on *://*/* — routes autofill messages
  popup/                action popup (React) — Fill / Undo / status / debug panel
  options/              full profile editor (React, 9 sections + Settings)

src/
  types/profile.ts      canonical Profile type — source of truth for the data model
  autofill/
    index.ts            orchestrator: scanAutofill(), executeAutofill(), undoAutofill()
    mapper.ts           4-layer field matching pipeline
    resolver.ts         dot-notation resolver + virtual paths
    picker.ts           fixed-position DOM overlay (no React, inline styles only)
    filler.ts           type-aware fill for native + ARIA + React-Select fields
    scanner.ts          scanFields() + scanAriaFields()
    signals.ts          extractSignals() + bestLabel()
    constants.ts        named confidence thresholds — always use these, never bare numbers
  resume-ai/
    gemini.ts           extractFromResume() + resolveFieldsWithAI()
  utils/
    storage.ts          chrome.storage.local wrappers
    driveSync.ts        Google Drive backup via drive.appdata scope
    derivedFields.ts    computes fullName, currentTitle, totalExperience, age
    profileCompletion.ts completion % + PATH_FOCUS_TARGETS for Go-to-Profile deep links
    migrate.ts          normalizeProfile() — on-load migrations, called by storage wrappers
  components/
    options/            section components (PersonalSection, WorkHistorySection, etc.)
    options/shared/     SearchableCountryDropdown, SearchableCurrencySelect, saveSection.ts
    ui/                 Toast.tsx + useToast.ts

docs/                   GitHub Pages landing site (no build step, served as-is)
demo-apply-form/        static HTML form for manual autofill testing
.github/
  SETUP.md              one-time setup guide for Google Cloud + GitHub secrets
  workflows/            CI (test + lint) and Release (CWS upload) pipelines
```

**Data model at a glance:**

The `Profile` type in `src/types/profile.ts` has 10 top-level keys:
`personal`, `address`, `professional`, `salary`, `workAuthorization`,
`workHistory`, `education`, `languages`, `links`, `documents`, plus a `derived`
key that is always computed -- never written directly by section components.

**How autofill flows:**

```
Popup click
  -> content.ts: AUTOFILL_SCAN
       -> scanner.ts: collect DOM elements
       -> mapper.ts: classify each field (4-layer pipeline)
       -> store as pendingMatches
  -> content.ts: AUTOFILL_FILL
       -> filler.ts: write values to DOM
       -> picker.ts: attach overlay listeners
       -> ai.ts: resolve remaining fields via Gemini (optional)
```

The two phases are intentionally separate -- scan maps fields without touching
the DOM, fill executes. Never re-run scan between the two phases.

---

## 4. How we work here

**Solo mode** -- commits go directly to `main`, no feature branches or PRs
required.

**Commit style:** Conventional Commits are required.

```
type(scope): description

feat      new feature
fix       bug fix
refactor  code change, no feature or fix
test      tests only
docs      documentation only
chore     maintenance, dependencies, tooling
```

Examples:
```
feat(autofill): add ARIA combobox support
fix(picker): correct highlight index on dropdown open
chore(manifest): add activeTab permission
```

**Before every commit:**
```bash
pnpm compile    # must pass — CI enforces type-check
pnpm test:run   # must pass
```

**To ship a release:** use the `/ship` command in Claude Code. It runs tests,
proposes a semver bump from commit history, asks for confirmation, bumps
`package.json`, tags, and pushes. Pushing a `v*.*.*` tag triggers the Release
workflow which uploads to the Chrome Web Store.

**Tag annotation controls CWS submission:**
- `"release"` -- uploads and submits for review immediately
- `"release:draft"` -- uploads as draft only, submit manually from CWS dashboard

There is no CLI rollback. Unpublishing requires the CWS dashboard.

**Actions that always require explicit confirmation:**
- `git push` and tag creation
- Any `v*.*.*` tag (triggers a live CWS upload)
- Destructive storage operations (reset all, clear learned mappings)

**Never do:**
- Commit `.env.development` or `.env.production`
- Read or print values from those files
- Push a `v*.*.*` tag without deliberate intent -- it uploads to the store

---

## 5. Gotchas

**`pnpm dev` opens Chromium, not your regular Chrome.** The Chromium dev
instance cannot complete Google OAuth flows (the `launchWebAuthFlow` call is
blocked). To test Drive backup, load the dev build unpacked in your normal
Chrome browser instead. See `.github/SETUP.md` section 3f.

**Schema fan-out.** Adding or renaming a field on `Profile` requires changes in
four places: `src/types/profile.ts`, `src/resume-ai/prompt.ts`,
`src/resume-ai/parser.ts` (FIELD_DEFS), and `src/utils/profileValidator.ts`.
Missing any one causes silent drift between resume import, profile import, and
the diff/review UI.

**`chrome.storage.session` is not writable from content scripts** without
host permissions for the page URL. The extension only has host permissions for
googleapis.com endpoints. Any cross-context messaging from the content script
to the options page must go through the background service worker, which has
unrestricted session storage access.

**Work history dates vs education dates are not the same format.** Work history
requires `YYYY-MM`; education accepts `YYYY` or `YYYY-MM`. The validator uses
separate regexes for each -- do not unify them.

**`MonthYearPicker` fires `onChange('')` during partial entry.** Do not treat
this as a validation error on every keystroke -- only enforce required fields
at save time.

**Learned mappings have a two-confirmation trust threshold.** A new mapping
written as `{ path, count: 1 }` is not applied until the same signal confirms
the same path a second time (count reaches 2). Legacy plain-string mappings
written by older versions are trusted immediately. Do not bypass
`saveLearnedMapping()` in `src/utils/storage.ts`.

**The reset sequence in `options/App.tsx` is timing-sensitive.** `sectionSeq`
and `activeSection` are bumped inside the `handleImportComplete(afterLoad)`
callback, not synchronously after the reset call. Doing it synchronously
remounts sections with the stale profile because `setProfile` lives inside the
async `.then()`.

**ESLint is pinned to v9.x.** `eslint-plugin-react@7.x` calls
`context.getFilename()` which was removed in ESLint v10. Do not upgrade ESLint
until the plugin ships a compatible version.
