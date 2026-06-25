# Job Buddy — Project Memory

## What It Is

Job Buddy is a Chrome browser extension (Manifest V3) that lets job seekers store a rich profile and use it to auto-fill job application forms. Aimed at multi-country job seekers (hence per-country work authorization, per-currency salary, multi-language support).

The extension has three pillars:
1. **Profile editor** — full-page options UI with nine profile sections + Import Resume + Settings
2. **Autofill** — content script scans any page's form fields, maps them to profile values, fills them, and highlights confidence. A second-pass AI layer (Gemini) handles fields the rule pipeline couldn't resolve, plus radio/checkbox groups.
3. **AI Resume Import** — uploads a PDF/DOCX to Gemini and presents a review screen where the user accepts/rejects each suggested change.

All AI features (resume import + autofill assist) require a user-supplied Gemini API key. The extension works fully without one — AI is purely additive.

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
| `background.ts` | Service worker — handles `OPEN_OPTIONS` from content script (picker "Go to Profile →") |
| `content.ts` | Content script matched to `*://*/*`; listens for `AUTOFILL_SCAN` / `AUTOFILL_FILL` / `CLEAR` / `GET_STATUS` / `GET_DEBUG_SESSION` runtime messages and delegates to `src/autofill/` |
| `popup/` | Browser action popup — profile completion %, `Fill Form ✨` button, result summary, AI key nudge. Chrome MV3 destroys the popup on close, so React state is lost; on mount the popup sends `GET_STATUS` to the content script and restores the success view from the content script's `lastResult`. Debug panel is hidden — revealed by **Shift+click the Job Buddy logo** (only available after a fill run). |
| `options/` | Full-page profile editor (9 profile sections + Import Resume + Settings) |

Storage is `chrome.storage.local` (not `sync`). The wrapper in `src/utils/storage.ts` swallows errors and always resolves, so callers don't need rejection handling. `clearAllStorage()` removes profile, learnedMappings, and applicationHistory (used by Settings → Reset). Gemini keys are wiped separately via `clearGeminiSettings()`.

Storage keys:
- `profile` — the user's `Profile` object (includes `id` and `derived`, see below)
- `learnedMappings` — `{ [domain]: { [normalizedSignal]: profileFieldPath } }` — written when the user picks a value from the autofill red-field overlay
- `applicationHistory` — array of `ApplicationEntry` — reserved for dedup/history tracking; no UI yet
- `geminiApiKey` — user-supplied Gemini API key. **Never** included in profile export/import bundles (privacy boundary — see § AI Features).
- `geminiModel` — selected Gemini model ID. Also excluded from export.

`chrome.storage.session` is used for cross-context UI state that should survive popup→options-page handoff but not browser restart: `jb:ai:nudge:dismissed`, `jb:focusOnLoad`.

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
- Active section routing (9 profile sections + `resume` + `settings`, no router library). The `resume` route renders `ResumeImportSection` which initialises directly to the upload dialog — no landing page.
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

The bottom of the sidebar, below the 9 profile sections and the Import Resume entry. Subsections:

| Action | Behavior |
|---|---|
| AI Features | Gemini API key input (`AQ...` placeholder). Sets key + `gemini-3.1-flash-lite` default into storage immediately on format-pass via `checkApiKey()`; background `validateApiKey()` then probes the priority list and quietly upgrades the stored model if a better one is available. Empty input clears both keys via `clearGeminiSettings()`. |
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
scanner.ts     — finds visible input/textarea/select; excludes hidden types.
               File inputs are excluded by default; pass scanFields({ allowFileInputs: true })
               when a CV file is saved. Always skips file inputs with tabindex="-1" (custom
               upload widget pattern — Fluent UI / Fabric / MUI / etc.).
               Also exports scanRadioGroups() and scanCheckboxGroups() used only by the AI
               layer (the rule pipeline never touches radios or checkboxes). Checkbox groups
               are flagged isConsent: true when their label or any option text matches
               CONSENT_TERMS (agree/terms/privacy/gdpr/consent/marketing) — these are
               filtered out before AI ever sees them.
signals.ts     — extracts name/id/placeholder/autocomplete/aria-label/label/nearbyText
normalizer.ts  — lowercase + strip non-alphanumeric
dictionary.ts  — profile-field-path → known signal variations.
               Includes documents.cv.file for resume-upload field detection.
resolver.ts    — dot-notation profile value resolver; handles plain paths via generic
               traversal plus regex-matched virtual paths (phone.full, dateOfBirth.day/month/year,
               address.countryName, salary.current.formatted, salary.expected.N.formatted,
               workAuthorization.N, workHistory.N.{isCurrent,location,startDate.formatted,
               endDate.formatted,arrangement}, education.N.{isCurrent,startDate.formatted,
               endDate.formatted}, documents.cv.file → filename).
mapper.ts      — 4-layer match: learned → autocomplete → dictionary → fuzzy → context
filler.ts      — native input setter + dispatches input/change/blur. Also exports
               fillFileField(element, fileData) for visible file inputs — see § CV file upload.
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

### Silent re-fill on tab refocus

After `executeAutofill()` completes, any `noData` fields are tracked in a module-level `noDataFields: NoDataEntry[]` registry (`{ element, fieldPath, label }`). A single document-level `visibilitychange` listener is registered when the registry is non-empty; on the next `document.visibilityState === 'visible'` event, `runSilentRefill()` runs:

1. Reads a **fresh** profile via `getProfile()` (cross-tab edits visible immediately).
2. For each entry, calls `resolveProfileValue(profile, fieldPath)`.
3. If the value is now non-empty: fills via `fillField`, paints green via `applyHighlight(element, 0.97)`, decrements `lastResult.noData` and increments `lastResult.noReview`, tears down the picker focus listener and any blur watcher for that element, and calls `closePickerIfOpenFor(element)` so the "Go to Profile" CTA disappears.
4. Still-empty entries stay in the registry for the next refocus.

Strict invariants — **none** of the following are re-evaluated on refocus: scanner, signals, mapper, confidence. The scanner/dictionary/resolver pipeline only runs once, at Auto Fill click. Silent re-fill only re-resolves the already-matched profile *path* against the latest profile.

Never touched on refocus: `noReview` (green), `needReview` (yellow), `lowConfidence` (red), manually-edited fields (already promoted to green by the blur watcher), fields filled through the picker, and any field outside the current Auto Fill session.

The listener is torn down on `undoAutofill()` and also when the `noDataFields` registry empties on its own. Manual edits via the blur watcher and silent re-fill both call `noDataFields.filter(...)` to drop the resolved entry — these are the two paths that mutate the registry post-fill.

Picker behavior for `noData`: instead of the normal profile-value tree, the picker renders a focused CTA — *"No {label} saved in your profile yet"* + *"Go to Profile →"* button. The button sends `{ action: 'OPEN_OPTIONS' }` to the background service worker (see `entrypoints/background.ts`), which calls `chrome.runtime.openOptionsPage()`. Because `manifest.options_ui.open_in_tab` is `true`, Chrome focuses an existing Options tab if one is already open instead of duplicating it.

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

### CV file upload (MVP scope)

`filler.fillFileField(element, DocumentFile)` reconstructs a real `File` from `documents.cv.file` (which is stored as a `data:<mime>;base64,...` URL) by decoding base64 → `Blob` → `File`, then attaches via `DataTransfer`:

```
input.files = (new DataTransfer with file added).files;
dispatch input + change events.
```

Returns `boolean` — `false` on any reconstruction failure (corrupt base64, malformed prefix, missing payload). Caller (`executeAutofill`) silently skips elements that return `false` instead of incrementing counters or applying highlight.

**Scope (intentional MVP boundary)** — do not expand without explicit user decision:
- Visible standard `<input type="file">` only.
- Single CV file only (no cover letter, no other doc types).
- Custom upload widgets (Fluent UI / Fabric, MUI, Mantine, drag-drop zones, styled buttons backed by hidden inputs) are **explicitly skipped** via the scanner's `tabindex="-1"` filter. These are Phase 2 and require per-vendor adapters.
- File inputs are excluded from the picker overlay entirely (file selection is silent, not picker-driven).

The `clearFieldValue` path in `filler.ts` is extended for file inputs — it assigns an empty `DataTransfer`'s `files` and dispatches `change`, so Undo Auto-Fill works for file inputs through the existing `sessionElements` registry without special-casing.

### Background service worker (`entrypoints/background.ts`)

Currently handles a single message:
- `{ action: 'OPEN_OPTIONS' }` — calls `chrome.runtime.openOptionsPage()` on behalf of the content script. Used by the picker's "Go to Profile →" CTA on noData fields. Content scripts cannot reliably call `openOptionsPage` directly across browsers; routing through the service worker is the documented-stable path. With `manifest.options_ui.open_in_tab: true` (set in `wxt.config.ts`), Chrome focuses an existing Options tab if one is already open instead of duplicating it.

The popup still talks to the content script directly via `chrome.tabs.sendMessage` (AUTOFILL_SCAN, AUTOFILL_FILL, CLEAR, GET_STATUS) — background is not on that path.

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

### AI layer (`src/autofill/ai.ts`)

Runs **after** the rule pipeline completes — single perceived operation. Users see the combined highlights once both passes finish.

Candidates sent to AI:
- Text/select fields the rule pipeline classified as `lowConfidence` (red) or `noData` with a non-null `match.fieldPath` (gray)
- Radio groups (`scanRadioGroups()`) — never seen by the rule pipeline
- Checkbox groups (`scanCheckboxGroups()`) — never seen by the rule pipeline; consent groups excluded

Never sent: green / yellow fields, file inputs, consent checkboxes, or noData fields with a null fieldPath.

Per-field outcome from AI:
- `high` confidence + actionable value → green highlight (0.97), learned mapping saved per domain for text fields
- `low` confidence + actionable value → yellow highlight (0.70), picker attached
- `null` or empty → field stays in its original state (red/gray)

Failures (no API key, 429, network, parse) are **always silent** — return false (key missing) or true (failed but ran). The user-visible autofill result is the rule-only result on failure. The popup shows a nudge "Add an AI key in Settings to improve autofill accuracy." only when `aiAvailable === false` (no key); other failures show nothing.

Result counters in `AutofillResult` are mutated in place by AI: `lowConfidence`/`noData` decrement, `noReview`/`needReview` increment. `aiAvailable: boolean` is added to the result so the popup can decide whether to render the nudge.

### Debug session (`src/autofill/debug.ts`)

Ephemeral, in-memory only. One session per scan/fill cycle. Lost on tab close. Fetched on demand by the popup via `GET_DEBUG_SESSION`. Renders in the popup `?` icon (only visible after a successful run).

Stages recorded: scanner (one entry per `pendingMatch` with a stable `field_NNN` id), mapping (matchLayer + confidence + final state), AI (per response with confidence + final state), summary (green/yellow/red/gray counts).

The `fieldId` is generated in `scanAutofill()` and threaded through `PendingMatch.debugFieldId` and `AITextCandidate.debugFieldId` so all three stages can be joined. Radio/checkbox AI candidates get fresh debug IDs since they bypass the rule pipeline.

---

## AI Features (`src/resume-ai/`)

User-supplied Gemini key powers both the AI autofill layer and the Resume Import feature. Module layout:

```
types.ts   — GeminiModel union, GEMINI_MODEL_PRIORITY (probe order),
             MODEL_DISPLAY_NAMES, KeyValidationResult.
prompt.ts  — system prompt for resume → Profile JSON extraction.
gemini.ts  — checkApiKey (key validation), validateApiKey (model selection
             probe loop), extractFromResume (resume → JSON), resolveFieldsWithAI
             (autofill assist).
parser.ts  — FIELD_DEFS for the Resume Import review screen; generateDiff
             classifies fields as new/conflict/unchanged; applyChanges
             rebuilds the profile from accepted changes.
```

**Key validation is decoupled from model selection.** `checkApiKey()` calls `GET /v1beta/models?key=...&pageSize=1`: 200 = valid, 401/403 = invalid, anything else = network error. **Do not bundle 400 with 401/403** — the Gemini API returns 400 for unknown model names too, not just bad keys. The model-probe path in `validateApiKey()` inspects the 400 response body for `"api key"` substring before deciding it's a key issue.

**`gemini-2.5-flash-lite` is in `GeminiModel` for stored-model recognition but is intentionally absent from `GEMINI_MODEL_PRIORITY`.** Do not add it without an explicit decision.

**Settings → AI Features save flow:**
1. User types or pastes a key. 800 ms debounce.
2. `checkApiKey()` runs — on `invalid` show red error; on `network_error` reset to idle; on `valid` continue.
3. Save key + `gemini-3.1-flash-lite` (hardcoded default) to storage **immediately** — Import Resume becomes usable before the probe finishes.
4. Background `validateApiKey()` probes the priority list. If it finds a better model, quietly update the stored model. If `keyValidNoModel`, show the yellow "no supported model" warning. If `keyInvalid` (401/403 confirmed), roll back via `clearGeminiSettings()`. Network errors during the probe leave the saved key untouched.
5. `probeIdRef` discards stale probe results if the user edits the key again mid-probe.

**Resume Import (`src/components/options/ResumeImportSection.tsx`)** — opens directly as a dialog (no landing page), file uploads as PDF/DOCX up to 10 MB, sent to Gemini as inline base64 (no client-side text extraction). Review screen groups suggestions by sidebar section and shows only sections with at least one new or conflict field — unchanged fields are not rendered at all. The uploaded file itself appears as a selectable new field in Documents → Resume File; if accepted, it's saved to `profile.documents.cv.file` (preserving any existing `cv.url`).

Retry on network failure jumps directly to `'sending'` step reusing the already-read `fileDataUri` — do not force the user to re-upload.

**429 model fallback** — `extractFromResume` does not throw immediately on a 429. It silently retries every model in `GEMINI_MODEL_PRIORITY` (starting from the user's configured model, then falling through the rest) before surfacing a `rate_limit` error. Only when all models return 429 does the error reach the UI. Other non-2xx responses (401/403, network failures) still throw immediately without fallback.

**All AI failures must be silent.** Never block, never throw to the caller, never show a generic network error. Catch and degrade gracefully.

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

## Environment Variables

`VITE_GOOGLE_DRIVE_CLIENT_ID` is required for Google Drive Cloud Backup (Phase 2). WXT/Vite loads it automatically from the correct file per environment:

| Command | File loaded |
|---|---|
| `pnpm dev` | `.env.development` |
| `pnpm build` / `pnpm zip` | `.env.production` |

Both files are gitignored — contributors must create their own from `.env.example`. **Never hardcode OAuth client IDs in source files.** Access the value in code via `import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID`.

In Google Cloud Console, set the app type to **Web Application** (NOT Chrome Extension — Chrome Extension type only works with `chrome.identity.getAuthToken()` and causes `redirect_uri_mismatch` with `launchWebAuthFlow`). Under Authorized Redirect URIs, register `https://YOUR_EXTENSION_ID.chromiumapp.org/`. Create separate client IDs for dev and production — their extension IDs differ.

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

- **Application history** — `applicationHistory` storage key and `ApplicationEntry` type exist; the key is included in profile export/import bundles, but no dedup or UI consumes it.
- **Custom file-upload widgets** — only visible standard `<input type="file">` works today. ATS widgets that hide the input behind a styled button (Greenhouse, Lever's dropzone, Workday wizard, Fabric/MUI components) are deliberately out of scope — see § CV file upload.
- **Cloud Backup (Phase 2)** — Implemented. Google Drive backup via `drive.appdata` scope (`src/utils/driveSync.ts`). Current OAuth flow: implicit grant (`response_type=token`) via `chrome.identity.launchWebAuthFlow()`. Key design:
  - Single file `job-buddy-profile.json` in `appDataFolder` (invisible in Drive UI), wrapped as `{ lastModified, profile }`
  - Local-first: `chrome.storage.local` remains source of truth; Drive is backup only
  - Sync fires on every profile save and after every profile import (fire-and-forget, never blocks local saves)
  - Connect: if Drive has a backup, runs `generateDiff(localProfile, driveProfile)` and surfaces it through the shared `ImportSummaryDialog` / `ImportReviewScreen` flow. `handleRestoreFromDrive` validates the incoming Drive profile through `validateImportedProfile` before saving (invalid data is rejected with an error toast).
  - Reset has "This device only" / "This device and Google Drive" scope only when Drive is connected; both paths disconnect Drive (`disconnectDrive(false|true)`)
  - Disconnect dialog uses two radio options ("Keep the backup file" / "Delete the backup file") plus a single Disconnect button
  - Settings privacy notice text updates when Drive connects/disconnects
  - Bidirectional sync / background polling deferred to Phase 3
