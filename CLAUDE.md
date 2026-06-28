# Job Buddy

## 1. Project Identity

Chrome MV3 browser extension (WXT framework) that auto-fills job application forms from a saved user profile. Aimed at multi-country job seekers. Single user, no server, no database — everything lives in `chrome.storage.local`. The only production surface is the Chrome Web Store.

**Stack:** WXT 0.20.26 · React 19 · TypeScript 5.9 · Tailwind CSS v4 (`@tailwindcss/postcss`, not v3 config) · pnpm 11.7.0 · Node 22 (pinned via `.nvmrc`)

**Blast radius:** Pushing a `v*.*.*` tag to `origin` triggers auto-publish to the Chrome Web Store. There is no rollback CLI — only manual unpublish from the CWS dashboard.

**Git mode:** `git-solo: true` — commits go directly to main; no feature branches or PRs required.

---

## 2. Dev Commands

```bash
pnpm dev          # dev build → .output/chrome-mv3-dev/ (load unpacked in Chrome)
pnpm build        # production build
pnpm zip          # production build + zip for CWS upload
pnpm compile      # TypeScript type-check (no emit) — required before commit
pnpm lint         # ESLint
pnpm format       # Prettier
pnpm test         # Vitest watch mode
pnpm test:run     # single run — run before committing
```

---

## 3. Architecture Pointers

**Entrypoints** (`entrypoints/`):
- `background.ts` — service worker; routes `OPEN_OPTIONS` from content script, retries pending Drive sync on browser startup
- `content.ts` — matches `*://*/*`; routes `AUTOFILL_SCAN/FILL/CLEAR/GET_STATUS/GET_DEBUG_SESSION` to `src/autofill/`
- `popup/` — action popup; React state lost on close, restored from `GET_STATUS` on mount. Debug panel hidden until Shift+click the logo post-fill.
- `options/` — full-page profile editor (9 sections + Resume Import + Settings)

**Key source files:**
- `src/types/profile.ts` — canonical `Profile` type; 10 top-level keys including `derived`
- `src/utils/storage.ts` — `chrome.storage.local` wrappers; reads always resolve, writes reject on quota
- `src/autofill/index.ts` — orchestrator: `scanAutofill()`, `executeAutofill()`, `undoAutofill()`
- `src/autofill/mapper.ts` — 4-layer match: learned (0.97) → autocomplete (0.95) → dict exact (0.85) → fuzzy → context (0.70)
- `src/autofill/resolver.ts` — dot-notation resolver + virtual paths (phone.full, address.countryName, salary.*.formatted, etc.)
- `src/autofill/picker.ts` — fixed-position DOM overlay; no React, inline styles only (avoids host-page CSS conflicts)
- `src/resume-ai/gemini.ts` — `extractFromResume()` + `resolveFieldsWithAI()` via Gemini API
- `src/utils/driveSync.ts` — Google Drive backup via `drive.appdata` scope; implicit OAuth token flow
- `src/utils/derivedFields.ts` — computes `fullName`, `currentTitle`, `currentCompany`, `totalExperience`, `age`
- `src/utils/profileCompletion.ts` — `TOTAL_CHECKS = 15`; drives sidebar checkmarks and completion %
- `src/autofill/constants.ts` — named confidence thresholds (`CONF_FILL`, `CONF_GREEN`, `CONF_CONFIRMED`, `CONF_AI_YELLOW`); always use these, never bare numbers
- `src/autofill/mappings.ts` — `saveElementMappings()`; call this when saving learned mappings from an element's signals — do not re-inline the loop
- `src/utils/migrate.ts` — `normalizeProfile()` defaults missing salary period to `'monthly'`; called by both `getProfile()` and `saveProfile()` so every storage round-trip is hermetic. New on-load migrations belong here.
- `src/resume-ai/normalize.ts` — `normalizeBullets()` / `normalizeExtractedProfile()`; bullet-normalises workHistory descriptions ONLY when structure is detected (existing bullet marker OR blank-line separator). Plain prose without either signal is returned unchanged — intentional, to preserve the context paragraph.
- `src/resume-ai/extractLinks.ts` — pulls hyperlinks from PDF annotation layer via `pdfjs-dist`; returns `[]` for non-PDF files and on any error. Result is passed into `extractFromResume()` so Gemini sees the real URLs.

---

## 4. Behavior Rules

**Autofill confidence thresholds:** ≥0.85 → green (fill, no picker) · 0.60–0.84 → yellow (fill + picker) · <0.60 → red (no fill + picker) · ≥0.60 but profile value empty → gray/noData (no highlight, picker shows "Go to Profile" CTA). Thresholds are defined as named constants in `src/autofill/constants.ts`.

**Two-phase fill:** `AUTOFILL_SCAN` maps fields into `pendingMatches` (no fill). `AUTOFILL_FILL { mode }` executes — merge skips pre-filled fields, overwrite replaces all. Never re-run scan between the two phases.

**Derived fields contract:** Every `handleSave` in `options/App.tsx` does two writes — raw profile first, then profile + `calculateDerivedFields()`. Second write is try/catch so a derivation bug never blocks the user's save. Section components must never write `profile.derived` directly.

**Storage privacy boundary:** `geminiApiKey`, `geminiModel`, `driveToken`, `driveBackupState` are never included in profile export bundles. Exports wrap only `{ profile, learnedMappings, applicationHistory }`.

**AI is purely additive:** The extension works fully without a Gemini key. AI autofill runs after the rule pipeline; all failures must be silent — never surface network errors from the AI layer.

**Toast system:** `useToast()` from `src/components/ui/Toast.tsx`. Never add inline "✓ Saved" labels to section components.

**Profile schema fan-out:** Any field added or renamed on the `Profile` type must be reflected in four places: `src/types/profile.ts`, `src/resume-ai/prompt.ts` schema, `src/resume-ai/parser.ts` FIELD_DEFS, and `src/utils/profileValidator.ts`. Missing any one causes silent drift between resume import, profile import/export, and the diff/review UI.

**Profile date formats are NOT unified:** work history dates require month (`YYYY-MM`); education dates accept either `YYYY` or `YYYY-MM`. The validator uses `RE_YYYYMM` for `workHistory` and `RE_YYYY_OR_YYYYMM` for `education` — keep them separate.

---

## 5. Hard Safety Rules

- **Never push a `v*.*.*` tag or trigger a release without explicit user instruction.** Releases auto-publish to the Chrome Web Store with no CLI rollback. Use `/ship` and wait for confirmation at each step.
- **Never read or print `.env.development` / `.env.production`** — they contain real OAuth client IDs.
- **ESLint must stay on v9.x.** `eslint-plugin-react@7.x` calls `context.getFilename()` removed in ESLint v10. Upgrading breaks the linter until the plugin ships a v8 stable.
- **Always run `pnpm compile` before committing.** CI enforces type-check; failing commits are noisy on main.

---

## 6. Known Traps

- **`MonthYearPicker` emits `onChange('')` during partial entry.** Do not treat this as a required-field error on each keystroke; enforce only at save time.

- **Backward-compat profile loaders:** Phone (string → `PhoneNumber`), work location (string → `{ countryCode?, city? }`), work auth country (free-text → ISO alpha-2), expected salary rows (currency-only → country+currency). Loaders live in section components — don't break them.

- **`documents.cv` URL and file can coexist.** `{ url?, file? }` — both fields are intentionally preserved together. `DocumentsSection.toDocumentEntry()` must never make them mutually exclusive. Save fails if BOTH are empty: `DocumentsSection` enforces "URL or file upload required" via a single `requiredError` shown at the top of the card.

- **Reset sequencing in `entrypoints/options/App.tsx` is timing-sensitive.** `sectionSeq` and `activeSection` are bumped INSIDE the `handleImportComplete(afterLoad)` callback, not synchronously after the reset call. Doing it synchronously remounts sections with the OLD profile because `setProfile` lives inside the async `.then()`.

- **Work auth status labels: single source of truth.** `src/data/workAuthorization.ts` exports `WORK_AUTH_STATUS_OPTIONS` and `WORK_AUTH_STATUS_LABELS`. Never inline these strings in picker, resolver, or section components.

- **`chrome.storage.local` 5 MB limit.** CV files stored as base64, capped at 4 MB in UI. Do not raise the cap without budgeting the rest of the profile.

- **Drive OAuth uses implicit grant via `chrome.identity.launchWebAuthFlow`.** Google Cloud app type must be "Web Application" (not "Chrome Extension" — that forces `getAuthToken()` and causes `redirect_uri_mismatch`). Needs separate client IDs for dev and prod. Set `VITE_GOOGLE_DRIVE_CLIENT_ID` in `.env.development` / `.env.production` (see `.env.example`).

<!-- last-reviewed: 5fd1c6b -->
