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

Create a dedicated branch for refactoring changes:
  refactor/{YYYYMMDD-HHMMSS}

If an existing refactor/* branch is detected, ask:
1. Continue on {branch}
2. Create new refactor branch

On selection, create or switch to refactor branch and proceed.

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

Then present multi-select category selection:

  Which categories to apply? (select all that apply)

  [ ] 1. Architecture   (N issues)
  [ ] 2. Code Quality   (N issues)
  [ ] 3. Performance    (N issues)
  [ ] 4. Tests          (N issues)
  [ ] 5. Dependencies   (N issues)
  [ ] 6. All
  [ ] 7. Skip           → exit without applying changes

  Reply with numbers or names — e.g. "1 3" or "architecture performance"

Wait for response before proceeding.

---

## Step 6 — Apply refactoring

Apply selected categories one at a time.
For each category:
- Apply all findings in that category
- Run tests — stop and inform if tests fail
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

Present single-select option to human:

  Refactoring applied. What would you like to do next?

  1. Merge to main automatically and delete refactor branch
  2. Push branch and open PR for review
  3. Leave branch as-is for now

Wait for selection before proceeding.

**Option 1 — Auto merge:**
- Switch to main
- Merge refactor/{timestamp} into main --no-ff
  with message: refactor(project): apply refactoring {timestamp}
- Delete refactor branch locally and remotely
- Push main

**Option 2 — PR:**
- Push refactor/{timestamp} to remote
- Inform user:
  "Branch pushed. Open a PR to merge into main when ready."

**Option 3 — Leave as-is:**
- Inform user:
  "Branch refactor/{timestamp} left intact locally."

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
Outcome:        {merged to main / PR pending / branch left intact}
─────────────────────────────────