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

Based on current state, use AskUserQuestion (single-select) to present options:

If README.md is absent or empty:
  AskUserQuestion:
    question: "{one sentence status, e.g. 'README.md not found — a full scan is required.'}"
    header:   "Update mode"
    multiSelect: false
    options:
      - label: "Full scan (Recommended)"
        description: "Rewrite README.md from a complete project scan"
      - label: "Skip"
        description: "No update needed"

If README.md exists but has no saved commit hash:
  AskUserQuestion:
    question: "{one sentence status and recommendation}"
    header:   "Update mode"
    multiSelect: false
    options:
      - label: "Full scan (Recommended)"
        description: "Rewrite README.md from a complete project scan"
      - label: "Skip"
        description: "No update needed"

If README.md exists with a saved commit hash:
  Form a recommendation (Full or Gap) based on gap significance.
  Put the recommended option first.

  Gap is the recommendation (small or moderate gap):
  AskUserQuestion:
    question: "{one sentence status and recommendation}"
    header:   "Update mode"
    multiSelect: false
    options:
      - label: "Gap update (Recommended)"
        description: "Update only sections affected by commits since last review"
      - label: "Full scan"
        description: "Rewrite README.md from a complete project scan"
      - label: "Skip"
        description: "No update needed"

  Full is the recommendation (large or significant gap):
  AskUserQuestion:
    question: "{one sentence status and recommendation}"
    header:   "Update mode"
    multiSelect: false
    options:
      - label: "Full scan (Recommended)"
        description: "Rewrite README.md from a complete project scan"
      - label: "Gap update"
        description: "Update only sections affected by commits since last review"
      - label: "Skip"
        description: "No update needed"

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

Write directly — no approval needed.

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

**Writing style**
- Use em-dashes sparingly. Only use one when no other punctuation
  (comma, semicolon, colon, or a new sentence) works as well.
  When in doubt, restructure the sentence instead.