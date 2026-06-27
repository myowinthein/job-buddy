# test

## Step 1 — Detect test framework

Scan for test framework configuration files and dependencies.

If framework detected → proceed to Assessment.

If no framework detected, present single-select recommendation:

  No test framework detected. Which would you like to use?

  Based on detected stack:
  1. {recommended framework} (recommended)
  2. {alternative}
  3. {alternative}
  4. Skip — I'll set up testing manually

Wait for selection.
If Skip selected → exit and inform user:
  "Configure a test framework and re-run /test."
If framework selected → inform user how to install, then proceed to Assessment.

---

## Assessment

Check recent git activity and existing test coverage:
- Run git diff to identify recently changed files
- Scan for existing test files
- Estimate coverage gaps in recently changed code
- Estimate overall project test coverage

Based on current state, determine which options are valid:

If no existing tests found:
  Present:
  [One sentence — e.g. "No existing tests found. Full scan recommended."]
  1. Full  → scan entire project for missing tests
  2. Skip  → no tests needed

If existing tests found but no recent changes:
  Present:
  [One sentence describing coverage status and recommendation]
  1. Full  → scan entire project for missing tests (recommended)
  2. Skip  → no tests needed

If existing tests found and recent changes detected:
  Form recommendation (Targeted or Full) based on gap significance.
  Pre-select recommended option.
  Present:
  [One sentence describing coverage status and recommendation]
  1. Targeted → write tests for recent changes only (recommended)
  2. Full     → scan entire project for missing tests
  3. Skip     → no tests needed

Wait for user selection before proceeding.

---

## Targeted — Recent Changes Only

Identify recently changed files via git diff against last commit.
Focus only on files that were added or modified.

Before writing, present test plan:

  I will write tests for:
  - {file}: {what will be tested}
  - {file}: {what will be tested}

  Confirm? (yes / no)

Wait for confirmation before proceeding.

Write tests that reflect actual proven behavior — not speculative edge cases.
Follow existing test conventions and file structure in the project.
Place test files according to project's existing test organization.

Run tests after writing — fix if failing before committing.
Commit with:
  test({scope}): add tests for {feature}

---

## Full — Full Project Scan

Scan entire project for untested or undertested code.
Skip: vendor/, node_modules/, generated files, migration files.

Prioritize by risk:
1. Payment and billing logic
2. Authentication and authorization
3. Core business logic
4. API endpoints
5. Data transformation and validation
6. Everything else

Present findings before writing:

─────────────────────────────────
TEST COVERAGE REPORT
─────────────────────────────────

HIGH PRIORITY        {X untested}
─────────────────────────────────
{file}: {what is untested and why it matters}

MEDIUM PRIORITY      {X untested}
─────────────────────────────────
...

LOW PRIORITY         {X untested}
─────────────────────────────────
...

─────────────────────────────────
TOTAL: {N} untested areas found
─────────────────────────────────

Then present multi-select priority selection:

  Which priorities to cover? (select all that apply)

  [ ] 1. High Priority    (N areas)
  [ ] 2. Medium Priority  (N areas)
  [ ] 3. Low Priority     (N areas)
  [ ] 4. All
  [ ] 5. Skip             → exit without writing tests

  Reply with numbers or names — e.g. "1 2" or "high medium"

Wait for response before proceeding.

Write tests priority by priority.
For each priority:
- Write tests reflecting actual proven behavior
- Run tests — stop and inform if failing
- Fix before proceeding to next priority
- Commit with:
  test({scope}): add missing tests for {priority} priority areas

---

## Scope

Tests must reflect actual proven behavior — not speculative edge cases.
Follow existing test conventions, naming, and file structure.
Never push with failing tests.