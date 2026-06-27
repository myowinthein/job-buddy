# Operational Safety Rules

Perform this scan during bootstrap (/update-claude Mode 1).
Update when deployment, infrastructure, or environment configuration changes.
Only document risks supported by evidence in the repository — not assumptions.

## Scan Targets

Review for operational risks:
- CLAUDE.md, .claude/rules, README files, project documentation
- CI/CD pipelines, GitHub Actions, GitLab CI, deployment scripts
- Composer scripts, package scripts, Makefiles, shell scripts
- Docker, Lando, Laravel Sail configuration
- Git remotes, branch structure, protected branches
- .env.example, credential files, service account files, private keys
- Queue config, scheduler config, background job definitions
- Cloud/infrastructure config (AWS, DO, Cloudflare, Elasticsearch, Redis, etc)

## Agent Execution Boundaries

These actions always require explicit confirmation regardless of context:
- git push, force-push, tag creation
- any deployment command
- migrations, database imports, database resets
- infrastructure changes, DNS changes, secret rotation
- destructive operations (resets, drops, clears, environment recreation)

Document any project-specific additions to this list.

## Risk Categories

For each category, scan for evidence and document findings as:
  Risk: one-line description
  Instruction: direct rule for future agents

Avoid vague warnings. Every instruction must be actionable.

**Deployment**
Which branches auto-deploy. Whether automatic or approval-gated.
Whether tests run before deployment. Which envs are affected.

**Git**
Protected branches. Multiple remotes. Force-push exposure.
Mirror repositories. Company-owned or production remotes.

**Database**
Migrations, seeders, bulk scripts, data repair scripts, sync/import jobs
that could affect shared environments.

**Queue & Jobs**
Operations that could duplicate, lose, or disrupt background work.
Scheduler commands that affect shared state.

**Infrastructure**
Cloud storage, CDN, search indexes, caching systems —
operations that should never be performed automatically.

**Secrets & Credentials**
Where they live (env files, credential files, service accounts, keys, certs,
deployment tokens). Never print, commit, copy into docs, or expose in output.
Only identify locations and risks — never reproduce values.

**Destructive Operations**
Commands or scripts that delete data, reset environments, recreate databases,
destroy infrastructure, or clear storage.

**Project-Specific**
Generated code, vendor-managed code, legacy systems, sync processes,
unusual deployment requirements, operational dependencies unique to this repo.

## Environment Classification

For each known environment (local/staging/UAT/production/preview/etc) document:
- purpose
- ownership
- whether shared
- whether persistent (or ephemeral)
- whether safe for testing
- any access restrictions or environment-specific rules

## Minimum Evidence Checklist

Infer from actual CI/hooks/pipelines — only checks the project enforces.
Examples: unit tests, feature tests, linting, static analysis, frontend build,
generated file verification, pre-commit hooks.