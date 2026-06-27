### Init
```shell
# Go to the project root
cd "[project]"

# Create .claude/commands if it doesn't exist
mkdir -p .claude/commands

# Create or open sync-memory.md
code .claude/commands/ship.md
```

### Prompt
```text
# ship

## Step 1 — Branch check

Check current branch.

If on main or master:
  Proceed normally — full ship flow including version tagging.

If on environment branch (staging, production, etc):
  Proceed with promotion only — no version tagging.
  Inform user:
  "On {branch}. Promoting to next environment only — no version tagging."

If on feature or any other branch:
  Stop and inform user:
  "Feature branches must be merged to main via PR before releasing.
  Please merge your branch, switch to main or master, and run /ship
  from there."

---

## Step 2 — Select deployment targets (main branch only)

Skip this step if on environment branch — proceed directly to Step 6.

Discover environment branches via: git branch -r
Filter for known environment names (staging, production, or similar).

If no environment branches exist:
  Skip this step. Tag and push main only.

If environment branches exist, present selection:

  Select environments to deploy to:
  [x] main/master (always selected, cannot deselect)
  [ ] staging
  [ ] production

  Default: main/master only.
  Wait for human selection before proceeding.

---

## Step 3 — Calculate and propose version (main branch only)

Skip this step if on environment branch — proceed directly to Step 6.

Detect version file by scanning for package.json, composer.json, VERSION file.
Read current version from detected file.

Run: git describe --tags --abbrev=0
If no tag exists, ask human to confirm base version before proceeding.

**Detect commit style**
Scan last 20 commits for Conventional Commits pattern (feat/fix/chore format).

If Conventional Commits detected:
  Run: git log {last_tag}..HEAD --oneline
  Read commit messages and scan file changes.

  Triage by commit type:
  - feat              → minor bump candidate
  - fix               → patch bump candidate
  - feat! or BREAKING CHANGE → major bump candidate
  - chore, docs, style, ci, build → ignore for version calculation

  Calculate next version based on highest-priority commit type:
  - Any BREAKING CHANGE or feat! → major bump
  - Any feat (no breaking change) → minor bump
  - Only fix/patch types → patch bump

  Present to human:

  Current version: v{last_tag}
  Next version:    v{proposed}

  Commits included:
  - {list of feat and fix commits, skip chore/docs/style}

  Deployment targets:
  - {selected environments from Step 2}

  Select an option:
  1. Confirm v{proposed}  (recommended)
  2. Other               → prompt human to enter custom version

  Wait for selection before proceeding.

If Conventional Commits not detected:
  Inform human:
  "Conventional Commits not detected in this repo.
  Version cannot be calculated automatically.
  Consider adopting Conventional Commits for future auto-versioning.
  Current version: v{last_tag}
  What should the next version be?"

  Wait for human to input version before proceeding.

---

## Step 4 — Run tests

Run full test suite using detected test framework.
If tests fail, stop and inform human:
"Tests failed. Fix before releasing."
Do not proceed until tests pass.
Skip silently if no test framework detected.

---

## Step 5 — Execute release on main

Only run this step if on main or master.

Bump version in detected version file to {version}.

Scan README.md for version references (badges, inline mentions).
If found, update to {version}. Skip silently if none found.

Commit, tag, and push:
- git add -A
- git commit -m "chore(release): bump version to {version}"
- git tag -a v{version} -m "Release v{version}"
- git push origin HEAD
- git push origin v{version}

For each selected environment branch:
- git checkout {environment}
- git merge main --no-ff -m "chore(deploy): promote main to {environment} for v{version}"
- git push origin {environment}
- git checkout main

---

## Step 6 — Execute promotion on environment branch

Only run this step if on environment branch.

Determine next environment in promotion chain:
  staging    → production
  production → no further promotion, inform human and exit

If next environment exists:
  git push origin {current_branch}
  Inform human:
  "Pushed {current_branch}. CI/CD will deploy to corresponding server."

If no next environment (already on production):
  Stop and inform human:
  "Already on production. Nothing to promote further."

---

## Step 7 — Confirm completion

If on main or master:
  Report:
  - Version tagged:        v{version}
  - Tag pushed:            yes
  - README updated:        yes/no
  - Environments promoted: {list or none}
  - Deployment triggered:  yes/no (based on CI/CD presence)

If on environment branch:
  Report:
  - Branch pushed:         {branch}
  - Promoted to:           {next environment}
  - Deployment triggered:  yes/no (based on CI/CD presence)
```