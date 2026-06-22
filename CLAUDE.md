# Job Buddy — Project Memory

## What It Is

Job Buddy is a Chrome browser extension (Manifest V3) that lets job seekers store a rich profile and use it to auto-fill job application forms. Aimed at multi-country job seekers (hence per-country work authorization, per-currency salary, multi-language support).

The extension has two pillars:
1. **Profile editor** — full-page options UI with nine sections
2. **Autofill** — content script scans any page's form fields, maps them to profile values, fills them, and highlights confidence

A resume import feature (PDF/DOCX → fields + draggable text chunks) existed previously but was removed; it is deferred to Phase 2 LLM-based profile extraction.

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

---

## Extension Architecture

Four entrypoints in `entrypoints/`:

| Entrypoint | Description |
|---|---|
| `background.ts` | Service worker — stub; no message passing wired |
| `content.ts` | Content script matched to `*://*/*`; listens for `AUTOFILL_SCAN` / `AUTOFILL_FILL` / `CLEAR` runtime messages and delegates to `src/autofill/` |
| `popup/` | Browser action popup — profile completion %, Auto Fill button, Clear Highlights, result summary. Chrome MV3 destroys the popup on close, so React state is lost; on mount the popup sends `GET_STATUS` to the content script and restores the success view from the content script's `lastResult` |
| `options/` | Full-page profile editor (9 sections + Settings) |

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
| `salary` | current.amount, current.currency | expected entries are optional; each stores both `country` (ISO) and derived `currency`. Partial rows (country XOR amount) are rejected at save |
| `workAuthorization` | ≥1 entry with country + status | country stored as ISO 3166-1 alpha-2 code |
| `workHistory` | ≥1 complete entry + valid `professional.noticePeriod` | notice period is `{ immediate } \| { immediate: false, value, unit }` |
| `education` | ≥1 entry with institution, degree, fieldOfStudy, startDate | |
| `languages` | ≥1 entry | |
| `links` | linkedin | must contain `linkedin.com` |
| `documents` | CV (URL or file ≤ 4 MB) | included in completion score |

**Completion scoring** (`src/utils/profileCompletion.ts`): `TOTAL_CHECKS = 15` covering all nine sections. `calculateCompletion()` returns `{ percentage, missingFields, missingGroups, isCoreComplete, optionalFieldsRemaining, optionalGroups }`. `getSectionCompletion()` returns a boolean per section for sidebar ✓ indicators; the sidebar also renders a filled green badge when a section's optional fields are all filled (derived in `App.tsx` by intersecting `sectionCompletion` with `optionalGroups`).

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
Each section component receives `{ profile, onSave }` and has its own save button. Sections do not share unsaved state — switching sections without saving loses changes.

**UX patterns**:
- Field-level validation fires on change; full validation fires on save
- Save button shows "Saving..." while writing; success/error feedback is via the global toast (see Toast system below) — no inline "Saved" label
- New entries in multi-entry sections scroll into view and focus the first input
- `ExpandableCard` (confirm-before-delete) used in WorkHistory and Education

### Toast system (`src/components/ui/Toast.tsx`)

`ToastProvider` wraps `<App />` in `entrypoints/options/main.tsx`. Use `useToast()` to get `showToast(type, message, duration?)`. Three types: `success` (green, 2 s default), `warning` (yellow, 2 s), `error` (red, 3.5 s). Stack is fixed top-right (offset 96 px to clear the completion banner). All section save buttons and Settings actions call this — do not reintroduce inline "✓ Saved" labels.

### Settings section (`src/components/options/SettingsSection.tsx`)

A 10th sidebar entry below the 9 profile sections. Three subsections:

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
resolver.ts    — dot-notation profile value resolver; handles plain paths via generic
               traversal plus regex-matched virtual paths (phone.full, dateOfBirth.day/month/year,
               address.countryName, salary.current.formatted, salary.expected.N.formatted,
               workAuthorization.N, workHistory.N.{isCurrent,location,startDate.formatted,
               endDate.formatted,arrangement}, education.N.{isCurrent,startDate.formatted,
               endDate.formatted})
mapper.ts      — 4-layer match: learned → autocomplete → dictionary → fuzzy → context
filler.ts      — native input setter + dispatches input/change/blur
highlighter.ts — confidence-based background-color tint applied to the element
picker.ts      — two-level collapsible overlay for non-green fields. See § Picker overlay below.
index.ts       — orchestrator; exports scanAutofill(), executeAutofill(), runAutofill(), undoAutofill(), clearHighlights()
```

### Two-phase fill (scan → fill)

Autofill runs in two messages so the popup can show a merge/overwrite dialog when the form already has data:

1. `AUTOFILL_SCAN` → `scanAutofill()` maps every visible field, stores results in a module-level `pendingMatches` array, and returns `{ preFilledCount, totalMatched }`. No fill happens.
2. `AUTOFILL_FILL { mode: 'merge' | 'overwrite' }` → `executeAutofill(mode)` fills using `pendingMatches`. Merge skips fields that already had a value AND would have been filled (confidence ≥ 0.60 with a profile value).

`runAutofill()` (legacy single-phase) chains the two for internal use.

### Four-way `AutofillResult` categorisation

Each field falls into exactly one of four buckets:

| Bucket | Condition | Behaviour |
|---|---|---|
| `noReview`      | confidence ≥ 0.85 AND profile value present | fill, green tint |
| `needReview`    | 0.60 ≤ confidence < 0.85 AND profile value present | fill, yellow tint, picker + edit-watcher attached |
| `lowConfidence` | confidence < 0.60 | no fill, red tint, picker + edit-watcher attached |
| `noData`        | confidence ≥ 0.60 AND profile value empty | no fill, no highlight, picker + edit-watcher attached |

`totalScanned` = every field the scanner found, regardless of bucket. `noData` fields are not highlighted until the user fills them (via picker selection or manual typing), at which point they're added to `sessionElements` so Undo covers them.

**Promotion to noReview** — non-green fields are watched for both picker selection (saves a learned mapping for the domain) AND manual user edits (blur with a changed value, no mapping saved). Both paths flip the field to green, decrement its origin-state counter, and increment `noReview`. Manual typing is deliberately separated from the learning mechanism — only picker selections create learned mappings.

### Undo registry

`undoAutofill()` (wired to the popup's "Undo Auto-fill" button via the `CLEAR` message) iterates a module-level `sessionElements: HTMLElement[]` registry (populated whenever `applyHighlight` runs — `noReview`, `needReview`, `lowConfidence`, plus picker-completed fills) and calls `clearFieldValue()` + `clearElementHighlight()` per element. The registry is reset on each `scanAutofill()` / `executeAutofill()` call. `noData` fields are intentionally absent.

### 4-Layer Mapping Pipeline (in `mapper.ts`)

| Layer | Source | Confidence |
|---|---|---|
| 0 Learned | `learnedMappings[domain][normalizedSignal]` | 0.97 |
| 1 Autocomplete | HTML `autocomplete` attribute (e.g. `given-name`, `email`, `tel`) | 0.95 (url: 0.80) |
| 2 Dictionary exact | normalized signals vs `FIELD_DICTIONARY` | 0.85 |
| 3 Fuzzy | `fastest-levenshtein` similarity on signals vs dictionary | score × 0.85 (>0.75) or × 0.75 (0.60–0.75) |
| 4 Context | `nearbyText` against dictionary | 0.70 |

Highlight thresholds: ≥0.85 green, ≥0.60 yellow, <0.60 red. Picker overlay is attached to every non-green field's `focus` event (de-duplicated via a `WeakMap<HTMLElement, () => void>`); selecting a value persists `learnedMapping[domain][signal] = fieldPath` for every normalized signal on that element. Profile data shown in the picker is fetched fresh via `getProfile()` on every open — there is no in-memory snapshot, so cross-tab edits are reflected immediately.

### Picker overlay (`src/autofill/picker.ts`)

The picker is a fixed-position DOM overlay (no React, no Tailwind — inline styles only to avoid host page conflicts). It renders a two-level collapsible tree:

**Level 1 — Sections** (collapsed by default; one auto-expanded by signal heuristic):
Personal, Address, Salary, Work Authorization, Work History, Education, Languages, Links, Documents.

**Level 2 — Sub-groups / Clusters inside a section:**
- *Cluster* — inline heading, no collapse control (Phone, Date of Birth variants)
- *SubGroup* — collapsible heading (Salary entries, Work History entries, Education entries). `defaultCollapsed?: boolean` on the SubGroup marks non-recent entries so they start collapsed on first open.

**Search** — text input pinned above the scroll area; filters by `data-search-label` attribute (label text, not value); auto-expands matching sections/sub-groups; clears restore to the open-time expand state.

**Per-element UI state** — `savedPickerStates: Map<HTMLElement, PickerUIState>` preserves expand/collapse, scroll position, and search query across close/reopen cycles for the lifetime of the page. Only resets on page navigation.

**Outside-click handling** — `activeOutsideHandler` is tracked at module level so `removePicker()` can tear it down before creating a new picker. The handler excludes both the picker element and the owning input (`activePickerElement`) from "outside" so clicking the same input again never closes the picker.

**Date display** — `src/utils/dateFormat.ts` exports `fmtYearMonth("YYYY-MM")` → `"Month YYYY"` (full month names). Used by picker tree builder and resolver virtual paths. Do not inline month formatting elsewhere.

### Why the filler uses a native setter

`filler.ts` captures `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set` at module load and calls it via `.call(element, value)`. React/Vue/Angular install instance-level property descriptors that swallow plain `element.value = x` assignments. The native setter bypasses these, then dispatching `input → change → blur` triggers framework change detection.

`clearFieldValue()` runs the same setter + event sequence twice — once immediately, once via `queueMicrotask`. React reconciles synchronously inside the dispatched `input` event and can restore the filled value before control returns; the microtask pass runs after that synchronous re-render and ensures the field stays empty.

### Highlighter applies background-color directly to the element

`applyHighlight()` writes `element.style.backgroundColor` (and a `transition` for the fade) directly on the input. Original values are saved to `data-jb-orig-background` / `data-jb-orig-transition` and restored on clear. This replaced an earlier underline-`<div>` approach — no scroll/resize listener, no position tracking, no separately-injected DOM. Confidence colour map:

| Confidence | Background |
|---|---|
| ≥ 0.85 | `rgba(34, 197, 94, 0.12)` (green) |
| ≥ 0.60 | `rgba(234, 179, 8, 0.12)` (yellow) |
| 0 | `rgba(239, 68, 68, 0.12)` (red) |

`noData` fields (profile value empty) receive **no** call to `applyHighlight` at all.

---

## Known Traps & Warnings

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

### Work authorization status labels — single source of truth

`src/data/workAuthorization.ts` exports `WORK_AUTH_STATUS_OPTIONS` and `WORK_AUTH_STATUS_LABELS`. This is the **only** place these labels should be defined. `WorkAuthorizationSection.tsx`, `picker.ts`, and `resolver.ts` all import from it. Do not inline status label strings anywhere else — they will silently diverge.

### `DocumentEntry` — URL and file can coexist

`documents.cv` (and `coverLetter`) are `{ url?: string; file?: DocumentFile }` — both fields are optional and **both can be set at the same time**. `DocumentsSection.toDocumentEntry()` intentionally preserves the URL even when in file mode, so uploading a file does not wipe out a previously entered URL. The picker shows only `url`; the file is irrelevant to the picker. Do not change `toDocumentEntry()` back to mutually exclusive storage without understanding this invariant.

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
