# update-readme

Before doing anything, check current branch.
Only proceed if on `main` or `master`.
If on any other branch, stop and inform the user:

"update-readme must be run on main or master.
Current branch is {branch}. Please switch and re-run."

---

## Assessment

Check README.md:
- Does it exist?
- Does it have content?
- Is there a saved commit hash? (look for `<!-- last-reviewed: {hash} -->`)
- If hash exists, run `git log {hash}..HEAD --oneline` to see the gap
- How significant is the gap? (ignore: bug fixes, styling, dependency updates, routine CRUD)

Based on assessment, form a recommendation: Full or Gap.

Then present to the user in this exact format:

[One sentence describing README.md status and your recommendation]

* Auto     → proceed with recommended mode
* Full     → rewrite from full project scan
* Gap      → update based on changes since last review
* Skip     → no update needed

Wait for user selection before proceeding.

---

## Full — Full Project Scan

Before writing anything, investigate:
- Business purpose and target audience
- Technology stack and major dependencies
- Installation requirements and steps
- Core usage patterns and CLI commands
- Public API surface (if any)
- License, contributing model, maintainers

Write README.md following the Standard Readme spec section order.
Include only sections relevant to this project — do not force all sections.

Mandatory sections (always include):
- Title (must match repo/package name)
- Short Description (under 120 chars, matches package.json description field)
- Table of Contents (if README will exceed 100 lines)
- Install
- Usage
- Contributing
- License (must be last section before the comment tag)

Include when relevant:
- Badges (CI, version — keep minimal)
- Long Description (only if short description is insufficient)
- Background (useful if the "why" behind the project is non-obvious)
- API (if the project has a public interface)

Skip unless specifically needed:
- Banner, Security, Thanks, Maintainers, Extra Sections

Sections must appear in the order listed by the spec.
Do not invent sections outside the spec.

At the end of the file, append:
`<!-- last-reviewed: {current HEAD commit hash} -->`

Ask for confirmation before writing.

---

## Gap — Changes Since Last Review

Read commit messages first to get the shape of what changed.
Then read file changes only for significant commits — skip: bug fixes,
styling, dependency updates, routine CRUD.

Focus on: new features, API changes, new install steps, changed usage,
changed CLI commands, new env vars, removed functionality.

For each significant change, identify which README section is affected.
Update only those sections. Do not rewrite unaffected sections.

Update the saved commit hash at the end of the file to current HEAD.

Propose changes per affected section. Ask for confirmation before writing.

---

## Scope

README.md = human-facing documentation (contributors, GitHub visitors, new users).
Not a changelog. Not a technical spec. Not a deployment manual.
Audience is humans, not future Claude sessions — keep it clear and scannable.