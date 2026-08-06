# Job Buddy

## 1. Project Identity

Chrome MV3 browser extension (WXT framework) that auto-fills job application forms from a saved user profile. Aimed at multi-country job seekers. Single user, no server, no database — everything lives in `chrome.storage.local`. The only production surface is the Chrome Web Store.

**Stack:** WXT 0.20.26 · React 19.2.4 · TypeScript 5.9.3 · Tailwind CSS v4 (`@tailwindcss/postcss`, not v3 config) · Vitest 4.1.9 · pnpm 11.7.0 · Node 22 (pinned via `.nvmrc`)

**Blast radius:** Pushing a `v*.*.*` tag triggers `release.yml`. The tag's annotation message controls CWS submission: `"release"` submits for review immediately, `"release:draft"` uploads as a draft only. There is no rollback CLI; unpublishing requires the CWS dashboard.

---

## 2. Project Config

- `git-strategy: solo` — commit directly to `main`, no feature branches, no PRs. See `.claude/rules/git.md`.
- `git-auto-commit: true` — commit automatically after each task without prompting; push still requires confirmation.
- `readme-style: standard` — README.md follows the Standard Readme spec structure.

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
- `background.ts` — service worker; retries pending Drive sync on browser startup and debounces a Drive sync whenever the local `profile` or `learnedMappings` storage key changes
- `content.ts` — matches `*://*/*`, `allFrames: true` (job forms are often embedded in a cross-origin iframe); routes `AUTOFILL_SCAN/FILL/CLEAR/GET_STATUS/GET_DEBUG_SESSION` to `src/autofill/`
- `popup/` — action popup; React state lost on close, restored from `GET_STATUS` on mount. Debug panel hidden until Shift+click the logo post-fill. `sendToAllFrames()`/`mergeAutofillResults()` enumerate a tab's frames (`chrome.webNavigation.getAllFrames`) and aggregate results, since `chrome.tabs.sendMessage` only reaches the top frame by default.
- `options/` — full-page profile editor (9 profile sections + Resume Import + Learned Mappings + Settings)

**Key source files:**
- `src/types/profile.ts` — canonical `Profile` type; 10 top-level keys including `derived`
- `src/utils/storage.ts` — `chrome.storage.local` wrappers; reads always resolve, writes reject on quota
- `src/autofill/index.ts` — orchestrator: `scanAutofill()`, `executeAutofill()`, `undoAutofill()`
- `src/autofill/mapper.ts` — 4-layer match: learned (0.97, requires 2 confirmations) → autocomplete (0.95) → dict exact (0.85) → fuzzy (score × 0.85 / 0.75 by tier) → context (0.70). Signal priority is `[label, ariaLabel, placeholder, name, id]` — label first.
- `src/autofill/resolver.ts` — dot-notation resolver + virtual paths (`phone.full`, `address.countryName`, `salary.*.formatted`, etc.); also `flattenProfileValues()`, the reverse — every raw (path, value) leaf, for matching typed text back to a profile field
- `src/resume-ai/gemini.ts` — `extractFromResume()` + `resolveFieldsWithAI()` via Gemini API
- `src/resume-ai/autofillPrompt.ts` — `AUTOFILL_SYSTEM_PROMPT`; the AI autofill system prompt for resolving unmatched fields
- `src/utils/driveSync.ts` — Google Drive backup via `drive.appdata` scope; implicit OAuth token flow; also owns `retryPendingDriveSync()` (background, startup) and `syncIfConnected()` (background, debounced on `profile`/`learnedMappings` storage changes)
- `src/utils/derivedFields.ts` — computes `fullName`, `currentTitle`, `currentCompany`, `totalExperience`, `age`
- `src/utils/profileCompletion.ts` — `TOTAL_CHECKS = 15`; drives sidebar checkmarks and completion %
- `src/autofill/constants.ts` — named confidence thresholds. Always use these, never bare numbers.
- `src/autofill/mappings.ts` — `saveElementMappings()`; call this when saving learned mappings from an element's signals — do not re-inline the loop
- `src/autofill/scanner.ts` — `scanFields()` (native inputs) + `scanAriaFields()` (ARIA comboboxes, contenteditable). Both run during `scanAutofill()`.
- `src/autofill/signals.ts` — `extractSignals()` + `bestLabel(signals)` helper (`label || ariaLabel || placeholder || name`). Use `bestLabel`, don't re-inline.
- `src/autofill/filler.ts` — type-aware fill: native, ARIA listbox, React-Select, contenteditable, date reformat (ISO → MM/DD/YYYY or DD/MM/YYYY from placeholder hint)
- `src/components/options/shared/saveSection.ts` — every section's save flow goes through this. Error string lives only here.
- `src/components/options/shared/fieldCls.ts` — shared Tailwind class string for form inputs (error vs non-error variants). Don't inline these strings elsewhere.
- `src/components/options/shared/useSearchableDropdown.ts` — keyboard nav + filter hook powering all 5 searchable dropdown components; memoises filter output per keystroke.
- `src/components/options/shared/useScrollToNewEntry.ts` — scrolls and focuses a newly added card into view; used by all multi-entry sections.
- `src/utils/migrate.ts` — `normalizeProfile()` defaults missing salary period to `'monthly'`; called by both `getProfile()` and `saveProfile()`. New on-load migrations belong here.
- `src/resume-ai/normalize.ts` — `normalizeBullets()` + `normalizeSummaryLineWraps()`. Bullet pass fires only when bullet structure is detected — preserves plain context paragraphs.
- `src/resume-ai/extractLinks.ts` — pulls hyperlinks from PDF annotation layer via `pdfjs-dist`; returns `[]` for non-PDF and on any error.
- `src/utils/theme.ts` — `ThemePreference` (`system | light | dark`); sets `.dark` on `document.documentElement`.
- `src/utils/devProfile.ts` — `DEV_PROFILE`, a fully-filled dummy profile `getProfile()` falls back to when nothing is saved yet and `import.meta.env.DEV` is true. Never persisted, never present in a production build.
- `src/autofill/profileFieldTree.ts` — `buildPickerTree()`; despite the name, no picker exists anymore. It now powers the grouped, searchable field dropdown in the Learned Mappings edit UI (`SearchableProfileFieldSelect`).

**Site (`docs/`):**
- `docs/index.html` — GitHub Pages landing page (no build step; Tailwind via CDN)
- `docs/project-site/` — project overview mini-site
- `docs/legal/privacy/`, `docs/legal/terms/`, `docs/legal/eula/`, `docs/legal/disclaimer/` — legal pages as standalone HTML; regenerate with `/legal`

---

## 5. Domain Rules

**Autofill confidence tiers:** ≥0.85 → green (fill) · 0.60–0.84 → yellow (fill) · <0.60 → red (no fill) · ≥0.60 but profile value empty → gray/noData (no highlight). Yellow, red, and gray fields are left for the user to type into directly — no picker overlay. AI-resolved fields that reach ≥0.85 are treated as green.

**Two-phase fill:** `AUTOFILL_SCAN` maps fields into `pendingMatches` (no fill). `AUTOFILL_FILL { mode }` executes — merge skips pre-filled fields, overwrite replaces all. Never re-run scan between the two phases.

**Derived fields contract:** Every `handleSave` in `options/App.tsx` does two writes — raw profile first, then profile + `calculateDerivedFields()`. Second write is try/catch so a derivation bug never blocks the user's save. Section components must never write `profile.derived` directly.

**Storage privacy boundary:** `geminiApiKey`, `geminiModel`, `driveToken`, `driveBackupState` are never included in profile export bundles. Exports wrap only `{ profile, learnedMappings, applicationHistory }`.

**AI is purely additive:** The extension works fully without a Gemini key. AI autofill runs after the rule pipeline; all failures must be silent — never surface network errors from the AI layer. All three non-green tiers (needReview, lowConfidence, noData) get an AI pass, not just red/gray. A high-confidence AI response can overwrite a yellow field's rule-pipeline value.

**Multi-frame autofill:** job forms are frequently embedded in a cross-origin iframe rather than the top-level page, so `content.ts` injects into every frame. The popup's messaging is frame-aware — every `AUTOFILL_*`/`GET_STATUS`/`GET_DEBUG_SESSION` message goes to every frame via `sendToAllFrames()`, with scan/fill/status counts summed across frames and the debug panel showing whichever frame actually scanned fields.

**Stale learned mappings are flagged, never auto-corrected or auto-removed.** If a mapping's path no longer resolves (e.g. it pointed to a deleted work-history row), the Learned Mappings page shows an "Empty right now" badge (computed live via `resolveProfileValue()` against the current profile) — storage itself is untouched until the user acts.

**Profile schema fan-out:** Any field added or renamed on `Profile` must be reflected in four places: `src/types/profile.ts`, `src/resume-ai/prompt.ts` schema, `src/resume-ai/parser.ts` FIELD_DEFS, and `src/utils/profileValidator.ts`.

**Profile date formats are NOT unified:** work history dates require month (`YYYY-MM`); education dates accept either `YYYY` or `YYYY-MM`. Keep the validator regexes separate.

**Learned mapping confidence:** `LearnedMappings` values are `string | { path: string; count: number }`. New mappings start at `count: 1` and are not promoted to Layer 0 until count reaches 2, and are matched only against `label/ariaLabel/placeholder/name/id` — never `nearbyText`. `saveLearnedMapping()` in `src/utils/storage.ts` is the source of truth.

**Manual edits feed learned mappings by content, not by the mapper's guess.** `attachEditWatchers()` in `src/autofill/index.ts` saves a mapping on blur (any tier — yellow/red/gray) only when the edited value is long enough (`EDIT_LEARN_MIN_VALUE_LENGTH`) and closely resembles some value already in the profile (`flattenProfileValues()` + `similarity()` ≥ `EDIT_LEARN_SIMILARITY_THRESHOLD`). The saved path is whichever profile value scored best — not necessarily the mapper's original `fieldPath` guess, which may be wrong or absent. A wildly different edit (a genuine custom-question answer) simply finds no match and is left unlearned.

**Drive backup payload fan-out:** Adding a field to `DriveBackupFile` requires updating both `syncProfileToDrive()` (upload) and two restore paths in `SettingsSection` — `handleRestoreFromDrive` and `handleDriveReviewSave`.

---

## 6. Behavior Rules

**Toast system:** `useToast()` from `src/components/ui/Toast.tsx`. Never add inline "✓ Saved" labels to section components.

**Test environment:** Vitest with per-file `// @vitest-environment jsdom` for DOM-dependent tests — no global jsdom switch. `@testing-library/react` is not installed; React component tests require adding it first.

---

## 7. Hard Safety Rules

- **Never push a `v*.*.*` tag without explicit user instruction.** Tag annotation `"release"` submits to CWS immediately; `"release:draft"` uploads as a draft. No CLI rollback either way.
- **Never read or print `.env.development` / `.env.production`** — they contain real OAuth client IDs.
- **ESLint must stay on v9.x.** `eslint-plugin-react@7.x` calls `context.getFilename()` removed in ESLint v10.
- **Always run `pnpm compile` before committing.** CI enforces type-check; failing commits are noisy on main.

---

## 8. Known Traps

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

- **WXT entrypoint collision.** Every file under `entrypoints/` is treated as a browser entrypoint — placing test files there causes `Multiple entrypoints with the same name` build errors. Keep all test files under `src/` or alongside their source file, never in `entrypoints/`.

- **Content scripts and the background service worker don't see custom `.env` vars in dev builds.** They're pre-bundled statically even under `pnpm dev` (Chrome can't load a service worker or content script from the live Vite dev server the way it loads popup/options), so `import.meta.env.VITE_*` custom vars resolve `undefined` there, even though Vite's built-in `import.meta.env.DEV` flag correctly resolves the same everywhere. A dev-only fallback that needs to reach the content script must persist to `chrome.storage.local` on first resolution (see `getGeminiApiKey()`/`getGeminiModel()` in `storage.ts`) rather than relying on the env var being visible where it's used.

- **`chrome.tabs.sendMessage` only reaches the top frame by default.** Since `content.ts` runs in every frame, sending to a specific frame requires `{ frameId }`. See `sendToAllFrames()` in `popup/App.tsx`.

## Rules

This project follows the rules shipped in claude-helm:
- ~/.claude/plugins/marketplaces/claude-helm/rules/git.md
- ~/.claude/plugins/marketplaces/claude-helm/rules/safety.md

At the start of every session, check whether the paths above exist on this machine.
If either is missing, inform the user: "helm rules are referenced in CLAUDE.md but the
plugin is not installed on this machine. Install it with: /plugin install claude-helm"

<!-- last-reviewed: 52bce8b37dbb654f5b5ef9332d322c40cdabaf64 -->
