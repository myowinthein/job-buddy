# Job Buddy

[![CI](https://github.com/myowinthein/job-buddy/actions/workflows/ci.yml/badge.svg)](https://github.com/myowinthein/job-buddy/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.8.4-informational.svg)](package.json)

> Chrome extension that autofills job application forms from a profile you set up once.

Job Buddy reads the fields on a job application page, matches them against a structured profile you maintain in the extension, and fills in everything it can with confidence indicators on each field. It is local-first — your profile stays in `chrome.storage.local` — with three optional features that talk to Google's APIs (Cloud Backup, AI Resume Import, AI Autofill assist) only if you turn them on.

## Table of Contents

- [Background](#background)
- [Install](#install)
- [Usage](#usage)
- [AI Features](#ai-features)
- [Google Drive Backup](#google-drive-backup)
- [Development](#development)
- [Architecture](#architecture)
- [Maintainer](#maintainer)
- [Contributing](#contributing)
- [License](#license)

## Background

Job seekers — especially those applying across multiple countries — type the same name, email, phone, work history, and salary expectations into dozens of slightly-different forms. Each Applicant Tracking System (Workday, Greenhouse, Lever, Fabric, in-house custom forms) has its own field naming, layout, and quirks.

Job Buddy is built around three ideas:

1. **One canonical profile.** A nine-section editor (Personal, Address, Salary, Work Authorization, Work History, Education, Languages, Links, Documents) captures everything a typical application asks for, including per-country salary expectations, per-country work authorization, structured phone numbers, and multi-language proficiency.
2. **Rule-based autofill with a confidence model.** A four-layer mapping pipeline (learned mappings → HTML autocomplete → dictionary → fuzzy match) classifies every field as high-confidence fill (green), needs review (yellow), low-confidence (red), or no profile data available (gray).
3. **Local-first by default.** Nothing leaves your device unless you explicitly enable Cloud Backup or paste in a Gemini API key for the AI features.

## Install

### From the Chrome Web Store

The released build is published on the Chrome Web Store as **Job Buddy - Job Application Autofill**.

> Replace this link with your real CWS URL once the listing is live.

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

1. **Set up your profile.** Open the extension's options page (right-click the toolbar icon → Options, or click the icon and pick the link) and fill in the nine sections. Mandatory fields are flagged with red asterisks; optional fields are clearly marked.
2. **Visit a job application page.**
3. **Click the Job Buddy icon and press *Fill Form ✨*.** Job Buddy scans the page, matches each form field against your profile, and fills what it can. Filled fields get a colored tint:
   - **Green** — high confidence, profile value was available.
   - **Yellow** — medium confidence; click the field to pick a different profile value from a searchable overlay.
   - **Red** — low confidence; same overlay lets you assign the right value.
   - **Gray** — no profile data for this field; the overlay surfaces a quick link to the relevant profile section.
4. **Review every field before submitting.** The autofill is a convenience tool, not a substitute for checking the form. Job Buddy never submits a form on your behalf.
5. **Undo if needed.** The popup has an Undo Auto-fill button that clears every value Job Buddy wrote in that session.

Manually correcting a field once via the overlay teaches Job Buddy that mapping for that domain — future fills on the same site use it directly (`Learned` layer, confidence 0.97).

If your profile is updated in another tab while a job application tab is open, Job Buddy silently fills any previously-empty fields the next time you focus that tab — no other fields are touched.

## AI Features

Two optional features use Google's Gemini API. Both are off until you paste a Gemini API key into **Settings → AI Features**. You obtain the key yourself from [Google AI Studio](https://aistudio.google.com/api-keys); Job Buddy stores it only in `chrome.storage.local` and sends requests directly from your browser to Google's API using your key.

- **AI Resume Import.** Upload a PDF or DOCX résumé. The file is sent to Gemini as base64 inline data, and the extracted fields are shown in a Summary → Review flow where you accept or reject each suggestion. The file itself is saved to your profile (under Documents) only if you accept the "Resume File" entry in the review screen.
- **AI Autofill assist.** Runs after the rule-based autofill. Any text fields the rule pipeline couldn't resolve, plus radio and checkbox groups (which the rule pipeline doesn't touch), are sent to Gemini along with your profile JSON for matching. Consent checkboxes are filtered out before any request is sent.

Both features are silent on failure — autofill never blocks on the network. Clearing the API key in Settings stops all future AI requests immediately.

See [PRIVACY.md](PRIVACY.md) for a detailed breakdown of what's sent to Gemini and when.

## Google Drive Backup

An opt-in feature in **Settings → Cloud Backup** that syncs your profile to your own Google Drive so you can restore it on another browser or after reinstalling.

- Uses Google's standard OAuth flow with the narrow `https://www.googleapis.com/auth/drive.appdata` scope — Job Buddy can read and write only its own hidden application-data folder, never the rest of your Drive.
- Stored as a single JSON file (`job-buddy-profile.json`) wrapped as `{ lastModified, profile }`. If you've uploaded a CV in Documents, the encoded file is included.
- Local-first: `chrome.storage.local` remains the source of truth. Sync fires fire-and-forget on every profile save and after every profile import; it never blocks the local write.
- Connect-time conflict resolution: if Drive already has a backup and your local profile is non-empty, you get a Summary → Review screen to merge or replace.
- Disconnect lets you keep or delete the Drive backup file.

See [PRIVACY.md](PRIVACY.md) for the data flow and OAuth scope details.

## Development

Prerequisites: Node 22 (pinned in `.nvmrc`) and pnpm 11.

```bash
pnpm install            # install dependencies (runs wxt prepare via postinstall)
pnpm dev                # Chrome dev build with hot reload
pnpm dev:firefox        # Firefox dev build with hot reload
pnpm build              # production Chrome build → .output/chrome-mv3/
pnpm build:firefox      # production Firefox build
pnpm zip                # Chrome production zip → .output/job-buddy-<version>-chrome.zip
pnpm compile            # tsc --noEmit (type-check only)
pnpm lint               # ESLint
pnpm format             # Prettier
pnpm release            # interactive version bump + tag + push (triggers release workflow)
```

CI runs `pnpm compile`, `pnpm lint`, and `pnpm build` on every push and pull request (see `.github/workflows/ci.yml`). Pushing a `v*.*.*` tag triggers the release workflow, which builds the zip, uploads it to the Chrome Web Store with `--auto-publish`, and creates a GitHub Release. See [`.github/SETUP.md`](.github/SETUP.md) for the one-time Chrome Web Store secret setup.

## Architecture

```
entrypoints/
  background.ts          MV3 service worker — OPEN_OPTIONS handler,
                         retries deferred Drive sync on browser startup
  content.ts             Content script (matches *://*/*) — receives runtime
                         messages (AUTOFILL_SCAN, AUTOFILL_FILL, CLEAR,
                         GET_STATUS, GET_DEBUG_SESSION), delegates to src/autofill
  popup/                 Browser-action popup — Fill Form button, result
                         summary, undo, AI key nudge, debug panel
  options/               Full-page UI — 9 profile sections + Import Resume
                         + Settings (AI key, Cloud Backup, Export/Import, Reset)

src/
  autofill/              Field scanner, signal extractor, mapper (4 layers),
                         filler with native setter, highlighter, picker overlay,
                         debug session, AI assist layer
  components/options/    React components per profile section + Sidebar +
                         CompletionBanner + Settings + ResumeImport
  components/shared/     ImportSummaryDialog + ImportReviewScreen (used by
                         Resume Import, Import Profile, and Drive conflict)
  components/ui/         Toast
  data/                  ISO country list, currency list, language list,
                         work-authorization status labels
  resume-ai/             Gemini client (gemini.ts), prompt builder, FIELD_DEFS
                         + generateDiff + applyChanges (shared diff engine)
  types/                 Profile, storage, derived-fields type definitions
  utils/                 chrome.storage wrappers, profile completion scoring,
                         derived fields, profile import validator,
                         theme storage/apply, Google Drive sync
```

The extension is built with **WXT 0.20** (Manifest V3, React module), **React 19**, **TypeScript 5.9**, **Tailwind CSS v4**, and **pnpm 11**. ESLint v9 with `eslint-plugin-react@7` flat config (see `eslint.config.js`).

`profile` is the canonical user data, stored in `chrome.storage.local`. `profile.derived` (full name, current title/company, total experience, age) is recomputed on every section save and is never edited directly by the UI.

The four-layer autofill mapping pipeline is documented in detail in `CLAUDE.md` — the same file also documents the picker overlay, AI layer, Drive sync, theme system, and the operational safety boundaries that apply when working on the codebase.

## Maintainer

[@myowinthein](https://github.com/myowinthein)

## Contributing

Issues and pull requests welcome at [github.com/myowinthein/job-buddy/issues](https://github.com/myowinthein/job-buddy/issues).

Before submitting a PR, please:

- Run `pnpm compile` and `pnpm lint` (CI runs both).
- Keep commits focused; the project convention is to commit infrastructure and UI changes in separate logical commits where possible.
- Don't include real OAuth client IDs or API keys in commits — `.env.development` / `.env.production` are gitignored; use `.env.example` as the template.

If you support the work, [Ko-fi](https://ko-fi.com/myowinthein) tips are appreciated.

## License

[MIT](LICENSE) © 2026 Myo Win Thein
