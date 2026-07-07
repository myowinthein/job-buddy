# Job Buddy

## 1. Project Identity

Chrome MV3 browser extension (WXT framework) that auto-fills job application forms from a saved user profile. Aimed at multi-country job seekers. Single user, no server, no database — everything lives in `chrome.storage.local`. The only production surface is the Chrome Web Store.

**Stack:** WXT 0.20.26 · React 19 · TypeScript 5.9 · Tailwind CSS v4 (`@tailwindcss/postcss`, not v3 config) · pnpm 11.7.0 · Node 22 (pinned via `.nvmrc`)

**Blast radius:** Pushing a `v*.*.*` tag triggers `release.yml`. The tag's annotation message controls CWS submission: `"release"` submits for review immediately, `"release:draft"` uploads as a draft only. There is no rollback CLI; unpublishing requires the CWS dashboard.

---

## 2. Project Config

- `git-solo: true` — commit directly to `main`, no feature branches, no PRs. See `.claude/rules/git.md`.
- `git-auto-commit: true` — commit automatically after each task without prompting; push still requires confirmation.

---

## 3. Dev Commands

```bash
pnpm dev           # dev build → .output/chrome-mv3-dev/ (load unpacked in Chrome)
pnpm build         # production build
pnpm zip           # production build + zip for CWS upload
pnpm compile       # TypeScript type-check (no emit) — required before commit
pnpm lint          # ESLint
pnpm format        # Prettier
pnpm test          # Vitest watch mode
pnpm test:run      # single run — run before committing
pnpm serve:landing # serve docs/ (GitHub Pages site) at localhost:3000
pnpm serve:demo    # serve demo-apply-form/ at localhost:8000
```

---

## 4. Architecture Pointers

**Entrypoints** (`entrypoints/`):
- `background.ts` — service worker; writes `jb:focusOnLoad` to `chrome.storage.session` and calls `openOptionsPage()` when picker sends `OPEN_OPTIONS`; retries pending Drive sync on browser startup
- `content.ts` — matches `*://*/*`; routes `AUTOFILL_SCAN/FILL/CLEAR/GET_STATUS/GET_DEBUG_SESSION` to `src/autofill/`
- `popup/` — action popup; React state lost on close, restored from `GET_STATUS` on mount. Debug panel hidden until Shift+click the logo post-fill.
- `options/` — full-page profile editor (9 sections + Resume Import + Settings)

**Key source files:**
- `src/types/profile.ts` — canonical `Profile` type; 10 top-level keys including `derived`
- `src/utils/storage.ts` — `chrome.storage.local` wrappers; reads always resolve, writes reject on quota
- `src/autofill/index.ts` — orchestrator: `scanAutofill()`, `executeAutofill()`, `undoAutofill()`
- `src/autofill/mapper.ts` — 4-layer match: learned (0.97, requires 2 confirmations) → autocomplete (0.95) → dict exact (0.85) → fuzzy (score × 0.85 / 0.75 by tier) → context (0.70). Signal priority is `[label, ariaLabel, placeholder, name, id]` — label first.
- `src/autofill/resolver.ts` — dot-notation resolver + virtual paths (`phone.full`, `address.countryName`, `salary.*.formatted`, etc.)
- `src/autofill/picker.ts` — fixed-position DOM overlay; no React, inline styles only (avoids host-page CSS conflicts). Cannot write to `chrome.storage.session` directly — routes `OPEN_OPTIONS` + `focusPath` through the background service worker instead.
- `src/resume-ai/gemini.ts` — `extractFromResume()` + `resolveFieldsWithAI()` via Gemini API
- `src/utils/driveSync.ts` — Google Drive backup via `drive.appdata` scope; implicit OAuth token flow
- `src/utils/derivedFields.ts` — computes `fullName`, `currentTitle`, `currentCompany`, `totalExperience`, `age`
- `src/utils/profileCompletion.ts` — `TOTAL_CHECKS = 15`; drives sidebar checkmarks and completion %
- `src/autofill/constants.ts` — named confidence thresholds. Always use these, never bare numbers.
- `src/autofill/mappings.ts` — `saveElementMappings()`; call this when saving learned mappings from an element's signals — do not re-inline the loop
- `src/autofill/scanner.ts` — `scanFields()` (native inputs) + `scanAriaFields()` (ARIA comboboxes, contenteditable). Both run during `scanAutofill()`.
- `src/autofill/signals.ts` — `extractSignals()` + `bestLabel(signals)` helper (`label || ariaLabel || placeholder || name`). Use `bestLabel`, don't re-inline.
- `src/autofill/filler.ts` — type-aware fill: native, ARIA listbox, React-Select, contenteditable, date reformat (ISO → MM/DD/YYYY or DD/MM/YYYY from placeholder hint)
- `src/components/options/shared/saveSection.ts` — every section's save flow goes through this. Error string lives only here.
- `src/utils/migrate.ts` — `normalizeProfile()` defaults missing salary period to `'monthly'`; called by both `getProfile()` and `saveProfile()`. New on-load migrations belong here.
- `src/resume-ai/normalize.ts` — `normalizeBullets()` + `normalizeSummaryLineWraps()`. Bullet pass fires only when bullet structure is detected — preserves plain context paragraphs.
- `src/resume-ai/extractLinks.ts` — pulls hyperlinks from PDF annotation layer via `pdfjs-dist`; returns `[]` for non-PDF and on any error.
- `src/utils/theme.ts` — `ThemePreference` (`system | light | dark`); sets `.dark` on `document.documentElement`.

**Site (`docs/`):**
- `docs/index.html` — GitHub Pages landing page (no build step; Tailwind via CDN)
- `docs/project-site/` — project overview mini-site
- `docs/privacy/`, `docs/terms/`, `docs/eula/`, `docs/disclaimer/` — legal pages as standalone HTML; regenerate with `/legal`

---

## 5. Behavior Rules

**Autofill confidence tiers:** ≥0.85 → green (fill, no picker) · 0.60–0.84 → yellow (fill + picker) · <0.60 → red (no fill + picker) · ≥0.60 but profile value empty → gray/noData (no highlight, picker shows "Go to Profile" CTA). AI-resolved fields that reach ≥0.85 are treated as green and do not show the picker.

**Two-phase fill:** `AUTOFILL_SCAN` maps fields into `pendingMatches` (no fill). `AUTOFILL_FILL { mode }` executes — merge skips pre-filled fields, overwrite replaces all. Never re-run scan between the two phases.

**Derived fields contract:** Every `handleSave` in `options/App.tsx` does two writes — raw profile first, then profile + `calculateDerivedFields()`. Second write is try/catch so a derivation bug never blocks the user's save. Section components must never write `profile.derived` directly.

**Storage privacy boundary:** `geminiApiKey`, `geminiModel`, `driveToken`, `driveBackupState` are never included in profile export bundles. Exports wrap only `{ profile, learnedMappings, applicationHistory }`.

**AI is purely additive:** The extension works fully without a Gemini key. AI autofill runs after the rule pipeline; all failures must be silent — never surface network errors from the AI layer.

**Toast system:** `useToast()` from `src/components/ui/Toast.tsx`. Never add inline "✓ Saved" labels to section components.

**Profile schema fan-out:** Any field added or renamed on `Profile` must be reflected in four places: `src/types/profile.ts`, `src/resume-ai/prompt.ts` schema, `src/resume-ai/parser.ts` FIELD_DEFS, and `src/utils/profileValidator.ts`.

**Profile date formats are NOT unified:** work history dates require month (`YYYY-MM`); education dates accept either `YYYY` or `YYYY-MM`. Keep the validator regexes separate.

**Learned mapping confidence:** `LearnedMappings` values are `string | { path: string; count: number }`. New mappings start at `count: 1` and are not promoted to Layer 0 until count reaches 2. `saveLearnedMapping()` in `src/utils/storage.ts` is the source of truth.

**Drive backup payload fan-out:** Adding a field to `DriveBackupFile` requires updating both `syncProfileToDrive()` (upload) and two restore paths in `SettingsSection` — `handleRestoreFromDrive` and `handleDriveReviewSave`.

---

## 6. Hard Safety Rules

- **Never push a `v*.*.*` tag without explicit user instruction.** Tag annotation `"release"` submits to CWS immediately; `"release:draft"` uploads as a draft. No CLI rollback either way.
- **Never read or print `.env.development` / `.env.production`** — they contain real OAuth client IDs.
- **ESLint must stay on v9.x.** `eslint-plugin-react@7.x` calls `context.getFilename()` removed in ESLint v10.
- **Always run `pnpm compile` before committing.** CI enforces type-check; failing commits are noisy on main.

---

## 7. Known Traps

- **`MonthYearPicker` emits `onChange('')` during partial entry.** Enforce required-field validation at save time only, not on each keystroke.

- **Backward-compat profile loaders:** Phone (string → `PhoneNumber`), work location (string → `{ countryCode?, city? }`), work auth country (free-text → ISO alpha-2), expected salary rows (currency-only → country+currency). Loaders live in section components.

- **`documents.cv` URL and file can coexist.** Both fields are intentionally preserved. `DocumentsSection.toDocumentEntry()` must never make them mutually exclusive.

- **Reset sequencing in `entrypoints/options/App.tsx` is timing-sensitive.** `sectionSeq` and `activeSection` are bumped inside the `handleImportComplete(afterLoad)` callback, not synchronously after the reset call.

- **Work auth status labels: single source of truth.** `src/data/workAuthorization.ts` exports `WORK_AUTH_STATUS_OPTIONS` and `WORK_AUTH_STATUS_LABELS`. Never inline these strings elsewhere.

- **`chrome.storage.local` 5 MB limit.** CV files stored as base64, capped at 4 MB in UI. Do not raise the cap without budgeting the rest of the profile.

- **Drive OAuth uses implicit grant via `chrome.identity.launchWebAuthFlow`.** Google Cloud app type must be "Web Application" (not "Chrome Extension"). Needs separate client IDs for dev and prod.

- **Mapper signal priority is label-first** (`[label, ariaLabel, placeholder, name, id]`). The order is deliberate — tests in `mapper.test.ts` enforce it. Don't reorder.

- **`autocomplete="url"` is intentionally absent** from `AUTOCOMPLETE_MAP`. It was previously hardwired to `links.linkedin` and overrode portfolio matches via Layer 1. Don't re-add it.

- **Date filler reads the placeholder.** `reformatDateForInput()` in `src/autofill/filler.ts` parses `input.placeholder` for `mm/dd/yyyy` / `dd/mm/yyyy` and reformats ISO output before writing. Changing what the resolver outputs for date paths breaks this contract.

- **Content scripts cannot write to `chrome.storage.session`.** The picker routes `OPEN_OPTIONS` + `focusPath` through the background service worker, which has unrestricted session storage access. Don't bypass this routing.

<!-- last-reviewed: 300b0ce64e76d7f1240a8e502a1c4bd814dcc1b6 -->
