<!-- helm-rule: agent-helm@v2.22.3 -->
# Git Rules

---

## Project memory and configuration

Applies without a loaded plugin. Resolve configuration before dependent mutations/publication; independent static reads follow Read-only scope. Preserve ownership except for log's explicitly approved shared-layout diff, never unrelated restructuring/settings.

- Start from the current host's project entry: `CLAUDE.md` in Claude, `AGENTS.md` in Codex. Respect active nested instructions and Codex's `AGENTS.override.md` precedence; do not bypass an override by reading only the root file.
- Follow actual bridges (`@AGENTS.md` or explicit read directives), resolving paths from the referring file, not examples. Track visited files; cycles/missing targets block branching/writes. For a readable root CLAUDE.md/AGENTS.md cycle only, log may read each file once, resolve settings before mutations and propose removing the reverse bridge. The log cycle exception covers no other/external cycle or missing target. Never edit imports outside the consumer project.
- If the host entry is absent, read the other entry. `{memory_file}` owns actual Helm settings/project knowledge; a wrapper is not that owner. With neither file, propose root AGENTS.md without creating it just to resolve settings. Shared setup uses AGENTS.md plus CLAUDE.md importing `@AGENTS.md` and any Claude-only additions; shared settings/Rules stay only in AGENTS.md.
- Independent roots: if only one declares recognized settings, it owns memory/configuration; read/preserve the setting-free entry too. Identical declarations supply agreed values, but ambiguous knowledge ownership still blocks a memory write. If neither declares settings, preserve the current host's knowledge owner unless a bridge selects another. Defaults never override another file's explicit values.
- Recognize standalone `## Project Config` declarations and Compass-style fenced `text` introduced as project configuration, regardless of heading scheme. Active keys: `ship-method` (`direct`/`pr`), `git-auto-commit` (`true`/`false`), `git-merge-strategy` (`squash`/`rebase`/`merge`), `readme-style` (`standard`/`custom`). Ignore quoted examples/narrative, not actual declarations. Retired `git-strategy` and `environment-promotion` select no behavior; do not infer an active value from them. If ship-method is absent but git-strategy is declared, block dependent shipping with upgrade guidance rather than silently changing its publication preference.
- Apply host precedence first: an active AGENTS.override.md replaces same-directory AGENTS.md, not a competing owner. Compare applicable roots/targets; conflicting declarations (including duplicate keys within one recognized block), invalid relevant active values or ambiguous ownership block dependent actions. Invalid publication-only settings block dependent ship actions, not independent local edits. Preserve identical duplicates and overrides; do not normalize them or generate over host-specific policy. Host/heading differences never silently change policy.
- Use the defaults below only for genuinely absent settings. Save an authorized setting change in the owner's existing configuration block, preserving its layout; never duplicate it in a bridge. Resolving ownership does not authorize a full-file rewrite.
- Only log migrates/reconciles existing layouts, preserving confirmed values; others preserve existing owners and recommend log for migration. Log may resolve absent settings through explicit pre-mutation choices and freeze local commit policy; unanswered keys use defaults. Changes to existing settings apply next run. Reuse pending approved overlays only after destination declarations/ownership/overrides match preflight; never switch policy mid-run.

## Host capabilities and operational state

Verify the selected working tree and only the capabilities needed for the planned action; folder access proves neither Git/provider access nor an available test environment. Verify results before claiming a commit, merge, push, promotion or checkpoint succeeded. Follow sibling `safety.md` for approval, user-work preservation, capability failures and its **Operational Helm state** boundary: loading rules or switching agents never grants state access/migration, and missing owning procedures leave records untouched. The copied pair remains sufficient for ordinary work without a package/runtime dependency.

### Read-only scope

Labelled local reads may inspect dirty/staged/untracked, detached/no-HEAD/no-repository or unresolved owner/base/settings snapshots. Report unknowns without certifying unresolved scope or inventing defaults. Suppress executable diff/textconv, pager/filesystem-monitor helpers, optional index refresh/lazy fetch where supported; unavailable reads remain unknown. Loading rules/previewing authorizes no fetch, checkout, branch/index/file writes, hooks, tests, builds, installs or live operations. Ordinary coding can coexist with unrelated changes while preserving user work; specialized workflows keep their clean-tree prerequisites. Requested targeted edits, including in uncommitted/untracked files, differ from destructive discard; reset/clean/restore/stash and other ref/index/worktree changes follow safety.md's effect-based authorization boundary, never an automatic cleanup or clean-tree workaround.

## Local work and ship method

Team size and branch topology do not select a Git mode. Ordinary coding and Helm editing commands work locally on their current permitted branch. Log/manifest/legal/adopt require the actual main/master base for Git-backed writes, retaining their documented read-only/bootstrap exceptions. Env/test also permit established current feature branches and confirmed current environment branches; test additionally permits established current maintenance branches. Confirm non-base roles from actual project/deployment evidence or developer classification, not name prefixes alone; unresolved or unsupported roles block dependent writes. Branch eligibility proves neither ownership nor safe runtime targets; existing script/hook/service effect checks remain required. Stronger project policy still applies. Commands requiring base block elsewhere with a reason; never auto-checkout/update base, create a workflow branch, merge, push, open a PR, promote environments or clean up branches to finish them. Preserve each command's own scope, clean-state, review, verification and checkpoint requirements. `refactor` may record/apply on base, an established existing current feature branch or an existing current `refactor/*` branch, with confirmed non-base environments Audit/Plan only even if their names match that prefix. Establish non-base roles from project/deployment evidence or developer classification, never names alone; no branch creation/selection follows. `normalize` may coordinate explicitly approved rewrites of affected existing local branches. `archive` prepares locally on its confirmed source branch, showing its HEAD/exclusions and obtaining Proceed/Cancel before normal pending phases. Read-only archive Audit/Plan and proven prepared/completed report-only exits need no new branch confirmation. Invoke ship separately when publication is wanted.

Configure ordinary shipping in the resolved owner's existing Project Config section or recognized fenced block:

```text
ship-method: direct
# or
ship-method: pr
```

- **direct:** ordinary ship first pushes/verifies the reviewed current branch, then offers explicitly selected independent source-to-target integrations and pushes. Main may select environments; features may select main/environments; environments may select main/other environments except themselves. No selection means source publication only. Explicit ship release alone prepares version/tag publication on integrated main/master. Actual project/provider requirements can block an action; never bypass them or silently change the method.
- **pr:** ordinary ship publishes/verifies its source, then creates/reuses and reads back matching PR/MR handoffs. A feature is its own source and selects main/environment PR targets optionally, with no self-PR or mandatory main target. Main/environment work uses one established ship/* helper into its own hosted branch and the same helper into every selected optional target; never a same-ref self-PR or helper per target. Reuse/prove existing helper/request identity before creation or fast-forward update; names alone are insufficient. Reviews are independent and an environment may accept pending changes before main. Source pushes update all open requests sharing that ref, while merged requests need a new selected request for later changes. No auto-merge, future review/CI wait, source deletion or automatic release follows. Explicit release metadata may need its own PR; only verified integrated main/master is tagged.

Resolve ordinary ship method from a valid explicit `ship-method`; genuinely absent settings default to `pr`. An invalid explicit value blocks dependent shipping without fallback. Unsupported retired-key leftovers follow the stop guard above; no compatibility mapping or automatic configuration cleanup occurs.

Only an explicitly approved settings edit changes publication preferences in the existing recognized owner/block. Preserve unknown settings and overrides; never duplicate a key or edit an adapter as if it were the owner. Existing copied rules may impose independent project restrictions: reconcile real conflicts explicitly rather than silently overriding them.

`git-auto-commit` (default false) governs local commit authorization independently. `git-merge-strategy` (default squash; `squash`, `rebase`, `merge`) governs eligible ship integrations independently of ship method. Squash creates one reviewed integration commit; merge preserves topology through a merge commit; rebase replays only an explicitly reviewed private/unpushed branch before eligible fast-forward integration. A shared/published branch is never implicitly rewritten by this setting. Branch names, deployment mapping and team size remain project facts, not settings inferred from these values.

State the relevant invocation policy once and revalidate it before dependent actions. A base-dependent action resolves `{base_branch}` to the actual main/master from instructions, default branch and refs; ambiguity blocks that action, never guesses/creates/renames a base. Read-only work can report unresolved facts. Ordinary local tasks need not resolve a publication destination or contact a provider to finish.

Rewritten-history publication and private archive backup publication are ship's separately approved specialist routes, not third `ship-method` values. A PR cannot replace published commit IDs. With the package loaded follow ship's verified rewrite/backup procedures; copied rules alone grant neither state access nor a reconstruction of those protocols.

---

## Auto-Commit

Applies to ordinary completed coding tasks and workflow commits, subject to the task's explicit scope, verification requirements and exceptions.

Set with `git-auto-commit` in {memory_file} (Project Config section or the recognized fenced configuration block):
  git-auto-commit: true   → commit automatically after each task

Absence defaults to off — ask for confirmation before committing.

When active:
- Commit a completed coherent unit without another question when authorized by this setting. Read-only work, no-ops and an explicit commit deferral create no commit; incomplete/gated work stays pending.
- Inspect the entire index and exact intended diff before staging. Use literal, exact approved paths, e.g. `git --literal-pathspecs add -- {approved_paths}`; never blindly add directories or use `git add -A`. Preserve unrelated staged/unstaged/untracked files and user hunks, including in shared files. If separation cannot be done without disturbing them, leave the affected commit pending rather than absorbing, resetting or stashing user work.
- Review the staged result, follow scoped Conventional Commits and verify the commit contains only the intended change. A logical unit is one coherent, independently reviewable change, not every small edit.
- Commit approval or auto-commit never approves publication; apply the Publication contract below.

**Exception:** safety.md's bounded commits, including generated legal documents and their integration commits, always require concrete content/commit approval. Reuse that known approval for the same action; auto-commit alone cannot supply it.

---

## Universal Rules

These apply independently of ship method.

**Branches**
- Local commits on main/master or another eligible current branch follow actual project instructions, verification and commit approval; ship method creates no blanket main-commit prohibition
- Rewritten-history publication requires the explicit approved rewrite and fixed-lease contract below
- Never delete unmerged branches without explicit confirmation
- Never delete main, master, or any environment branch
- Never delete a published tag from a public repository
- No automatic branch cleanup follows ordinary work or ship handoff. For separately requested cleanup only, after verified integration and any required publication, safely leave the feature branch. Delete locally only when its tip is an ancestor of `{base_branch}`, no work is pending, and `git branch -d` succeeds. Squash/rebase may leave the original tip outside ancestry: retain and report it rather than substituting `-D`. A separately reviewed destructive cleanup still requires explicit confirmation. Deleting a published remote branch is a push and needs its own confirmation. Failed/pending integration or publication never triggers cleanup.

**Workflow boundaries**
- Ordinary Helm commands finish locally without asking to publish or integrate. No automatic branch creation, switching or cleanup follows.
- Ordinary ship publishes current work and optionally handles explicitly selected same-source targets. Ship release alone performs main/master version/tag/hosted-release work, without automatic fan-out; explicit promote, normalize and archive publication keep their own gates and terminal boundaries. No ordinary push, target integration or PR completion implicitly releases.
- Archive may create explicitly reviewed local payload commits on its approved source branch. Only ship's archive route may publish the payload, perform separately selected post-backup cleanup and create/publish the completion receipt. Preserve exact payload/receipt ancestry; no ordinary PR/squash may fabricate a seal.

**Commits**
- Every commit on `{base_branch}` must leave the codebase in a working state
- One coherent, independently reviewable change per commit; a subject containing "and" does not by itself require a split

### Publication

- Pushes, remote-ref deletions and publishing provider merges need concrete authorization under `safety.md`, separate from provider review. Resolve one actual push URL/destination (including fork mappings), exact refspec/source SHA and observed remote ref. Show redacted identity, commits/diff and deployment effects. Resolve ambiguous/multiple URLs; never assume origin/fetch URL. Material changes invalidate approval.
- Ordinary pushes use explicit bounded refs and `--no-follow-tags`; release tag refs need their own approval. No incidental `--all`, mirror/prune, extra-ref/submodule publication or upstream/config changes. A directly authorized tracking/config task may perform exactly that change without waiving other gates.
- Confirmed rewrites require fixed `--force-with-lease=refs/heads/{branch}:{expected_remote_sha}` and reviewed old history contained in/accounted for by the plan; a lease alone cannot protect unseen work. No plain `--force`, leading `+` or replacing a rejected expectation. Ship's normalize-publication route requires normalize's verified private recovery/map evidence and its stricter exact-ref procedure.
- Recheck exact tips, approval, quality/review/CI/signing/protection before publication. Provider-merge approval precedes its API call; never push the published result again. Read back each actual destination/ref after success or uncertainty before claiming results/retrying. If the approved result is already published, do not repeat it. After verified readback, a safe retry with unchanged destination, refspec, source SHA, expected remote state and effects reuses the same concrete authorization; unexpected movement or changed content requires reconciliation and any missing approval, never a replacement lease or blind force. Unavailable/mismatched proof blocks dependent promotion/cleanup; preserve prior successes.

---

## Conventional Commits

All commits must follow this format:
  type(scope): description

  [optional body]

  [optional footer]

**Types:** `feat` (feature), `fix` (bug), `refactor` (neither feature nor fix), `revert`, `test`, `docs`, `chore` (maintenance/dependencies/tooling), `style` (format only), `perf`, `ci`, `build`.

**Scope:** Required by Helm policy (optional in the external specification). Use the module/folder/domain, e.g. `fix(payment): resolve stripe timeout`. Historical/upstream unscoped commits may be specification-valid but Helm-noncompliant. Loading rules never authorizes history edits; normalization needs its own reviewed task.

**Multi-scope:** Prefer one dominant area. For inseparable equally affected areas, use a short comma-separated scope, e.g. `refactor(log,manifest): merge recommendation blocks`. Broad cross-cutting work uses `project`/`core`, not a long list.

**Scope inference:** use the actual changed module/folder/domain, never a workflow's report category or priority (e.g. `architecture`, `high-priority`). Apply the dominant/multi/cross-cutting choices above; lowercase, one word or hyphenated per scope.

**Breaking changes:**
  feat(auth)!: replace session with JWT

  BREAKING CHANGE: all existing sessions invalidated

The explicit /helm:ship release mode reads full messages: `!` on any type/optional scope or an uppercase `BREAKING CHANGE:` / `BREAKING-CHANGE:` footer is a breaking candidate, proposing major for stable versions and explicitly resolving the project's 0.x policy. Nonbreaking feat proposes minor, fix/perf patch. Other types have no automatic bump, but may receive an explicitly chosen release; mixed history and reverts need contextual review. Empty ranges do not create another release. Scoped types and Conventional Commits case rules apply; do not rewrite history to calculate a version.

---

## Code Quality

Before publication by either ship method, inspect real package/consumer relationships and native check configuration for the changed scope. Preserve required project checks; folder names such as `core` alone do not establish shared effects. No automatic tool installation, unrelated repairs or repository-wide formatting.

- **Lint/format:** run applicable configured checks and fix errors within approved/policy-required scope. Format before the unit's commit, review the actual output and verify the final affected content. Later formatting normally gets a separate scoped commit; do not implicitly amend history. An explicitly requested amend remains possible under its reviewed scope, never an automatic rewrite of shared/published commits. Do not disable hooks or signing.
- **Tests:** run configured tests covering changed files and affected consumers; genuine shared/core changes still require the full suite unless the user/project explicitly authorizes a different coverage plan. Do not run unrelated monorepo suites solely because of a filename. Required failures block publication, including pre-existing failures; report a baseline failure without silently repairing unrelated code or relabelling it passed/unconfigured.
- **Evidence:** report ran/passed, failed, configured-but-unavailable (blocked), not configured (with repository evidence), and user-deferred distinctly. Deferred checks block gates that require them, not independent source work or every local commit. Relevant content/formatting/scope changes invalidate affected local evidence; reuse unchanged evidence only when policy permits. SHA-bound CI must match the new exact tip regardless. Never claim that an unperformed check passed.

**CI gates** remain usable without a loaded helper:

- **Integration:** verify required checks/reviews for the exact intended commit under project policy and provider protection. A permitted direct integration with no pre-integration remote requirement may proceed after applicable local checks; a pipeline merely existing does not invent that requirement. Required remote CI is never replaced by local success: separately approve publication for checks or leave a handoff, without silently changing `ship-method: direct`.
- **Promotion:** configured/applicable CI must succeed for the exact published source SHA before target mutation, or before ship opens a `pr` promotion handoff. That PR's later merge-result checks/review remain pending/not awaited; opening it never satisfies them. No configured/applicable CI is not applicable only with evidence.
- Inspect complete applicable provider results/current attempts, not a fixed recent sample. Unavailable, missing, pending, failed, cancelled, stale, truncated or unknown required results block the affected action. Recheck changed tips. With the package available, its shared CI procedure adds provider details; copied rules retain these gates without it.

---

## Deployment

Independent of ship method and team size.

Determine deployment triggers and targets from repository configuration and applicable provider settings. Do not assume a pipeline or deployment exists because a branch/tag exists or these rules are loaded. Unavailable evidence leaves deployment behavior unknown, not absent or safe.

- A configured push trigger may deploy updates to `{base_branch}` or other explicitly configured branches.
- A configured tag trigger may deploy a matching SemVer tag, including one created through /helm:ship.
- Both may be configured (for example, push → staging and tag → production), or neither. Report only verified behavior and preserve project-specific deployment approvals.

---

## Environment Branches (optional)

Independent of ship method. Names such as staging/stage/uat/preprod/production/prod are candidates, not proven deployments. Confirm each role through project deployment configuration, supported provider mapping or explicit developer classification. Maintenance/release/bot refs are not automatically environments; unknown roles block dependent actions without probing deployments. The actual main/master base retains its base role even if it deploys production.

**Explicit source and target rules:**

- Preserve permanent environment/base refs; never delete them as cleanup.
- Ordinary ship publishes the current branch's reviewed work first (or its main/env PR helper), then optionally sends that same published source independently to selected targets.
- Base can select environments; a feature can select base/environments; an environment can select base/other environments except itself. Main is not mandatory for feature shipping. None finishes after core publication/handoff.
- Helm no longer imposes blanket upstream-first or forbids feature→environment, environment→base or selected environment→other-environment actions. These edges require explicit per-target diff/effect review and valid approval, not inference from names or a default selection. Never chain one selected target's result into another.
- Real project/provider prohibitions, required review and deployment/CI gates remain binding. Do not silently change source, method or targets to evade them. In direct, required PR policy blocks the affected target and offers only a separately reviewed alternative.
- All target actions use the same reviewed source SHA. In pr, a main/env helper is also the optional PR source, not the older hosted main/env. Independent reviews may let an environment accept changes before main; disclose that possibility and the full source-to-target delta, including environment-specific configuration/history.
- Configured/applicable source CI must pass for that exact published source/ref before environment integration or its PR handoff. Source green does not certify a target merge result, review or deployment. Future PR CI/review/merge is pending/not awaited.

PR heads remain moving refs: pushing fixes updates all open PRs sharing the feature/helper, and later commits do not automatically reach an already merged target. Verify observed head identity and do not promise an immutable snapshot. Reuse matching open requests, preserve partial successes and retain branches. Main/env helpers need proven association and safe fast-forward updates, never prefix-only guessing, force or a new helper every run.

Explicit ship promote remains an existing published base/release→selected-env operation, separate from current-branch shipping. It never publishes current env/feature work or silently widens an older exact snapshot to newer main. Ship release has no automatic promotion stage. Ordinary optional merges/PRs create no version/tag/release, even when integrating into main. Retired environment-promotion declarations remain preserved/inert; no chain order is restored.

Env and test permit approved local work on confirmed environment branches under their own scope, clean-state and runtime-safety gates. Refactor keeps confirmed non-base environments Audit/Plan only. A local fix never synchronizes branches automatically; shared fixes may need deliberate upstream application, and ignored env inputs remain worktree-local. Flexible ship targets do not bypass command or project policy. Other local Helm commands never publish or promote.
