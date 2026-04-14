## Versioning

- Current version: `0.0.78`
- **NEVER** bump `0.x.0` without Erik's explicit written approval.
- **NEVER** bump `x.0.0` without Erik's explicit written approval.
- Version lives in `cli/package.json` and `cli/src/index.ts` — keep them in sync.
- The pre-commit hook auto-bumps `0.0.x` **only** when `[Unreleased]` has content. No changelog entries = no version bump.

## Changelog

- Add entries under `## [Unreleased]` for commits that add, change, or fix user-facing behavior.
- The pre-commit hook stamps the version + date and moves entries out of `[Unreleased]` automatically.
- Use [Keep a Changelog](https://keepachangelog.com) categories: `Added`, `Changed`, `Fixed`, `Removed`.
- One bullet per change. Describe what the user sees, not implementation details.
- Skip: internal refactors, comment changes, CI config, non-user-facing fixes.
- Do NOT leave empty version headers in the changelog.

## Wiki

- Update `wiki/` pages when a commit changes a subsystem's behavior, data model, or API surface.
- Each subsystem has its own page under `wiki/<subsystem>/README.md`.
- Focus on how things work, not code duplication. Cover: data model, flow, decisions, gotchas.
- If you add a new subsystem, create a new wiki page and add it to `wiki/index.md`.
