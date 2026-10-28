# Job Buddy

## Project Identity

Chrome MV3 extension built with WXT 0.20.26, React 19, TypeScript 5.9, Tailwind CSS v4, and Vitest 4. Single-user application: no backend or database; profile data lives in `chrome.storage.local`. Gemini and Google Drive are optional integrations. Chrome Web Store is the production distribution surface; Firefox build scripts are present.

## Project Config

- ship-method: direct
- git-auto-commit: true
- git-merge-strategy: squash
- readme-style: standard

## Dev Commands

Use Node 22 (`.nvmrc`) and pnpm 11.7.0 (`package.json`).

- `pnpm install`: installs dependencies; postinstall runs `wxt prepare` to generate `.wxt/` types.
- `pnpm dev`: load `.output/chrome-mv3-dev/` unpacked in Chrome.
- `pnpm compile`: TypeScript check; `pnpm lint`: ESLint; `pnpm test:run`: Vitest once.
- `pnpm exec vitest run src/autofill/mapper.test.ts`: example focused test; `pnpm test`: watch mode.
- `pnpm build`: production build; `pnpm zip`: build plus Chrome Web Store archive.
- `pnpm build:firefox`: Firefox build; production release workflow targets Chrome.
- `pnpm format`: Prettier writes; scope formatting to the task.
- `pnpm serve:landing`: serve `docs/`; `pnpm serve:demo`: serve demo on port 8000.
- Integration setup is documented in `.github/SETUP.md`; env template is `.env.example`.

CI runs compile, lint, tests, and build on branch pushes/PRs. Release tags run a separate workflow with compile, lint, tests, zip, Chrome Web Store upload, and GitHub release creation.

## Architecture Pointers

- `entrypoints/content.ts` runs in all matching frames, including about:blank/origin-fallback frames. Preserve its idempotent injection guard.
- `entrypoints/popup/App.tsx` reinjects content scripts into enumerated frames before sending messages with explicit `frameId`. Results aggregate across frames; reopening restores status. Debug uses the frame with most scanned fields; Shift+click the logo after success opens it.
- `entrypoints/background.ts` retries pending Drive sync at startup and debounces profile/mapping changes for five seconds; it also routes options-page deep links through session storage.
- `entrypoints/options/App.tsx` coordinates nine profile editor sections, Resume Import, Learned Mappings, and Settings; implementations are in `src/components/options/`.
- `src/types/profile.ts` is the canonical profile schema. `src/utils/profileValidator.ts` validates imports per section; `src/utils/migrate.ts` normalizes stored profiles.
- `src/autofill/index.ts` owns scan/fill/undo, pending matches, manual-learning watchers, and silent refill. `scanner.ts`, `signals.ts`, `mapper.ts`, `resolver.ts`, and `filler.ts` implement the core pipeline.
- Page-wide phone/language/education/work-history/expected-salary resolution runs after individual mapping. Education/work history/salary share `repeatingEntryResolution.ts`; languages have their own pass.
- `src/resume-ai/gemini.ts` owns extraction/autofill requests; `types.ts` centralizes model priorities/defaults; `prompt.ts` and `autofillPrompt.ts` hold separate prompts. `parser.ts` also powers JSON and Drive import review.
- `src/utils/storageArea.ts` backs local/session wrappers. Low-level gets/removes resolve on failure; local sets reject, session sets are best-effort. `getProfile()` can reject when persisting a migration.
- `src/utils/driveSync.ts` owns Drive OAuth, appdata backup, and retry state. Both restore paths are in `SettingsSection.tsx`.
- `docs/index.html` is a static Tailwind-CDN landing page; `docs/project-site/` is a static overview; `docs/legal/` contains HTML legal pages with shared CSS. `demo-apply-form/` is a fictional local test/screenshot form.

## Domain Rules

- Confidence thresholds live in `src/autofill/constants.ts`: fill at ≥0.60, green at ≥0.85. Yellow fills need review; red stays unfilled; a matched empty profile value is gray/noData with no highlight. Use named constants.
- Preserve two phases: scan stores `pendingMatches`; merge/overwrite consumes them without rescanning. Merge skips existing values; overwrite replaces them.
- Mapper signal order is label, ariaLabel, placeholder, name, id. Layers are learned → autocomplete → exact dictionary → fuzzy → custom-link labels → nearby context. `autocomplete="url"` deliberately has no fixed profile path.
- `mapField()` sees one field. Sibling-dependent ambiguity belongs in a post-pass: phones use a calling-code sibling; languages and expected salary start at index 0; education/work history use current/latest entry for a single occurrence and sequential indices for repeats.
- Rule-based current-status checkbox matching uses an exact-term allowlist, never fuzzy matching. Optional AI separately considers visible non-consent checkbox/radio groups.
- Notice period has distinct virtual paths: `professional.noticePeriod.availableDate` is a calendar date; `.formatted` is a duration. Do not conflate them.
- CV aliases redirect to `documents.cv.url` for non-file inputs. Document URLs and files may coexist; preserve both, including existing cover-letter data.
- Education/work date aliases stay qualified: bare “Start Date”/“End Date” cannot safely distinguish sections. Work dates require `YYYY-MM`; education permits `YYYY` or `YYYY-MM`.
- Use `bestLabel()` for field signals and `displayLabel()` for mapping display text; display-only nearby text must not become a matching key.
- Learned mappings are legacy trusted strings or counted `{ path, count, label? }` entries. Automatic learning starts at 1, needs 2 confirmations, and resets count on conflicting paths. Explicit edits in Learned Mappings save count 2 immediately.
- Manual blur learning matches edited content against `flattenProfileValues()`, not the mapper guess. Use `EDIT_LEARN_*` constants, `saveElementMappings()`, and serialized saves. Nearby text is never a learned matching key.
- Stale mapping paths are flagged “Empty right now,” never automatically corrected/deleted. JSON/Drive imports merge mappings with `mergeLearnedMappings()`; preserve concurrent storage updates.
- AI autofill is additive: all non-green tiers receive a pass; failures silently retain rules; high-confidence AI may replace yellow rule values. AI self-reported confidence never writes learned mappings. Resume import has its own visible error/cancellation flow.
- Options `handleSave` computes derived fields defensively, then performs one profile write; derivation failure must not prevent the raw save. Sections never write `derived` directly.
- When changing `Profile`, audit validator, parser `FIELD_DEFS`, and relevant extraction schema. Preserve Gemini's intentional exclusions (`id`, `derived`, documents/cover letter) rather than blindly adding every field to the prompt.
- JSON export contains profile, learned mappings, application history, and safe metadata. Drive backup contains profile, learned mappings, and lastModified; it does not contain application history. Neither includes Gemini settings or Drive token/state.
- Adding a Drive payload field requires updating `syncProfileToDrive()`, `handleRestoreFromDrive`, and `handleDriveReviewSave`.
- Resume review applies only accepted changes; arrays are replaced as units. Bullet normalization preserves prose context; summary normalization merges soft wraps while preserving paragraphs. PDF hyperlink extraction uses annotations and fails to an empty list.
- Experience merges overlapping work intervals and counts inclusive calendar months. Completion uses 15 checks across the nine editor sections.

## Behavior Rules

- Read and follow the Git and safety rule files listed under Rules before working on the project.
- Work directly on main for ordinary tasks; do not create feature branches/PRs. Local commits are automatic; pushes require separate user authorization.
- Use `useToast` from `src/components/ui/useToast.ts`; `Toast.tsx` owns the provider. Section save flows use `shared/saveSection.ts`; reuse `fieldCls.ts`, dropdown hooks, and `useScrollToNewEntry.ts`.
- Vitest defaults to Node; DOM tests opt in with per-file `// @vitest-environment jsdom`. React Testing Library is installed. Keep tests under `src/`, never under WXT's `entrypoints/`.
- Autofill-matching changes require a build and live verification in a Playwright-driven Chromium against a throwaway form, in addition to relevant unit tests; verify real filled values and form validation/events.
- Preserve Tailwind v4's `@tailwindcss/postcss` setup in the extension; the static landing page has its own CDN setup.

## Hard Safety Rules

- Never read or print `.env.development` or `.env.production`; they contain real OAuth configuration.
- Never push a `v*.*.*` tag without explicit user instruction. `.github/workflows/release.yml` uploads to Chrome Web Store and creates a GitHub release; tag annotations do not select release behavior.
- Keep ESLint on v9.x while using `eslint-plugin-react@7.x`.
- Run `pnpm compile` before every commit; run the relevant existing tests before committing.
- Budget stored document bytes together with the rest of the local profile. Do not raise upload caps without reviewing storage impact.

## Known Traps

- `MonthYearPicker` emits `''` during partial input. Validate required fields at save time; preserve internal partial-entry/resync handling.
- Reset/import must reload the profile before bumping section remount/navigation state inside `handleImportComplete(afterLoad)`.
- Work-authorization labels come from `src/data/workAuthorization.ts`; do not duplicate the status strings.
- Section loaders retain backward compatibility for string phones/work locations, country names, older language proficiency, and currency-only salary rows. Ambiguous shared currencies remain for user selection.
- `normalizeProfile()` defaults missing/invalid salary periods to monthly and adds missing URL schemes; both load/save use it. New on-load migrations belong here.
- Native filling focuses with `preventScroll`, uses captured native setters and real `InputEvent`/`FocusEvent`; preserve placeholder-based date formatting and the microtask clear used against framework reconciliation.
- Deep scanning reaches open shadow roots only; closed roots remain unsupported. Shadow labels must stay scoped to the correct root.
- Dev content/background bundles cannot rely on custom `VITE_*` variables like live popup/options code can. Gemini development fallbacks persist through `storage.ts`.
- Dev builds use amber icons (`wxt.config.ts` and `branding.ts`); production uses blue. Theme initializes before React and follows system/light/dark through the root `.dark` class.
- Drive uses implicit-token OAuth with `drive.appdata`. Development setup requires Web Application OAuth clients with separate dev/prod redirect IDs; see `.github/SETUP.md`.
- Documents UI/import validation cap files at 4 MB, but Resume Import accepts 10 MB and can persist that file. This is an unresolved discrepancy; do not assume a universal 4 MB cap.
- Popup confidence tooltips and parts of `docs/project-site/` still mention a removed picker. A Settings restore comment incorrectly says mappings do not sync independently; background does debounce mapping changes.
- Static site brand colors are duplicated across landing, overview, demo, and legal CSS; update relevant copies together.

## Rules

This project follows the rules shipped in agent-helm:

- .claude/rules/git.md
- .claude/rules/safety.md

At the start of every session, check whether the paths above exist on this machine.
If either is missing, inform the user: "helm rules are referenced in CLAUDE.md but the
plugin is not installed on this machine. Install it with: /plugin install agent-helm"

<!-- last-reviewed: 966a41209b5ab03cb3942cd61e0b364d258fe625 -->
