# CLAUDE Maintenance

Your task is to review the work completed during this session and determine whether project memory should be updated.

The goal is to keep project knowledge accurate, concise, and valuable for future Claude sessions.

Do not assume that every session requires an update.

Most sessions should result in either:

- No changes required
- Small targeted updates

⸻

Core Principle

CLAUDE.md is a project memory file.

Rule files under .claude/rules contain project-specific development rules.

Neither should become:

- a changelog
- a task log
- a sprint report
- a commit history
- a release note

Only preserve information that improves future development decisions.

⸻

Review Scope

Review the work completed during the current session.

Inspect:

- code changes
- created files
- modified files
- deleted files
- configuration changes
- architectural changes
- documentation changes
- newly discovered project knowledge

Review:

- CLAUDE.md
- .claude/rules
- project documentation

Determine whether anything learned during this session should become long-term project knowledge.

Ensure CLAUDE.md and rule files remain consistent.

⸻

Evidence Requirement

Before updating project memory, ensure the information is supported by evidence from:

- code
- configuration
- documentation
- repository structure
- completed implementation work

Do not record:

- assumptions
- guesses
- preferences
- speculative conclusions

Only preserve information supported by evidence.

⸻

Information That SHOULD Be Added

Only update project memory when the session introduced durable knowledge.

Architecture Decisions

Examples:

- introduction of a new architectural pattern
- migration from one pattern to another
- new layer responsibilities
- new project structure conventions

Example:

Business logic now lives in Services.

Controllers should remain thin.

⸻

Development Conventions

Examples:

- coding standards
- naming conventions
- testing requirements
- API response conventions
- validation conventions

Example:

All new API responses must use API Resources.

⸻

Domain Knowledge

Examples:

- business rules
- workflow restrictions
- lifecycle requirements
- permission rules

Example:

Only one active subscription may exist per customer.

⸻

Operational Knowledge

Examples:

- deployment workflows
- CI requirements
- infrastructure processes
- recurring operational procedures

Example:

Queue workers must be restarted after deployment.

⸻

Project Traps & Warnings

Examples:

- newly discovered limitations
- migration hazards
- generated code restrictions
- legacy system constraints

Example:

Do not edit generated API client files directly.

⸻

Agent Safety Rules

Examples:

- deployment safeguards
- branch restrictions
- database safety rules
- secret-handling requirements

Example:

Never push to main without explicit confirmation.

⸻

Information That SHOULD NOT Be Added

Do not update project memory for:

- bug fixes
- refactors
- styling changes
- dependency updates
- routine CRUD features
- completed tickets
- completed tasks
- temporary workarounds
- implementation details that are obvious from code

Examples that should NOT be added:

- Fixed login bug
- Added user profile page
- Updated button styling
- Refactored API controller

These belong in source control history, not project memory.

⸻

Update Criteria

Before adding information, ask:

Question 1

Will a future Claude session have difficulty discovering this information quickly from the codebase?

Question 2

Would knowing this information improve future development decisions?

Question 3

Is this likely to remain true for weeks or months?

Only add information when the answer to all three questions is yes.

⸻

Existing Content Review

Review existing project memory.

When appropriate:

- remove outdated information
- remove duplicate information
- merge overlapping sections
- improve clarity
- shorten unnecessarily verbose content

Prefer improving existing content over adding new content.

⸻

Rule File Review

Review existing rule files under:

.claude/rules

When appropriate:

- remove obsolete rules
- merge overlapping rules
- update rules that no longer match project reality
- improve clarity and consistency

Rule files should remain concise and actionable.

Avoid unnecessary growth.

⸻

Quality Control

Avoid growth for the sake of growth.

A larger CLAUDE.md is not automatically better.

More rule files are not automatically better.

If a new section provides little future value, do not add it.

If existing content is no longer accurate, update or remove it.

Maintain a high signal-to-noise ratio.

⸻

Output Requirements

Provide one of the following outcomes.

Outcome A — No Update Required

Explain briefly why no durable project knowledge was introduced.

Example:

No update required.

The session consisted of routine implementation work.

No architecture, convention, domain, operational, or safety knowledge changed.

⸻

Outcome B — Update Required

Describe:

- what new knowledge was discovered
- why it belongs in project memory
- the exact changes that should be made

Apply updates directly to:

- CLAUDE.md
- relevant rule files when necessary

⸻

Final Goal

Future Claude sessions should be able to quickly understand:

- how the project works
- how development should be performed
- important business rules
- operational requirements
- project constraints
- common mistakes to avoid

Only preserve information that improves future development decisions.