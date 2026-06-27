# refactor

Full project scan to identify and apply refactoring opportunities.
Run periodically on mature codebases to maintain code quality.

---

## Step 1 — Branch check

Only proceed if on main or master.
If on any other branch, stop and inform user:

"refactor must be run on main or master.
Current branch is {branch}. Please switch and re-run."

---

## Step 2 — Create refactor branch

Propose creating a dedicated branch for refactoring changes:

"I will create refactor/{YYYYMMDD-HHMMSS} from main to keep
changes isolated for review before merging back. Confirm? (yes / no)"

If an existing refactor/* branch is detected, ask:
"Found existing branch {branch}. Continue on this branch or
create a new one? (continue / new)"

On confirmation, create and switch to refactor branch.

---

## Step 3 — Scan boundaries

Scan all project files except:
- vendor/
- node_modules/
- public/
- storage/
- migration files
- .env files
- generated or compiled files

Include test files — test quality degrades fastest and matters most.

---

## Step 4 — Full project scan

Read the entire codebase. Identify refactoring opportunities across:

**Architecture**
- Business logic in wrong layer (controllers, models, routes)
- Missing abstractions (repeated patterns not extracted)
- Inconsistent architectural patterns across modules
- Violated separation of concerns

**Code Quality**
- Redundant or duplicate code
- Overly complex methods (too long, too many responsibilities)
- Dead code (unused classes, methods, variables)
- Inconsistent naming conventions
- Magic numbers or strings without constants

**Performance**
- N+1 query problems
- Missing indexes (inferred from query patterns)
- Inefficient loops or data transformations
- Unnecessary eager loading or missing eager loading

**Tests**
- Missing tests for critical business logic
- Outdated test assertions
- Tests that test implementation rather than behaviour
- Missing edge case coverage

**Dependencies**
- Deprecated methods or classes
- Outdated patterns replaced by framework improvements
- Unnecessary dependencies

---

## Step 5 — Present findings

Group by category, prioritize within each:

Priority levels:
- High   — architectural issues, security concerns, major code smells
- Medium — redundant code, missing abstractions, inconsistent patterns
- Low    — minor improvements, style inconsistencies, small optimizations

Present in this format:

─────────────────────────────────
REFACTORING REPORT
─────────────────────────────────

ARCHITECTURE          {X issues — High: N, Medium: N, Low: N}
─────────────────────────────────
[High] Brief description
      File: path/to/file.php
      Why: one sentence explanation

[Medium] ...

CODE QUALITY          {X issues — High: N, Medium: N, Low: N}
─────────────────────────────────
...

PERFORMANCE           {X issues}
─────────────────────────────────
...

TESTS                 {X issues}
─────────────────────────────────
...

DEPENDENCIES          {X issues}
─────────────────────────────────
...

─────────────────────────────────
TOTAL: {N} issues found
─────────────────────────────────

Then present category selection:

"Which categories to apply?

[ ] Architecture   (N issues)
[ ] Code Quality   (N issues)
[ ] Performance    (N issues)
[ ] Tests          (N issues)
[ ] Dependencies   (N issues)

Reply with numbers, names, or 'all' — e.g. '1 3' or 'architecture performance'
Or 'skip' to exit without applying changes."

Wait for response before proceeding.

---

## Step 6 — Apply refactoring

Apply selected categories one at a time.
For each category:
- Apply all findings in that category
- Run tests if configured — stop and inform if tests fail
- Run lint and formatter
- Commit with conventional message:
  refactor({category}): {brief summary of changes}

Example commits:
  refactor(architecture): extract business logic from controllers
  refactor(quality): remove duplicate helper methods
  refactor(tests): update outdated assertions

Do not proceed to next category if tests fail.
Inform human and wait for resolution before continuing.

---

## Step 7 — Merge and cleanup

Check CLAUDE.md for refactor-merge setting:
  refactor-merge: auto    → merge automatically
  refactor-merge: pr      → push and suggest PR
  Default: pr

**Auto mode:**
- Switch to main
- Merge refactor/{timestamp} into main --no-ff
  with message: refactor(project): apply refactoring {timestamp}
- Delete refactor branch locally and remotely
- Push main

**PR mode:**
- Push refactor/{timestamp} to remote
- Inform user:
  "Refactoring complete. Review changes on refactor/{timestamp}
  and open a PR to merge into main when ready."

---

## Step 8 — Confirm completion

Report:

─────────────────────────────────
REFACTORING COMPLETE
─────────────────────────────────
Branch:   refactor/{timestamp}
Applied:
- Architecture: {N} changes
- Code Quality: {N} changes
- Performance:  {N} changes
- Tests:        {N} changes
- Dependencies: {N} changes

Commits made:   {N}
Tests passing:  yes/no
Merged to main: yes/no (auto) | pending PR (pr mode)
─────────────────────────────────