# Skills

Claude Code skill package manager — install, create, share, and version skills.

## What is a skill

A skill is a markdown file (`SKILL.md`) that gives Claude Code domain-specific instructions. Skills live in `.claude/skills/<slug>/` and are automatically loaded by Claude Code.

## Skill lifecycle

```
init → edit SKILL.md → push → (others) install → update → diff
```

### Create

```bash
astar skill init                    # scaffolds .claude/skills/<slug>/SKILL.md
# edit the file
astar skill push <slug> --publish   # publish to astar.sh
```

### Install

```bash
astar skill install <slug>          # downloads to .claude/skills/<slug>/
astar skill install <slug> --global # installs to ~/.claude/skills/<slug>/
```

### Update & diff

```bash
astar skill diff <slug>             # LCS diff between local and remote
astar skill update [slug]           # update one or all installed skills
```

## Versioning

Skills stored in Sanity with `manifest.json` containing content hash (SHA-256). The diff engine uses LCS (Longest Common Subsequence) with zero dependencies.

## Health checks

`astar health` validates installed skills:
- Verifies SHA-256 content hash matches remote
- `--fix` flag auto-repairs corrupted/outdated skills
- `--extended` checks global skills, API health, CFA status

## Auto-install

On first `astar login`, the CLI prompts to install `astar-platform` base skill (Y/n). This skill gives Claude Code access to all 38+ MCP tools.

## Storage

Skills stored in Sanity as `knowledgeSkill` document type with fields: title, slug, description, tags, project, content (markdown), manifest (json), published.

## Key files

- `cli/src/commands/skill.ts` — all skill commands
- `cli/src/commands/health.ts` — skill integrity checks
