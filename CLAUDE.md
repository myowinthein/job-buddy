# Job Buddy — Project Memory

## What It Is

Job Buddy is a Chrome browser extension (Manifest V3) that lets job seekers store a rich profile and use it to auto-fill job application forms. Aimed at multi-country job seekers (hence per-country work authorization, per-currency salary, multi-language support).

The extension has three pillars:
1. **Profile editor** — full-page options UI with nine sections
2. **Autofill** — content script scans any page's form fields, maps them to profile values, fills them, and highlights confidence
3. **Resume import** — PDF/DOCX upload that extracts fields and produces draggable text chunks

---

## Technology Stack

| Layer | Choice |
|---|---|
| Extension framework | WXT 0.20.26 (`@wxt-dev/module-react`) |
| UI | React 19, TypeScript 5.9.3 |
| Styling | Tailwind CSS v4 (`@tailwindcss/postcss` — not the v3 config pattern) |
| Package manager | pnpm 11.7.0 |
| Target browser | Chrome MV3 (Firefox build also supported via `pnpm build:firefox`) |
| Fuzzy matching | `fastest-levenshtein` (autofill mapper) |
| Resume parsing | `pdfjs-dist`, `mammoth` |

---

## Extension Architecture

Four entrypoints in `entrypoints/`:

| Entrypoint | Description |
|---|---|
| `background.ts` | Service worker — stub; no message passing wired |
| `content.ts` | Content script matched to `*://*/*`; listens for `AUTOFILL` / `CLEAR` runtime messages and delegates to `src/autofill/` |
| `popup/` | Browser action popup — profile completion %, Auto Fill button, Clear Highlights, result summary |
| `options/` | Full-page profile editor + resume import dialog + drag-source floating panel (planned) |

Storage is `chrome.storage.local` (not `sync`). The wrapper in `src/utils/storage.ts` swallows errors and always resolves, so callers don't need rejection handling. `clearAllStorage()` removes all three keys (used by Settings → Reset).

Three storage keys:
- `profile` — the user's `Profile` object (includes `id` and `derived`, see below)
- `learnedMappings` — `{ [domain]: { [normalizedSignal]: profileFieldPath } }` — written when the user picks a value from the autofill red-field overlay
- `applicationHistory` — array of `ApplicationEntry` — reserved for dedup/history tracking; no UI yet

`Profile.id` is a top-level UUID auto-backfilled by `getProfile()` on first read if missing — every load of an old profile silently writes back an id. Used as the prefix in export filenames and the `profileId` field of the export schema.

---

## Profile Data Model

The canonical type is `Profile` in `src/types/profile.ts`. Ten top-level keys, nine mapping to sidebar sections plus `derived`:

| Section key | Required for completion | Notes |
|---|---|---|
| `personal` | firstName, lastName, email, phone | phone is `PhoneNumber { countryCode, callingCode, number }` |
| `address` | city, country | |
| `salary` | current.amount, current.currency, ≥1 expected entry | expected entries store both `country` (ISO) and derived `currency` |
| `workAuthorization` | ≥1 entry with country + status | country stored as ISO 3166-1 alpha-2 code |
| `workHistory` | ≥1 complete entry + valid `professional.noticePeriod` | notice period is `{ immediate } \| { immediate: false, value, unit }` |
| `education` | ≥1 entry with institution, degree, fieldOfStudy, startDate | |
| `languages` | ≥1 entry | |
| `links` | linkedin | must contain `linkedin.com` |
| `documents` | CV (URL or file ≤ 4 MB) | included in completion score |

**Completion scoring** (`src/utils/profileCompletion.ts`): `TOTAL_CHECKS = 16` covering all nine sections. `calculateCompletion()` returns `{ percentage, missingFields, missingGroups }`. `getSectionCompletion()` returns a boolean per section for sidebar ✓ indicators.

**Date formats**:
- Work history & education dates: `YYYY-MM` (MonthYearPicker)
- Date of birth: `YYYY-MM-DD` (DateOfBirthPicker)

### `profile.derived` — Read-Only Computed Fields

`derived: DerivedFields` (in `src/types/profile.ts`) is a top-level key holding computed values: `fullName`, `currentTitle`, `currentCompany`, `totalExperience` (years/months/label), `age?`. It is **never edited in the UI** and never read by section components.

**Recalculation contract**: every successful section save in `App.tsx`'s `handleSave` runs a two-pass write:
1. `saveProfile(merged)` — primary data
2. `saveProfile({ ...merged, derived: calculateDerivedFields(merged) })`

The second pass is wrapped in `try/catch` so a derivation bug can never block or roll back the user's data. Logic lives in `src/utils/derivedFields.ts`.

---

## Options Page Architecture

`entrypoints/options/App.tsx` is the shell. It owns:
- The loaded `Profile` object (starts as `Partial<Profile>`)
- Active section routing (9 sections, no router library)
- `handleSave(updates)` — merges, writes, recalculates derived, writes again
- `pendingResume` — `ExtractedResume | null`; set when the resume dialog completes; consumed by the floating panel (planned)
- Document-level dragover/drop listeners (for future drag-from-floating-panel)

Each section component receives `{ profile, onSave }` and has its own save button. Sections do not share unsaved state — switching sections without saving loses changes.

**UX patterns**:
- Field-level validation fires on change; full validation fires on save
- Save button shows "Saving..." while writing; success/error feedback is via the global toast (see Toast system below) — no inline "Saved" label
- New entries in multi-entry sections scroll into view and focus the first input
- `ExpandableCard` (confirm-before-delete) used in WorkHistory and Education

### Toast system (`src/components/ui/Toast.tsx`)

`ToastProvider` wraps `<App />` in `entrypoints/options/main.tsx`. Use `useToast()` to get `showToast(type, message, duration?)`. Three types: `success` (green, 2 s default), `warning` (yellow, 2 s), `error` (red, 3.5 s). Stack is fixed top-right (offset 96 px to clear the completion banner). All section save buttons and Settings actions call this — do not reintroduce inline "✓ Saved" labels.

### Settings section (`src/components/options/SettingsSection.tsx`)

A 10th sidebar entry (below the 9 profile sections, above the Import Resume button). Three subsections:

| Action | Behavior |
|---|---|
| Export Profile | Bundles `{ _comment, version: "1.0", profileId, exportedAt, profile, learnedMappings, applicationHistory }`, downloads as `job-buddy-profile-<idPrefix>-<date>.json` |
| Import Profile | Validates JSON via `src/utils/profileValidator.ts`; conflict dialog offers Merge (fill empty fields only) or Overwrite (replace all) |
| Reset All Data | Type-`DELETE` confirmation, then `clearAllStorage()` clears all three storage keys; `onResetComplete` re-fetches and navigates to `personal` |

The section is wired through `App.tsx`'s `handleImportComplete` (re-fetches profile so sidebar checkmarks refresh without a page reload).

### UI State Persistence (`sessionStorage`)

`App.tsx` persists three pieces of UI state to `sessionStorage`, separate from profile data:

| Key | Purpose |
|---|---|
| `jb:ui:section` | Active sidebar section |
| `jb:ui:sidebar` | Sidebar collapsed/expanded |
| `jb:ui:scroll:<sectionId>` | Scroll position per section |

Section and sidebar are read **synchronously in `useState` initializers** so the first render is correct (no post-load jump). Scroll is restored once after the profile loads. Form data is **not** persisted — refresh loads the saved profile from `chrome.storage.local`.

### Shared Form Components (`src/components/options/shared/`)

`FormField`, `ExpandableCard`, `RemoveButton`, `MonthYearPicker`, `DateOfBirthPicker`, `SearchableCountrySelect`, `SearchableCountryDropdown`, `SearchableCountryWithCurrencyDropdown` (used for expected salary), `SearchableCurrencySelect`, `SearchableLanguageSelect`.

---

## Autofill (`src/autofill/`)

Module layout (each file is a pure DOM utility — no React):

```
scanner.ts     — finds visible input/textarea/select; excludes hidden types
signals.ts     — extracts name/id/placeholder/autocomplete/aria-label/label/nearbyText
normalizer.ts  — lowercase + strip non-alphanumeric
dictionary.ts  — profile-field-path → known signal variations
resolver.ts    — dot-notation profile value resolver with special cases
mapper.ts      — 4-layer match: learned → autocomplete → dictionary → fuzzy → context
filler.ts      — native input setter + dispatches input/change/blur
highlighter.ts — injected underline div per field (no host styles touched)
picker.ts     — inline focus-triggered overlay for red (unmatched) fields
index.ts       — orchestrator; exports runAutofill(), undoAutofill(), clearHighlights()
```

`undoAutofill()` (wired to the popup's "Undo Auto-fill" button via the `CLEAR` message) iterates a module-level `filledElements: HTMLElement[]` registry (populated during both mapper and picker fills) and calls `clearFieldValue()` + `clearElementHighlight()` per element — clears both the value and the highlight. The registry is reset on each `runAutofill()`.

### 4-Layer Mapping Pipeline (in `mapper.ts`)

| Layer | Source | Confidence |
|---|---|---|
| 0 Learned | `learnedMappings[domain][normalizedSignal]` | 0.97 |
| 1 Autocomplete | HTML `autocomplete` attribute (e.g. `given-name`, `email`, `tel`) | 0.95 (url: 0.80) |
| 2 Dictionary exact | normalized signals vs `FIELD_DICTIONARY` | 0.85 |
| 3 Fuzzy | `fastest-levenshtein` similarity on signals vs dictionary | score × 0.85 (>0.75) or × 0.75 (0.60–0.75) |
| 4 Context | `nearbyText` against dictionary | 0.70 |

Highlight thresholds: ≥0.85 green, ≥0.60 yellow, <0.60 red. Picker overlay is attached to red fields' `focus` event; selecting a value persists `learnedMapping[domain][signal] = fieldPath` for every normalized signal on that element.

### Why the filler uses a native setter

`filler.ts` captures `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set` at module load and calls it via `.call(element, value)`. React/Vue/Angular install instance-level property descriptors that swallow plain `element.value = x` assignments. The native setter bypasses these, then dispatching `input → change → blur` triggers framework change detection.

### Highlighter never touches host element styles

The current implementation injects a separate `<div>` underneath each field (positioned via `getBoundingClientRect`) rather than styling the input. This works across input/textarea/select and custom div-based components. A `scroll` + `resize` listener on `window` re-runs `updatePositions()` so underlines track their fields. `clearHighlights()` removes the listeners by stored reference.

---

## Resume Import

`src/resume/extractor.ts` does the parsing; `src/components/options/ImportResumeDialog.tsx` is the upload UI; `src/components/options/ResumeFloatingPanel.tsx` is the drag source.

- PDF: pdfjs `getTextContent()` with y-coordinate-based line grouping
- DOCX: `mammoth.extractRawText({ arrayBuffer })`
- **Section-aware chunking** — `splitIntoSections()` carves the raw text into named sections (EXPERIENCE, EDUCATION, SKILLS, SUMMARY, etc.); field detection runs only against the HEADER section (name/contact block) to avoid false positives. Each section is chunked differently: experience/education by date-boundary, skills as one block, certifications line-by-line, summary auto-mapped to `professional.summary` as a DetectedField.
- Each `TextChunk` carries a `sectionLabel` used by the floating panel to group chunks visually.

### Floating panel + drag-and-drop

When `pendingResume` is set on `App.tsx`, `ResumeFloatingPanel` renders as a 280 px fixed panel (default bottom-right, draggable via header, collapsible to a 48 px icon with unused-count badge). It exposes detected fields and chunks as `draggable="true"` items.

`App.tsx` attaches document-level `dragover`/`drop` listeners (only while `pendingResume` is set) that:
- Highlight the hovered input/textarea/select with `outline: 2px dashed #6366f1`
- On drop of a `detectedField`: fill the dropped element via `src/resume/dropFiller.ts` (reuses `fillField` from autofill)
- On drop of a `textChunk` onto an input outside WorkHistory/Education: fill it directly
- On drop of a `textChunk` while the active section is `workHistory` or `education`: parse the chunk (date-range regex, company/title split, degree keywords) and dispatch a `CustomEvent('job-buddy-add-entry', { detail: { section, parsedData, rawText } })` on `window`. The two sections each have a `useEffect` listener that appends a pre-filled entry and force-expands its `ExpandableCard`.

Used chips/chunks are tracked via a callbacks ref so the panel can fade them and update the unused count without prop drilling.

---

## Known Traps & Warnings

### pdfjs worker (Chrome MV3 CSP)

The pdfjs worker **must** be bundled locally — Chrome extension CSP blocks both CDN scripts and `new URL(..., import.meta.url)` patterns. Two pieces required:

1. `wxt.config.ts` — `vite.optimizeDeps.exclude: ['pdfjs-dist']`
2. `entrypoints/options/main.tsx` — Vite `?url` import:
   ```ts
   import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
   pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
   ```

### Mammoth has no `@types/mammoth`

A local ambient declaration lives at `src/types/mammoth.d.ts`. Only `extractRawText` is declared because that's all the project uses.

### `MonthYearPicker` emits `onChange('')` during partial fills

The picker emits an empty string whenever month or year is incomplete (e.g. month selected before year is typed). Per-keystroke validators on `startDate` must not flag this as "required" — the save-time `validate()` is the right place to enforce it. See the `WorkHistorySection.updateEntry` exclusion of `startDate`.

### Storage limit

`chrome.storage.local` has a 5 MB limit. CV files are stored as base64 (max 4 MB enforced in UI). Do not raise the 4 MB cap without budgeting for the rest of the profile.

### Backward Compatibility (profile loaders)

Several profile fields have been refactored. Loaders handle old data — don't break these:

1. **Phone** — was string, now `PhoneNumber`. `initPhone()` in `PersonalSection.tsx`.
2. **Work location** — was string, now `{ countryCode?, city? }`. `initRow()` in `WorkHistorySection.tsx`.
3. **Work authorization country** — was free-text name, now ISO code. `findCountryByNameOrCode()`.
4. **Expected salary** — old rows had `currency` only; new rows have `country` + derived `currency`. `initExpectedRow()` in `SalarySection.tsx` reverse-maps unambiguous currencies (SGD→SG); ambiguous ones (EUR, USD) are left blank.
5. **Links** — `github/twitter/dribbble/behance` removed from UI but preserved on save. `LinksSection.tsx`.
6. **Cover letter** — `documents.coverLetter` preserved even though UI shows CV only.

### Generated dirs

- `.output/` — both dev and prod builds; gitignored
- `.wxt/` — generated WXT types; regenerated by `pnpm postinstall`

### No tests

Validation and completion logic (`src/utils/`) is the highest-value target when tests are added.

---

## Development Workflow

```bash
pnpm dev          # dev build with hot reload → .output/chrome-mv3-dev/
pnpm build        # production build → .output/chrome-mv3/
pnpm zip          # production build + zip for Chrome Web Store
pnpm compile      # TypeScript type-check only (no emit)
pnpm lint         # ESLint
pnpm format       # Prettier
```

Load in Chrome: `chrome://extensions` → "Load unpacked" → select `.output/chrome-mv3-dev/`.

---

## What Isn't Implemented Yet

- **Background messaging** — `background.ts` is a stub; popup talks to the content script directly via `chrome.tabs.sendMessage`
- **Application history** — `applicationHistory` storage key and `ApplicationEntry` type exist; the key is included in profile export/import bundles, but no dedup or UI consumes it
