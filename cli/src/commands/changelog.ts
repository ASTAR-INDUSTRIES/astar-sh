import { homedir } from "os";
import { join } from "path";
import type { Command } from "commander";
import { c } from "../lib/ui";

interface ChangelogGroup {
  name: string;
  bullets: string[];
}

interface ChangelogSection {
  version: string;
  date: string;
  groups: ChangelogGroup[];
}

function parseSection(section: string): ChangelogSection | null {
  const lines = section.trim().split("\n");
  const header = lines[0]?.trim();
  if (!header) return null;

  const versionMatch = header.match(/\[([^\]]+)\]\s*-?\s*(.*)/);
  if (!versionMatch) return null;
  const [, version, date] = versionMatch;

  const groups: ChangelogGroup[] = [];
  let current: ChangelogGroup | null = null;

  for (const rawLine of lines.slice(1)) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("### ")) {
      current = { name: trimmed.slice(4), bullets: [] };
      groups.push(current);
      continue;
    }

    if (trimmed.startsWith("- ")) {
      if (!current) {
        current = { name: "Changed", bullets: [] };
        groups.push(current);
      }
      current.bullets.push(trimmed.slice(2));
      continue;
    }

    if (current?.bullets.length) {
      current.bullets[current.bullets.length - 1] += ` ${trimmed}`;
    }
  }

  return {
    version,
    date: date.trim(),
    groups: groups.filter((group) => group.bullets.length > 0),
  };
}

function categoryPrefix(name: string): string {
  if (name === "Added") return `${c.green}+${c.reset}`;
  if (name === "Fixed") return `${c.yellow}*${c.reset}`;
  if (name === "Changed") return `${c.cyan}~${c.reset}`;
  if (name === "Removed") return `${c.red}-${c.reset}`;
  return `${c.dim}•${c.reset}`;
}

function categoryColor(name: string): string {
  if (name === "Added") return c.green;
  if (name === "Fixed") return c.yellow;
  if (name === "Changed") return c.cyan;
  if (name === "Removed") return c.red;
  return c.white;
}

export function registerChangelogCommand(program: Command) {
  program
    .command("changelog")
    .description("Show recent changes to the CLI")
    .option("--all", "Show full changelog")
    .action(async (opts: { all?: boolean }) => {
      const clgPath = join(homedir(), ".astar", "cli", "CHANGELOG.md");
      const file = Bun.file(clgPath);

      if (!(await file.exists())) {
        console.log(`${c.dim}No changelog found. Run astar update first.${c.reset}`);
        return;
      }

      const content = await file.text();
      const parsed = content
        .split(/^## /m)
        .filter((section) => section.trim() && !section.startsWith("# "))
        .map(parseSection)
        .filter((section): section is ChangelogSection => Boolean(section))
        .filter((section) => section.groups.length > 0);

      if (!parsed.length) {
        console.log(`${c.dim}No changelog entries found.${c.reset}`);
        return;
      }

      const limit = opts.all ? parsed.length : 5;

      console.log("");
      for (const section of parsed.slice(0, limit)) {
        const versionLabel = section.version === "Unreleased"
          ? `${c.bold}${c.yellow}Unreleased${c.reset}`
          : `${c.bold}${c.cyan}v${section.version}${c.reset}`;

        console.log(`  ${versionLabel}${section.date ? ` ${c.dim}— ${section.date}${c.reset}` : ""}`);

        for (const group of section.groups) {
          console.log(`  ${c.bold}${categoryColor(group.name)}${group.name}${c.reset}`);
          for (const bullet of group.bullets) {
            console.log(`  ${categoryPrefix(group.name)} ${bullet}`);
          }
        }
        console.log("");
      }

      if (!opts.all && parsed.length > limit) {
        console.log(`  ${c.dim}${parsed.length - limit} more section(s) — run with --all${c.reset}`);
        console.log("");
      }
    });
}
