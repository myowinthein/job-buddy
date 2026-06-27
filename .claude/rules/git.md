# Git Rules

---

## Solo Mode

Activate by declaring in CLAUDE.md:
  git-solo: true

When active:
- Commit directly to main — no feature branches required
- No PR required
- Skip Branch Naming and GitHub Flow sections entirely
- All Universal Rules still apply
- Conventional Commits still apply
- Code quality checks still apply before pushing

---

## Universal Rules

These apply regardless of mode.

**Branches**
- Never commit directly to main or master unless solo mode is active
- Never force push without explicit confirmation
- Never delete unmerged branches without explicit confirmation
- Never delete main, master, or any environment branch
- Never delete a published tag from a public repository
- Delete feature branches immediately after merge

**Commits**
- Every commit on main must leave the codebase in a working state
- One commit per logical unit — if you need "and" to describe it, split it
- Use squash merge when merging feature branches into main

**Safety**
- Never push to any branch without confirmation (covered in .claude/rules/safety.md)

---

## Conventional Commits

All commits must follow this format:
  type(scope): description

  [optional body]

  [optional footer]

**Types:**
- feat — new feature
- fix — bug fix
- refactor — code change, no feature or fix
- test — adding or updating tests
- docs — documentation only
- chore — maintenance, dependencies, tooling
- style — formatting, no logic change
- perf — performance improvement
- ci — CI/CD configuration
- build — build system changes

**Scope:** Required. Use the module, feature, or domain area.
  feat(auth): add OAuth login
  fix(payment): resolve stripe timeout
  refactor(orders): extract service layer

**Breaking changes:**
  feat(auth)!: replace session with JWT

  BREAKING CHANGE: all existing sessions invalidated

---

## Code Quality

After all work for a prompt is complete, before pushing:

**Lint and Formatting**
- Scan for lint and formatter config files and detect tool
- Run lint and formatter — fix all errors before pushing
- Include formatting changes in last logical commit
- Skip silently if not configured — never push with lint errors

**Tests**
- Detect test framework from project files
- Run tests covering changed files — full suite if touching shared/core code
- Skip silently if not configured — never push with failing tests

---

## GitHub Flow (default)

Active when git-solo is not declared in CLAUDE.md.

**Branch structure:**
  main
  feature/*
  fix/*
  chore/*
  refactor/*

**Rules:**
- All branches base from main
- main is always deployable
- Open a PR before merging to main
- Squash merge into main with a conventional commit message
- Delete feature branch immediately after merge
- If CI is configured, it must pass before merge

**Deployment:**
- Push trigger: CI auto-deploys on merge to main
- Tag trigger: CI deploys on SemVer tag via /ship command
- Both can be active simultaneously (push → staging, tag → production)

---

## Branch Naming

Only applies when GitHub Flow is active.

Format: type/short-description
Include ticket number if provided: type/123-short-description

Examples:
  feature/user-authentication
  feature/123-user-authentication
  fix/payment-timeout
  fix/456-payment-timeout
  chore/bump-dependencies
  refactor/extract-payment-service

Types mirror Conventional Commits types.
Use lowercase, hyphens only, no spaces.

---

## Environment Branches (optional)

Independent of strategy. Works with both Solo mode and GitHub Flow.
Detected automatically via: git branch -r

Environment branches are any long-lived branches that are not main,
master, or feature branches — e.g. staging, stage, uat, preprod,
production, prod, or similar.

If no environment branches detected → no additional rules apply.

If environment branches detected, these additional rules apply:

**Rules:**
- Environment branches are permanent — never delete
- Nothing merges directly to environment branches
- All changes flow through main first (upstream-first rule)
- Promote by merging upstream branch into downstream branch
- Hotfixes follow the same rule — main first, then promote
- If CI is configured, it must pass before promoting to next environment

**Promotion flow:**
  main → {environment branches in order}