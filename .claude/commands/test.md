# test

## Step 1 — Detect test framework

Scan for test framework configuration files and dependencies.

If framework detected → proceed to Assessment.

If no framework detected, use AskUserQuestion:
  AskUserQuestion:
    question: "No test framework detected. Which would you like to set up? (based on detected stack)"
    header:   "Framework"
    multiSelect: false
    options:
      - label: "{recommended framework} (Recommended)"
        description: "{why it fits this stack}"
      - label: "{alternative}"
        description: "{brief reason}"
      - label: "{alternative}"
        description: "{brief reason}"
      - label: "Skip"
        description: "I'll set up testing manually"

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

Use AskUserQuestion (single-select) based on current state:

If no existing tests found:
  AskUserQuestion:
    question: "{one sentence, e.g. 'No existing tests found — a full scan is recommended.'}"
    header:   "Test scope"
    multiSelect: false
    options:
      - label: "Full scan (Recommended)"
        description: "Scan entire project for missing tests"
      - label: "Skip"
        description: "No tests needed"

If existing tests found but no recent changes:
  AskUserQuestion:
    question: "{one sentence describing coverage status and recommendation}"
    header:   "Test scope"
    multiSelect: false
    options:
      - label: "Full scan (Recommended)"
        description: "Scan entire project for missing tests"
      - label: "Skip"
        description: "No tests needed"

If existing tests found and recent changes detected:
  Form recommendation (Targeted or Full) based on gap significance.
  Put recommended option first.

  Targeted is the recommendation:
  AskUserQuestion:
    question: "{one sentence describing coverage status and recommendation}"
    header:   "Test scope"
    multiSelect: false
    options:
      - label: "Targeted (Recommended)"
        description: "Write tests for recently changed files only"
      - label: "Full scan"
        description: "Scan entire project for missing tests"
      - label: "Skip"
        description: "No tests needed"

  Full is the recommendation:
  AskUserQuestion:
    question: "{one sentence describing coverage status and recommendation}"
    header:   "Test scope"
    multiSelect: false
    options:
      - label: "Full scan (Recommended)"
        description: "Scan entire project for missing tests"
      - label: "Targeted"
        description: "Write tests for recently changed files only"
      - label: "Skip"
        description: "No tests needed"

---

## Targeted — Recent Changes Only

Identify recently changed files via git diff against last commit.
Focus only on files that were added or modified.

Before writing, present test plan:

  I will write tests for:
  - {file}: {what will be tested}
  - {file}: {what will be tested}

  AskUserQuestion:
    question: "I will write tests for:\n- {file}: {what will be tested}\n- {file}: {what will be tested}\n\nProceed?"
    header:   "Confirm"
    multiSelect: false
    options:
      - label: "Write tests (Recommended)"
        description: "Proceed with the test plan above"
      - label: "Cancel"
        description: "Exit without writing tests"

Wait for response before proceeding.

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

Then use AskUserQuestion for priority selection:
  AskUserQuestion:
    question: "Which priorities to cover?"
    header:   "Priorities"
    multiSelect: true
    options:
      - label: "High Priority"
        description: "{N} areas — payment, auth, core business logic"
      - label: "Medium Priority"
        description: "{N} areas — API endpoints, data transformation"
      - label: "Low Priority"
        description: "{N} areas — everything else"

  Selecting none = skip. Do not add an explicit All or Skip option.

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