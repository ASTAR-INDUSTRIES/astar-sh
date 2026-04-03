import { homedir } from "os";
import { join } from "path";
import type { Command } from "commander";
import { c } from "../lib/ui";

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
      const sections = content.split(/^## /m).filter((s) => s.trim() && !s.startsWith("# "));
      const limit = opts.all ? sections.length : 5;

      console.log("");
      for (const section of sections.slice(0, limit)) {
        const lines = section.trim().split("\n");
        const header = lines[0];

        const versionMatch = header.match(/\[([^\]]+)\]\s*-?\s*(.*)/);
        if (!versionMatch) continue;
        const [, version, date] = versionMatch;

        if (version === "Unreleased") continue;

        console.log(`  ${c.bold}${c.cyan}v${version}${c.reset}${date ? ` ${c.dim}— ${date.trim()}${c.reset}` : ""}`);

        for (const line of lines.slice(1)) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          if (trimmed.startsWith("### ")) {
            continue;
          }

          if (trimmed.startsWith("- ")) {
            const category = lines.slice(1, lines.indexOf(line)).reverse().find((l) => l.trim().startsWith("### "));
            const prefix = category?.includes("Added") ? `${c.green}+${c.reset}`
              : category?.includes("Fixed") ? `${c.yellow}*${c.reset}`
              : category?.includes("Changed") ? `${c.cyan}~${c.reset}`
              : category?.includes("Removed") ? `${c.red}-${c.reset}`
              : `${c.dim} ${c.reset}`;
            console.log(`  ${prefix} ${c.dim}${trimmed.slice(2)}${c.reset}`);
          }
        }
        console.log("");
      }

      if (!opts.all && sections.length > limit) {
        console.log(`  ${c.dim}${sections.length - limit} more version(s) — run with --all${c.reset}`);
        console.log("");
      }
    });
}
