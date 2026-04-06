## Versioning

- Current version: `0.0.53`
- Only bump `0.0.x` per commit. Each commit = one patch bump.
- **NEVER** bump `0.x.0` without Erik's explicit written approval.
- **NEVER** bump `x.0.0` without Erik's explicit written approval.
- Version lives in `cli/package.json` and `cli/src/index.ts` — keep them in sync.

## Changelog

- Update `CHANGELOG.md` with every commit that adds, changes, or fixes user-facing behavior.
- Add entries under the `## [Unreleased]` header. The pre-commit hook auto-replaces it with the version + date.
- Use [Keep a Changelog](https://keepachangelog.com) categories: `Added`, `Changed`, `Fixed`, `Removed`.
- One bullet per change. Describe what the user sees, not implementation details.
- Skip: internal refactors, comment changes, CI config, non-user-facing fixes.
