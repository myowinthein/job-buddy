# ship

## Step 1 — Branch check

Check current branch.

If on environment branch (staging, production, etc):
  Stop and inform user:
  "Environment branches are reflections of main and cannot be used
  as a release source. Please switch to main or master and run /ship
  from there."

If on feature or any other non-main branch:
  Stop and inform user:
  "Feature branches must be merged to main via PR before releasing.
  Please merge your branch, switch to main or master, and run /ship
  from there."

Only proceed if on main or master.

---

## Step 2 — Discover environment branches (first run only)

If environment branches are not recorded in CLAUDE.md:
- Run: git branch -r
- Identify environment branches (staging, production, or similar)
- Record in CLAUDE.md under Project Identity
- Example: "environments: staging, production"

---

## Step 3 — Select deployment targets

If no environment branches exist:
  Skip this step. Deploy to main only.

If environment branches exist, present checkbox:

  Select environments to deploy to:
  [x] main/master (always selected, cannot deselect)
  [ ] staging
  [ ] production

  Default: main/master only.
  Human selects additional environments before proceeding.

---

## Step 4 — Discover version file (first run only)

If version file location is not recorded in CLAUDE.md:
- Scan for package.json, composer.json, VERSION file
- Identify which file holds the version number
- Record in CLAUDE.md under Project Identity
- Example: "version-file: package.json"

---

## Step 5 — Calculate and propose version

Run: git describe --tags --abbrev=0
If no tag exists, ask human to confirm base version before proceeding.

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
- {selected environments}

Confirm release v{proposed}? (yes / no / adjust version)

Wait for confirmation before proceeding.

---

## Step 6 — Run tests

Check CLAUDE.md Dev Commands for test command.
If not recorded, detect test framework and record in CLAUDE.md.
Run full suite — stop and inform human if tests fail.
Do not proceed until tests pass.
Skip silently if no test framework configured.

---

## Step 7 — Execute release

Bump version file to {version}.

Commit, tag, and push main:
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

## Step 8 — Confirm completion

Report:
- Version tagged: v{version}
- Tag pushed: yes
- Environments promoted: {list of environments}
- Deployment triggered: yes/no (based on CI/CD presence)