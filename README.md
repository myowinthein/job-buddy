# Job Buddy

[![CI](https://github.com/myowinthein/job-buddy/actions/workflows/ci.yml/badge.svg)](https://github.com/myowinthein/job-buddy/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.8.8-informational.svg)](package.json)

> Chrome extension that autofills job application forms from a profile you set up once.

Job Buddy reads the fields on a job application page, matches them against a structured profile you maintain in the extension, and fills in everything it can with confidence indicators on each field. It is local-first: your profile stays in `chrome.storage.local`, with three optional features that talk to Google's APIs (Cloud Backup, AI Resume Import, AI Autofill assist) only if you turn them on.

## Table of Contents

- [Background](#background)
- [Install](#install)
- [Usage](#usage)
- [AI Features](#ai-features)
- [Google Drive Backup](#google-drive-backup)
- [Development](#development)
- [Architecture](#architecture)
- [Contributing](#contributing)
- [License](#license)

## Background

Job seekers, especially those applying across multiple countries, type the same name, email, phone, work history, and salary expectations into dozens of slightly-different forms. Each Applicant Tracking System (Workday, Greenhouse, Lever, and various in-house custom forms) has its own field naming, layout, and quirks.

Job Buddy is built around three ideas:

1. **One canonical profile.** A nine-section editor (Personal, Address, Salary, Work Authorization, Work History, Education, Languages, Links, Documents) captures everything a typical application asks for, including per-country salary expectations, per-country work authorization, structured phone numbers, and multi-language proficiency.
2. **Rule-based autofill with a confidence model.** A four-layer mapping pipeline (learned mappings → HTML autocomplete → dictionary → fuzzy match) classifies every field as high-confidence fill (green), needs review (yellow), low-confidence (red), or no profile data available (gray).
3. **Local-first by default.** Nothing leaves your device unless you explicitly enable Cloud Backup or paste in a Gemini API key for the AI features.

## Install

### From the Chrome Web Store

The released build is published on the Chrome Web Store as **Job Buddy - Autofill Job Applications**.

### From source (development build)

```bash
git clone https://github.com/myowinthein/job-buddy.git
cd job-buddy
pnpm install      # uses Node 22, pinned in .nvmrc
pnpm dev          # development build with hot reload → .output/chrome-mv3-dev/
```

Then in Chrome:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select `.output/chrome-mv3-dev/`.

For a production build, use `pnpm build` (output: `.output/chrome-mv3/`) or `pnpm zip` to produce the Chrome Web Store zip.

## Usage

1. **Set up your profile.** Open the extension's options page (right-click the toolbar icon → Options, or click the icon and pick the link) and fill in the nine sections.
2. **Visit a job application page.**
3. **Click the Job Buddy icon and press *Fill Form ✨*.** Job Buddy scans the page, matches each form field against your profile, and fills what it can. Filled fields get a colored tint:
   - **Green** — high confidence, profile value was available.
   - **Yellow** — medium confidence; click the field to pick a different profile value from a searchable overlay.
   - **Red** — low confidence; the same overlay lets you assign the right value.
   - **Gray** — no profile data for this field; the overlay surfaces a quick link to the relevant profile section.
4. **Review every field before submitting.** Job Buddy never submits a form on your behalf.
5. **Undo if needed.** The popup has an Undo Auto-fill button that clears every value Job Buddy wrote in that session.

Manually correcting a field via the overlay teaches Job Buddy that mapping for that domain. The first confirmation is recorded but not yet trusted; once the same signal → profile path is confirmed twice on that domain, it is promoted and future fills on the same site use it directly at high confidence. This two-step trust prevents one accidental click from permanently mis-mapping a field.

If your profile is updated in another tab while a job application tab is open, Job Buddy silently fills any previously-empty fields the next time you focus that tab. No other fields are touched.

## AI Features

Two optional features use Google's Gemini API. Both are off until you paste a Gemini API key into **Settings → AI Features**. Obtain a key from [Google AI Studio](https://aistudio.google.com/api-keys); Job Buddy stores it only in `chrome.storage.local` and sends requests directly from your browser to Google's API.

- **AI Resume Import.** Upload a PDF or DOCX résumé. The file is sent to Gemini as base64 inline data, and extracted fields are shown in a review flow where you accept or reject each suggestion before anything is saved to your profile. For PDFs, hyperlinks are extracted from the document's annotation layer and provided to Gemini directly so that LinkedIn and portfolio URLs come through verbatim instead of being inferred. Education dates are only kept when they are explicitly present in the résumé, never inferred from graduation conventions, work-history dates, or the candidate's age. Work-history descriptions are normalised into an intro paragraph followed by a bullet list when the source has any bullet structure.
- **AI Autofill assist.** Runs after the rule-based autofill. Text fields the rule pipeline could not resolve, plus radio and checkbox groups, are sent to Gemini along with your profile JSON for matching. Consent checkboxes are filtered out before any request is made.

Both features fail silently. Autofill never blocks on the network, and clearing the API key in Settings stops all AI requests immediately.

## Google Drive Backup

An opt-in feature in **Settings → Cloud Backup** that syncs your profile to your own Google Drive.

- Uses the `https://www.googleapis.com/auth/drive.appdata` scope. Job Buddy can read and write only its own hidden application-data folder, never the rest of your Drive.
- Stored as a single JSON file (`job-buddy-profile.json`). If you have uploaded a CV under Documents, the encoded file is included. Learned per-domain field mappings are also included, so restoring a backup on a new machine carries over the autofill behaviour you have taught the extension on each site.
- Local-first: `chrome.storage.local` remains the source of truth. Sync fires fire-and-forget on every profile save and never blocks the local write.
- Connect-time conflict resolution: if Drive already has a backup and your local profile is non-empty, you get a review screen to merge or replace.
- Disconnect lets you keep or delete the Drive backup file.

## Development

Prerequisites: Node 22 (pinned in `.nvmrc`) and pnpm 11.

```bash
pnpm install            # install dependencies (runs wxt prepare via postinstall)
pnpm dev                # Chrome dev build with hot reload
pnpm dev:firefox        # Firefox dev build
pnpm build              # production Chrome build → .output/chrome-mv3/
pnpm build:firefox      # production Firefox build
pnpm zip                # Chrome production zip
pnpm compile            # tsc --noEmit (type-check only)
pnpm lint               # ESLint
pnpm format             # Prettier
pnpm test               # Vitest watch mode
pnpm test:run           # single run
pnpm serve:landing      # serve the docs/ landing site at localhost:3000
pnpm serve:demo         # serve the demo-apply-form/ test page at localhost:8000
```

`pnpm serve:demo` is the recommended way to test autofill locally without visiting a real job board: it serves a static application form you can hit `Fill Form` against.

The landing page and legal documents live under `docs/`, served by GitHub Pages. Run `pnpm serve:landing` to preview the site locally.

CI runs `pnpm compile`, `pnpm lint`, and `pnpm build` on every push and pull request. See [`.github/SETUP.md`](.github/SETUP.md) for the one-time Chrome Web Store secret setup.

### Releases

Pushing a `v*.*.*` tag triggers the release workflow. The tag's annotation message controls how the build reaches the Chrome Web Store:

- `git tag -a vX.Y.Z -m "release"` uploads the build and submits for review immediately.
- `git tag -a vX.Y.Z -m "release:draft"` uploads as a draft only; submit manually from the CWS dashboard. Use this when the next version needs a store-listing or screenshot update first.

## Architecture

```
entrypoints/
  background.ts     MV3 service worker — OPEN_OPTIONS handler, deferred Drive sync
  content.ts        Content script (*://*/*) — autofill message routing
  popup/            Browser-action popup — Fill Form, result summary, undo
  options/          Full-page UI — 9 profile sections + Import Resume + Settings

src/
  autofill/         Scanner (native + ARIA combobox/textbox/contenteditable),
                    signal extractor, 4-layer mapper, filler (incl. React-Select
                    autocomplete + click-to-open dropdowns + date placeholder
                    reformat), highlighter, picker overlay, AI assist, debug
  components/       React components per profile section, shared dialogs, Toast
  data/             ISO country/currency/language lists, work-authorization labels
  resume-ai/        Gemini client, prompt builder, diff engine (shared with Drive restore)
  types/            Profile, storage, derived-fields type definitions
  utils/            chrome.storage wrappers, completion scoring, derived fields,
                    profile validator, theme, Google Drive sync

docs/               GitHub Pages site — landing page + privacy/terms/eula/disclaimer
demo-apply-form/    Static test form for local autofill testing
```

**Stack:** WXT 0.20 · React 19 · TypeScript 5.9 · Tailwind CSS v4 · pnpm 11 · ESLint v9 flat config

`profile` in `chrome.storage.local` is the canonical user data. `profile.derived` (full name, current title and company, total experience, age) is recomputed on every save and is never edited directly by the UI. See `CLAUDE.md` for development context and operational rules.

## Contributing

Issues and pull requests welcome at [github.com/myowinthein/job-buddy/issues](https://github.com/myowinthein/job-buddy/issues).

Before submitting a PR:
- Run `pnpm compile` and `pnpm lint`. CI enforces both.
- Do not include OAuth client IDs or API keys in commits. `.env.development` and `.env.production` are gitignored; use `.env.example` as the template.

## License

[MIT](LICENSE) © 2026 Myo Win Thein

<!-- last-reviewed: 60fd099 -->
