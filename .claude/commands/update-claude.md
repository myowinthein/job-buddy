# update-claude

Before doing anything, check current branch.
Only proceed if on `main` or `master`.
If on any other branch, stop and inform the user:

"update-claude must be run on main or master.
Current branch is {branch}. Please switch and re-run."

---

## Assessment

Check CLAUDE.md:
- Does it exist?
- Does it have content?
- Is there a saved commit hash? (look for `<!-- last-reviewed: {hash} -->`)
- If hash exists, run `git log {hash}..HEAD --oneline` to see the gap
- How significant is the gap? (ignore: bug fixes, styling, dependency updates, routine CRUD)

Based on assessment, form a recommendation: Full or Gap.

Then present to the user in this exact format:

[One sentence describing CLAUDE.md status and your recommendation]

* Auto     → proceed with recommended mode
* Full     → force full project scan
* Gap      → update based on changes since last review
* Skip     → no update needed

Wait for user selection before proceeding.

---

## Full — Full Project Scan

Before writing anything, investigate in this order:
1. Understand the business purpose of the application
2. Identify major modules and workflows
3. Identify technology stack and important versions
4. Identify major architectural patterns (from implementation, not folder names)
5. Identify high-level development conventions
6. Identify domain rules and business constraints
7. Identify operational context and common development workflows
8. Review existing docs, README, .claude/rules

Then write CLAUDE.md using the six-section schema:
1. Project Identity (name, stack, purpose, blast radius)
2. Dev Commands (install, run, test single file, migrate, logs)
3. Architecture Pointers (key files with one-line why, not summaries)
4. Behavior Rules (autonomy model, confirmation gates, test requirements)
5. Hard Safety Rules (invariants, never-do list — keep brief, detail in .claude/rules/safety.md)
6. Known Traps (initially empty or inferred from README warnings)

CLAUDE.md is not: a README, a file listing, a code walkthrough,
a technical spec, or a changelog. Only include information a future
session would struggle to discover quickly from the codebase alone.

Do not create or modify .claude/rules during full scan unless explicitly
requested. Safety findings should be proposed, not auto-written.

At the end of the file, append:
`<!-- last-reviewed: {current HEAD commit hash} -->`

Be concise. Target under 150 lines. Do not pad.
Ask for confirmation before writing.

---

## Gap — Changes Since Last Review

Read commit messages first to get the shape of what changed.
Then read file changes only for significant commits — skip: bug fixes,
styling, dependency updates, routine CRUD.

Focus on: architectural changes, new modules, new conventions, domain
rule changes, new operational knowledge, newly discovered traps.

Before adding anything, apply the three-question filter:
1. Will a future session struggle to find this from the codebase?
2. Would knowing it improve future development decisions?
3. Will it stay true for weeks or months?

Only update if all three are yes. Durable knowledge includes:
architecture decisions, development conventions, domain knowledge
(business rules, lifecycle rules, permissions), operational knowledge,
and project traps. Does not include: bug fixes, refactors, styling,
dependency updates, routine CRUD, completed tasks, temporary workarounds.

Only record what is supported by evidence — code, config, docs, or
repository structure. No assumptions, preferences, or speculation.

Prefer improving existing content over adding new content.
Merge overlapping entries, remove outdated ones, improve clarity first.
Apply the same review to .claude/rules files.

Update the saved commit hash at the end of the file to current HEAD.

Then provide one of two outcomes:

Outcome A — no update required
Brief explanation why no durable knowledge was introduced.

Outcome B — update required
Describe what was learned, why it belongs in project memory,
and the exact changes to make. Propose as a diff per section.
Ask for confirmation before writing.

---

## Scope

CLAUDE.md = descriptive project knowledge (orientation layer).
.claude/rules/ = prescriptive rules (architecture, safety, git, testing).
Keep them consistent. Update rule files when conventions change.