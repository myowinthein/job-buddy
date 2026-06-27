# test

## Assessment

Check recent git activity and existing test coverage:
- Run git diff to identify recently changed files
- Scan for existing test files and framework
- Estimate coverage gaps in recently changed code
- Estimate overall project test coverage

Based on assessment, form a recommendation: Targeted or Full.

Then present to the user in this exact format:

[One sentence describing test coverage status and your recommendation]

* Auto     → proceed with recommended mode
* Targeted → write tests for recent changes only
* Full     → scan entire project for missing tests
* Skip     → no tests needed

Wait for user selection before proceeding.

---

## Targeted — Recent Changes Only

Identify recently changed files via git diff against last commit.
Focus only on files that were added or modified.

Before writing, present test plan:

"I will write tests for:
- {list of files and what will be tested}

Confirm? (yes / no)"

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

Then present category selection:

"Which priorities to cover?

[ ] High Priority    (N areas)
[ ] Medium Priority  (N areas)
[ ] Low Priority     (N areas)

Reply with numbers, names, or 'all'.
Or 'skip' to exit without writing tests."

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
If no test framework configured, inform user and exit:
"No test framework detected. Configure testing before running /test."