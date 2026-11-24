<!-- helm-rule: agent-helm@v3.10.0 -->
# Git Rules

Applies on Claude, Codex and copied-rule sessions without an installed plugin. Resolve only the policy needed for the requested action. Loading this rule starts no workflow, execution, publication or history rewrite. Follow sibling `safety.md` for authorization, user-work preservation and operational-state boundaries. External links support policy maintenance, not mandatory online reading for each task.

## Project memory and configuration

Resolve configuration before dependent writes; independent static reads may report unresolved facts.

- Start from the active host entry: `CLAUDE.md` in Claude, `AGENTS.override.md` when present or otherwise `AGENTS.md` in Codex. Respect nested instructions and actual host precedence; an override replaces its same-directory entry. Follow real imports/read directives relative to their source, not quoted examples. Track visited files; missing targets and cycles block dependent writes. Only log may reconcile a readable root AGENTS.md/CLAUDE.md cycle through its reviewed layout procedure. Never edit an imported file outside the project.
- `{memory_file}` is the resolved knowledge/configuration owner, not its importing wrapper. If the host entry is absent, inspect the other entry. With neither, Ship uses absent-setting defaults without requiring instruction setup; other workflows propose shared setup through log. Never create files merely to resolve settings. The normal shared layout is AGENTS.md plus CLAUDE.md importing it; preserve an existing custom layout until an authorized reconciliation.
- For independent roots, the only file declaring recognized settings owns shared memory/configuration; preserve the other entry. Identical declarations supply agreed values but do not settle ambiguous knowledge ownership for a memory write. With neither declaring settings, retain the current host's knowledge owner unless an actual bridge selects another. Conflicting declarations, including conflicting duplicate keys, invalid relevant values or unresolved ownership block only dependent actions. Invalid publication-only settings do not block independent local editing. Preserve identical duplicates, unknown settings and overrides rather than normalizing them.
- Recognize plain or Markdown-bulleted `key: value` declarations under `## Project Config`, plus Compass-style fenced `text` explicitly introduced as project configuration. Ignore quoted examples and narrative. Recognized keys are `ship-method` (`direct`/`pr`), `git-auto-commit` (`true`/`false`), `git-merge-strategy` (`squash`/`rebase`/`merge`) and `readme-style` (`standard`/`custom`). New configuration uses one bullet per setting; preserve supported existing formats. Defaults apply only to absent values, never an explicit `false`.
- Retired `git-strategy` and `environment-promotion` select no behavior. If `ship-method` is absent but `git-strategy` remains, block dependent shipping with upgrade guidance; do not silently choose a new method, migrate keys or restore an old promotion order.
- Save an authorized setting change only in the owner's existing configuration block, preserving its format and unrelated content; do not duplicate settings in a wrapper or replace the owner. Only log reconciles layouts and supplies its approved first-run absent-key overlay. It freezes invocation commit policy, reuses pending answers only against unchanged raw declarations/overrides, and applies changes to existing settings next invocation. Other workflows preserve ownership and follow their own setting-write scope; resolving configuration grants no migration permission.

## Host capabilities and operational state

Verify the selected worktree and only the capabilities needed for the action. Folder access proves neither Git/provider access nor a usable test environment. Verify actual outcomes before claiming a commit, integration or publication succeeded. Follow [safety.md's operational-state boundary](safety.md#operational-helm-state): rule loading and agent switching grant no ledger, bundle, locator or recovery-file access. Specialist access requires its loaded owning procedure; copied rules alone supply none.

### Read-only scope

Static local inspection may use dirty/staged/untracked, detached/no-HEAD/no-repository or unresolved-policy inputs, labelled with their limits. Suppress executable diff/textconv, pagers, filesystem-monitor helpers, optional index refresh and lazy fetching where supported. Failed reads remain unknown. Inspection alone authorizes no fetch, checkout, hooks, tests, builds, installs or mutations. Ordinary targeted coding can coexist with unrelated work; workflow-specific clean-state gates remain binding. Never reset, restore, clean, stash or commit user work as an automatic prerequisite workaround.

## Local work and ship method

Ordinary work stays on its current permitted branch. Each invoked workflow owns its branch eligibility, preparation, review and completion requirements; follow those requirements without inventing a branch from its name. Resolve an actual main/master base only when the action requires it, using project instructions/default refs; ambiguity blocks that action. No automatic branch creation, switching, update, integration, publication or cleanup follows local editing. Helm publication belongs to ship.

| Setting | Values | Default | Meaning |
|---|---|---|---|
| `git-auto-commit` | `true`, `false` | `true` | Authorize completed local commits after required verification, subject to explicit deferral and stronger content-approval rules. |
| `ship-method` | `direct`, `pr` | `direct` | Direct publication/integration of reviewed work, or publication followed by PR/MR review handoffs. Neither selects targets, approves a push or grants auto-merge/release authority. |
| `git-merge-strategy` | `squash`, `rebase`, `merge` | `squash` | One reviewed integration commit, replay of reviewed private/unpushed work, or preserved merge topology. A rebase preference never authorizes rewriting shared/published history. |

These choices are independent; team size, branch names and deployment topology do not set them. State relevant invocation policy once and revalidate it before dependent effects. Preserve explicit values; change preferences only through an authorized setting edit. Reconcile stronger project/provider restrictions rather than changing method, source or target to evade them. Local work need not contact a provider or resolve a push destination merely to finish.

For publication, review the actual source, targets and method. Optional target actions use the same reviewed published source independently, never another target's merge result. A PR is a review handoff, not integration or a frozen snapshot: later pushes affect open PRs sharing its source, while merged targets do not receive them automatically. Verify request/source identity, avoid same-ref or duplicate PRs, and never guess helper ownership from a prefix. Ship owns its source/helper reuse, target-routing and release procedures; no automatic upstream-first order, release, promotion or branch deletion is implied here.

## Auto-Commit

With `git-auto-commit: true`, commit completed coherent work without another question after its required checks. Otherwise obtain concrete commit approval. Read-only work, no-ops, explicit deferrals and incomplete/gated work create no commit.

- Inspect the full intended content/diff and current index. Stage only exact approved paths/hunks with literal pathspecs, e.g. `git --literal-pathspecs add -- {approved_paths}`; never blindly stage directories or use `git add -A`. Preserve unrelated staged, unstaged and untracked work. If safe separation is unavailable, leave the affected commit pending.
- Review the complete outgoing staged diff and subject against project/user policy, then verify the actual commit subject and paths. One logical unit is a coherent, independently reviewable change, not each file or small edit.
- Auto-commit and local commit approval grant no publication authority. Public legal-document commits and other [bounded commitments](safety.md#agent-execution-boundaries) retain exact content/commit approval even when auto-commit is enabled; reuse sufficient approval for that same result.

## Universal Rules

- Keep each commit coherent and the base branch working. A subject containing “and” does not by itself require splitting the change.
- Add the committing agent's own `Co-authored-by: Name <email>` trailer to new commits. Preserve existing trailers without duplicates; do not investigate authorship, search private history or ask for attribution confirmation.
- Preserve actual base/environment branches and public published tags. No automatic cleanup follows a task. Separately requested local cleanup uses `git branch -d` only after verified integration/publication requirements, ancestry to the actual base and no pending work. Squash/rebase non-ancestry is a reason to retain the branch, not substitute `-D`. Other destructive exceptions need exact approval and cannot waive the protected-ref prohibitions; remote deletion is publication.
- Confirm environment roles from deployment configuration, supported provider mappings or developer classification, not names such as `staging` or `production`. Actual main/master remains the base even when deployed to production. Preserve intentional environment differences; local fixes never synchronize branches or ignored env inputs automatically.

### Publication

- Obtain concrete authorization for every push, remote-ref deletion and publishing provider merge, separately from provider review. Bind it to one actual push destination/repository, explicit refs, source SHA, observed remote state, reviewed outgoing content and effects, including deployment. Resolve fork/multiple-URL ambiguity; a fetch URL or `origin` name alone is insufficient.
- Use bounded explicit refspecs and `--no-follow-tags`. Release tags need their own approval. No incidental `--all`, mirror/prune, extra refs/submodule pushes, upstream changes or automatic PR merges. A directly authorized tracking/configuration change covers only that effect.
- History rewriting needs its own reviewed scope and fixed `--force-with-lease=refs/heads/{branch}:{expected_remote_sha}`. Git's [explicit-lease documentation](https://git-scm.com/docs/git-push) explains why an implicit lease can be undermined by background fetches. The fixed expectation must cover the remote history reviewed for replacement; it never proves unseen work safe. No plain `--force`, leading `+`, refreshing a rejected expectation or protection/check bypass. Without a loaded specialist procedure, do not reconstruct normalize proof, private recovery or archive seals; ship owns verified-history and separately approved replacement/backup publication.
- Recheck relevant tips, content, policy, checks/reviews, signing and deployment effects before publication. Provider merges require approval before their API call; do not push their published result again. Read back actual destinations after success or uncertainty. An already-published result needs no repeat. A retry reuses approval only when destination, refs, source, fixed expected state and effects still match; unexpected movement requires reconciliation. Unverified results block dependent integration, promotion or cleanup while preserving earlier successes.

## Conventional Commits

Based on [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/), with the following specification baseline and Helm conventions.

**Specification baseline:**

- **Header:** a noun type, optional parenthesized noun scope identifying a codebase section, optional `!`, then a required colon and space before a short description of the changes. Use `feat` for new features and `fix` for bug fixes; other types are allowed.
- **Body:** optional and free-form, including multiple paragraphs; begin it one blank line after the description.
- **Footers:** optional, one or more, after a blank line following the body or header. Each uses a word token in `Token: value` or `Token #value`. Hyphenate token whitespace, except in `BREAKING CHANGE`. Values may contain spaces and newlines; the next valid token/separator pair starts another footer.
- **Breaking changes:** any type may use `!` immediately before `:`, a `BREAKING CHANGE: description` footer, or both. `BREAKING-CHANGE` is a synonymous footer token. With `!`, the header description must explain the break; the breaking footer is optional.
- **Case:** interpret message fields case-insensitively, except that breaking footer tokens must be uppercase.

**Helm conventions:** Explicit project or user commit policy takes precedence over these defaults. Helm commits use the scoped format below; `[!]` means an optional `!`, not literal brackets:

```text
type(scope)[!]: description

[optional body]

[optional footer(s)]
```

**Types:** Helm's default type set is `feat` (feature), `fix` (bug), `refactor` (neither feature nor fix), `revert`, `test`, `docs`, `chore` (maintenance/dependencies/tooling), `style` (format only), `perf`, `ci`, `build`. This is Helm policy, not an exhaustive specification list.

**Scope:** Required by Helm policy (optional in the external specification). Use the actual changed module/folder/domain, not a review category or priority; lowercase, one word or hyphenated per scope. Prefer one dominant area, a short comma-separated scope for inseparable equally affected areas, or `project`/`core` for broad cross-cutting work. For example, `fix(payment): handle expired cards` and `refactor(log,manifest): merge recommendation blocks`. Historical/upstream unscoped messages can be specification-valid but Helm-noncompliant; loading rules never authorizes changing them.

Use a body when it adds non-obvious rationale or important tradeoffs; straightforward changes need none. Google's [description guidance](https://google.github.io/eng-practices/review/developer/cl-descriptions.html) explains the value of preserving intent that the diff cannot show. Bodies and trailers retain useful context; no mandatory body length or new approval stage follows.

A breaking footer can stand without `!` or a body:

```text
refactor(auth): replace the session store

BREAKING CHANGE: existing sessions must be renewed
Refs #123
```

Ship's selected release procedure owns version assessment from full messages and actual compatibility changes. Commit formatting alone authorizes no version bump, tag or publication.

## Code Quality

Choose verification for ordinary development and workflows from actual changed behavior, package/consumer relationships and established check configuration. Preserve project-required local, CI, integration and publication gates. Do not install tools, fix unrelated code or run repository-wide formatting automatically.

### Verification scope

- **Select by impact.** Use the smallest established set that covers the change and affected consumers, including relevant new/modified tests and known failures. Trace shared contracts, callers, fixtures, configuration, dependencies and generated inputs; filenames, extensions and changed lines alone do not prove isolation. Documentation may need builds/link checks; Markdown implementing agent behavior needs its relevant package/workflow checks. State the selected scope and deciding reason briefly, without a separate report or routine approval question.
- **Get useful feedback first.** Prefer fast focused checks before slower integration/browser/system checks when each adds needed evidence. Use supported runner selectors and confirm the intended cases actually ran; an unexpected zero-case result is unverified. If selection costs more than an already cheap adequate suite, run that suite. If the runner cannot isolate the needed cases, use its smallest adequate existing suite. Do not invent filters, install impact-analysis tooling or run overlapping suites merely to progress from small to large.
- **Broaden when justified.** Run a full suite when explicitly required, when affected behavior spans the project, or when impact cannot be reliably bounded. Traced shared changes may use the affected packages' suites when that covers their consumers and required gates. Broader runner, dependency or fixture effects, unexplained failures and missing selection evidence require reassessment and wider checks where needed. A shared filename or completed task alone does not require a full run; time or token savings never justify unsupported exclusions.
- **Reuse matching passes.** Reuse verified results while their relevant source/tests, fixtures, dependencies, configuration, tools, environment and policy still match. Unknown mutable or external inputs prevent reuse for affected checks. Rerun invalidated checks after changes or failure investigation, not automatically per file, phase, commit or final response. Do not repeat until green or discard earlier failures; deliberate repetition for flake, concurrency or performance evidence needs a concrete reason. Exact-SHA CI requirements remain binding.
- **Report proportionately.** Give actual commands, tested scope, outcomes, reused results and material limits. Prefer concise supported output or bounded log excerpts while retaining failure diagnostics. Distinguish passed, failed, configured-but-unavailable, not configured with evidence, and explicitly deferred checks. A focused pass does not establish whole-project health. Required failures block dependent publication; deferred checks remain unverified and block their applicable gates.

[ISTQB's impact-analysis guidance](https://istqb.org/wp-content/uploads/2024/11/ISTQB_CTFL_Syllabus_v4.0.1.pdf#page=31) informs regression selection; [fast-feedback guidance](https://martinfowler.com/articles/practical-test-pyramid.html#PuttingTestsIntoYourDeploymentPipeline) informs execution order. [Bazel's test-cache rules](https://bazel.build/docs/user-manual#cache-test-results) illustrate input-bound reuse, without requiring that tool.

### Formatting and result integrity

Format within approved scope before the unit's commit, inspect the output and verify final affected inputs. Later formatting normally gets a separate scoped commit; an amend needs its own reviewed authority, especially for shared/published history. Never disable hooks or signing.

Required baseline failures block dependent gates; never relabel an unperformed check passed or an unavailable check unconfigured. Deferred verification need not block independent work or every local commit, subject to project and owning-workflow policy.

**CI gates** also apply in copied-rule sessions:

- **Integration:** meet project/provider-required checks and reviews for the exact intended commit. Where no pre-integration remote gate is required, a permitted direct local integration may follow applicable local checks; merely having a pipeline invents no extra gate. Local results never substitute for required remote CI. A separately approved push for checks does not change `ship-method`.
- **Promotion:** configured/applicable source CI must succeed for the exact published source SHA/ref before an environment integration or PR handoff. Establish not-applicable with evidence. A target PR's future merge-result checks/review remain pending, not awaited or certified by opening it.
- Inspect complete applicable current results, not a fixed recent sample. Missing, pending, failed, cancelled, stale, truncated or unknown required evidence blocks the affected action. Recheck changed tips and preserve prior successes. The loaded shared CI/provider procedures own host-specific retrieval and handoffs; they add no universal provider lookup to ordinary local work.

## Deployment

Determine actual push/tag triggers and targets from repository configuration and applicable provider settings only when relevant to the requested action. A branch, tag or loaded rule proves no deployment. Report verified effects before approved publication and honor project-specific deployment gates; unavailable evidence remains unknown. Push and tag triggers may deploy different environments, both or neither. Publication, a PR handoff, integration and successful deployment remain separate results.
