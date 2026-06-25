#!/usr/bin/env bash
# scripts/release.sh — guided version bump, tag, and push.
# Reads version from package.json, shows commits since last tag, suggests
# the next version, lets the user override, commits the bump, tags it, and
# pushes both to origin. The Release workflow takes over from the tag push.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# ── Pre-flight ───────────────────────────────────────────────────────────────

if [[ -n "$(git status --porcelain)" ]]; then
  echo "✗ Working tree is not clean. Commit or stash changes first." >&2
  git status --short
  exit 1
fi

BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || echo "")
if [[ "$BRANCH" != "main" ]]; then
  read -r -p "⚠ You are on '$BRANCH', not main. Continue? [y/N] " yn
  [[ "$yn" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 1; }
fi

# ── Current version ──────────────────────────────────────────────────────────

CURRENT=$(node -p "require('./package.json').version")
echo "Current version: $CURRENT"
echo

# ── Commits since last tag ───────────────────────────────────────────────────

LAST_TAG=$(git tag --list 'v*.*.*' --sort=-v:refname | head -n1 || true)
if [[ -n "$LAST_TAG" ]]; then
  echo "Commits since $LAST_TAG:"
  echo "─────────────────────────────────────────────"
  git log --oneline "${LAST_TAG}..HEAD"
  echo "─────────────────────────────────────────────"
  RANGE="${LAST_TAG}..HEAD"
else
  echo "No previous version tag found. Showing recent commits:"
  echo "─────────────────────────────────────────────"
  git log --oneline -n 20
  echo "─────────────────────────────────────────────"
  RANGE="HEAD"
fi
echo

# ── Suggest next version ─────────────────────────────────────────────────────

IFS='.' read -r MAJOR MINOR PATCH <<<"$CURRENT"

LOG=$(git log --pretty=format:'%s' "$RANGE" 2>/dev/null || true)
if [[ -z "$LOG" ]]; then
  SUGGEST="patch"
  REASON="No new commits — defaulting to patch."
elif echo "$LOG" | grep -qE '^[a-z]+(\([^)]+\))?!:' || echo "$LOG" | grep -qiE 'BREAKING CHANGE'; then
  SUGGEST="major"
  REASON="Detected breaking change marker (e.g. 'feat!:' or 'BREAKING CHANGE')."
elif echo "$LOG" | grep -qE '^feat(\([^)]+\))?:'; then
  SUGGEST="minor"
  REASON="Detected one or more 'feat:' commits — new functionality added."
else
  SUGGEST="patch"
  REASON="Only fixes/chores/docs since last tag — no new features detected."
fi

NEXT_PATCH="$MAJOR.$MINOR.$((PATCH + 1))"
NEXT_MINOR="$MAJOR.$((MINOR + 1)).0"
NEXT_MAJOR="$((MAJOR + 1)).0.0"

case "$SUGGEST" in
  patch) SUGGESTED_VERSION="$NEXT_PATCH" ;;
  minor) SUGGESTED_VERSION="$NEXT_MINOR" ;;
  major) SUGGESTED_VERSION="$NEXT_MAJOR" ;;
esac

echo "Suggestion: $SUGGEST → $SUGGESTED_VERSION"
echo "Reasoning:  $REASON"
echo
echo "Choose:"
echo "  1) patch → $NEXT_PATCH"
echo "  2) minor → $NEXT_MINOR"
echo "  3) major → $NEXT_MAJOR"
echo "  4) custom (enter your own X.Y.Z)"
echo "  q) quit"
echo
read -r -p "Selection [default: $SUGGEST]: " choice
choice=${choice:-$SUGGEST}

case "$choice" in
  1|patch) NEW_VERSION="$NEXT_PATCH" ;;
  2|minor) NEW_VERSION="$NEXT_MINOR" ;;
  3|major) NEW_VERSION="$NEXT_MAJOR" ;;
  4|custom)
    read -r -p "Enter version (X.Y.Z, no leading v): " NEW_VERSION
    ;;
  q|quit) echo "Aborted."; exit 0 ;;
  *) echo "✗ Unknown selection." >&2; exit 1 ;;
esac

if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "✗ '$NEW_VERSION' is not a valid SemVer X.Y.Z." >&2
  exit 1
fi

if git rev-parse "v$NEW_VERSION" >/dev/null 2>&1; then
  echo "✗ Tag v$NEW_VERSION already exists." >&2
  exit 1
fi

echo
echo "About to:"
echo "  • Bump package.json: $CURRENT → $NEW_VERSION"
echo "  • Commit:            chore(release): bump version to $NEW_VERSION"
echo "  • Tag:               v$NEW_VERSION"
echo "  • Push commit + tag to origin (triggers Release workflow)"
echo
read -r -p "Proceed? [y/N] " yn
[[ "$yn" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }

# ── Apply ────────────────────────────────────────────────────────────────────

node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  pkg.version = '$NEW_VERSION';
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

git add package.json
git commit -m "chore(release): bump version to $NEW_VERSION"
git tag "v$NEW_VERSION"
git push origin HEAD
git push origin "v$NEW_VERSION"

echo
echo "✓ Released v$NEW_VERSION"
echo "  Release workflow: https://github.com/$(git config --get remote.origin.url | sed -E 's|.*github\.com[:/](.+)\.git|\1|')/actions"
